import {
  type ValidationRun as ValidationRunView,
  ValidationFindingsUpdatedEvent,
  type ValidationTarget,
  VALIDATION_SCOPE_NOTE,
} from '@ai-designer/contracts';
import { newId, type Prisma } from '@ai-designer/db';
import {
  CONSTRAINT_SETS,
  type ConstraintSet,
  constraintSetFor,
  type DesignFinding,
  type FindingCounts,
  type GarmentDesignState,
  runDesignValidation,
  semanticHash,
} from '@ai-designer/garment-model';
import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';

import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { RevisionService } from '../designs/revision.service.js';
import { WorkingCopyService } from '../designs/working-copy.service.js';

/** Working-copy runs kept per design (older ones are superseded; revision runs are kept). */
export const KEEP_WORKING_COPY_RUNS = 5;

type RunRow = Prisma.ValidationRunGetPayload<{ include: { findings: true } }>;

const refOf = (s: Pick<ConstraintSet, 'key' | 'version'>) => `${s.key}@${s.version}`;

/**
 * Design-structure validation (SS-12, I20): evaluates a working copy (at its current version) or a
 * revision with the pure engine from `@ai-designer/garment-model`, stores the run and its findings,
 * and reports staleness (FR-EDT-121). Owns `constraint_sets`, `validation_runs`,
 * `validation_findings`. Results describe design structure only — never production readiness.
 */
@Injectable()
export class ValidationService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(ValidationService.name);
  private readonly setIds = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly workingCopies: WorkingCopyService,
    private readonly revisions: RevisionService,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('validation_run', {
      label: 'Validation run',
      organizationOf: async (id) =>
        (
          await this.prisma.validationRun.findFirst({
            where: { id, design: { deletedAt: null } },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      governedBy: async (id) => {
        const run = await this.prisma.validationRun.findFirst({
          where: { id },
          select: { design: { select: { projectId: true } } },
        });
        return run ? { type: 'project', id: run.design.projectId } : null;
      },
    });
  }

  /** Records every constraint set version the code knows (never changes an existing one). */
  async onApplicationBootstrap(): Promise<void> {
    for (const set of CONSTRAINT_SETS) await this.ensureSet(set);
  }

  private async ensureSet(set: ConstraintSet): Promise<string> {
    const ref = refOf(set);
    const cached = this.setIds.get(ref);
    if (cached) return cached;
    const rules = set.rules.map((r) => `${r.id}@${r.version}`);
    const existing = await this.prisma.constraintSet.findUnique({
      where: { key_version: { key: set.key, version: set.version } },
    });
    if (existing) {
      if (existing.rules.join(',') !== rules.join(','))
        this.logger.error(
          { alert: 'constraint_set_changed', constraintSet: ref },
          'constraint set rules changed without a version bump — bump the version',
        );
      this.setIds.set(ref, existing.id);
      return existing.id;
    }
    const row = await this.prisma.constraintSet.upsert({
      where: { key_version: { key: set.key, version: set.version } },
      create: {
        id: newId(),
        key: set.key,
        version: set.version,
        label: set.label,
        garmentTypes: set.garmentTypes === '*' ? ['*'] : [...set.garmentTypes],
        rules,
        ranges: set.ranges as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
    this.setIds.set(ref, row.id);
    return row.id;
  }

  /** RunValidation: evaluates the target now (or returns the identical stored run). */
  async run(
    ctx: AuthzContext,
    designId: string,
    body: { target: ValidationTarget; revisionId?: string | undefined },
  ): Promise<ValidationRunView> {
    const target = await this.loadTarget(ctx.organizationId, designId, body);
    const set = constraintSetFor(target.state.garmentType);
    const ref = refOf(set);
    const hash = semanticHash(target.state);
    // Same target, same state, same set ⇒ same findings (CST-004): reuse the stored run.
    const same = await this.prisma.validationRun.findFirst({
      where: {
        organizationId: ctx.organizationId,
        designId,
        targetType: body.target,
        revisionId: target.revisionId,
        targetVersion: target.version,
        constraintSetRef: ref,
        stateHash: hash,
      },
      include: { findings: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (same) return this.view(same, await this.currentVersion(same));

    const report = runDesignValidation(target.state, set);
    const setId = await this.ensureSet(set);
    const runId = newId();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.validationRun.create({
        data: {
          id: runId,
          organizationId: ctx.organizationId,
          designId,
          targetType: body.target,
          revisionId: target.revisionId,
          targetVersion: target.version,
          stateHash: hash,
          constraintSetId: setId,
          constraintSetRef: ref,
          status: 'completed',
          counts: report.counts as unknown as Prisma.InputJsonValue,
          requestedBy: ctx.userId,
        },
      });
      if (report.findings.length)
        await tx.validationFinding.createMany({
          data: report.findings.map((f, position) => this.findingRow(ctx, runId, f, position)),
        });
      if (body.target === 'working_copy') await this.prune(tx, ctx.organizationId, designId);
      await this.outbox.append(
        tx,
        ValidationFindingsUpdatedEvent,
        {
          organizationId: ctx.organizationId,
          designId,
          runId,
          target: body.target,
          targetVersion: target.version,
          constraintSet: ref,
          errors: report.counts.errors,
          warnings: report.counts.warnings,
          manualReview: report.counts.manualReview,
        },
        { organizationId: ctx.organizationId },
      );
      return tx.validationRun.findUniqueOrThrow({
        where: { id: runId },
        include: { findings: { orderBy: { position: 'asc' } } },
      });
    });
    return this.view(row, target.revisionId ? null : target.version);
  }

  /** Latest run for the working copy (with staleness) or for a revision. */
  async latest(
    ctx: AuthzContext,
    designId: string,
    query: { target: ValidationTarget; revisionId?: string | undefined },
  ): Promise<{ run: ValidationRunView | null }> {
    if (query.target === 'revision' && !query.revisionId)
      throw new AppError('VALIDATION_FAILED', 'Name the revision to read', {
        field: 'revisionId',
      });
    const row = await this.prisma.validationRun.findFirst({
      where: {
        organizationId: ctx.organizationId,
        designId,
        targetType: query.target,
        ...(query.target === 'revision' ? { revisionId: query.revisionId! } : {}),
      },
      include: { findings: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { run: row ? this.view(row, await this.currentVersion(row)) : null };
  }

  async get(ctx: AuthzContext, runId: string): Promise<ValidationRunView> {
    const row = await this.prisma.validationRun.findFirst({
      where: { id: runId, organizationId: ctx.organizationId },
      include: { findings: { orderBy: { position: 'asc' } } },
    });
    if (!row) throw AppError.notFound('Validation run');
    return this.view(row, await this.currentVersion(row));
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async loadTarget(
    organizationId: string,
    designId: string,
    body: { target: ValidationTarget; revisionId?: string | undefined },
  ): Promise<{ state: GarmentDesignState; version: number; revisionId: string | null }> {
    if (body.target === 'revision') {
      if (!body.revisionId)
        throw new AppError('VALIDATION_FAILED', 'Name the revision to validate', {
          field: 'revisionId',
        });
      // Hash-verified on every read (FR-PRJ-023).
      const { row, state } = await this.revisions.loadVerified(
        this.prisma,
        organizationId,
        body.revisionId,
        designId,
      );
      return { state, version: row.revisionNumber, revisionId: row.id };
    }
    const { state, version } = await this.workingCopies.currentSnapshot(organizationId, designId);
    return { state, version, revisionId: null };
  }

  private findingRow(
    ctx: AuthzContext,
    runId: string,
    f: DesignFinding,
    position: number,
  ): Prisma.ValidationFindingCreateManyInput {
    return {
      id: newId(),
      organizationId: ctx.organizationId,
      runId,
      findingId: f.findingId,
      position,
      ruleId: f.ruleId,
      ruleVersion: f.ruleVersion,
      category: f.category,
      severity: f.severity,
      outcome: f.outcome,
      entityType: f.entity?.entityType ?? null,
      entityId: f.entity?.entityId ?? null,
      path: f.path,
      message: f.message,
      resolution: f.resolution,
    };
  }

  /** Keeps the newest working-copy runs of a design; older ones are superseded. */
  private async prune(tx: Prisma.TransactionClient, organizationId: string, designId: string) {
    const old = await tx.validationRun.findMany({
      where: { organizationId, designId, targetType: 'working_copy' },
      orderBy: { createdAt: 'desc' },
      skip: KEEP_WORKING_COPY_RUNS,
      select: { id: true },
    });
    if (old.length)
      await tx.validationRun.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
  }

  private async currentVersion(row: {
    targetType: string;
    organizationId: string;
    designId: string;
  }) {
    return row.targetType === 'working_copy'
      ? this.workingCopies.currentVersion(row.organizationId, row.designId)
      : null;
  }

  private view(row: RunRow, currentVersion: number | null): ValidationRunView {
    return {
      id: row.id,
      designId: row.designId,
      target: row.targetType as ValidationTarget,
      revisionId: row.revisionId,
      targetVersion: row.targetVersion,
      constraintSet: row.constraintSetRef,
      status: 'completed',
      counts: row.counts as unknown as FindingCounts,
      stale: currentVersion !== null && currentVersion !== row.targetVersion,
      currentVersion,
      requestedBy: row.requestedBy,
      createdAt: row.createdAt.toISOString(),
      findings: row.findings.map((f) => ({
        findingId: f.findingId,
        ruleId: f.ruleId,
        ruleVersion: f.ruleVersion,
        category: f.category,
        severity: f.severity as 'blocking' | 'warning' | 'info',
        outcome: f.outcome as ValidationRunView['findings'][number]['outcome'],
        entity:
          f.entityType && f.entityId ? { entityType: f.entityType, entityId: f.entityId } : null,
        path: f.path,
        message: f.message,
        resolution: f.resolution,
      })),
      scopeNote: VALIDATION_SCOPE_NOTE,
    };
  }
}
