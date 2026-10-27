import {
  type WorkingCopy as WorkingCopyView,
  RevisionCommittedEvent,
  RevisionRestoredToWorkingCopyEvent,
  WorkingCopyUpdatedEvent,
} from '@ai-designer/contracts';
import { newId, type Design, type Prisma, type WorkingCopy } from '@ai-designer/db';
import {
  GarmentModelError,
  readAnyVersion,
  semanticHash,
  validateDesignState,
  type GarmentDesignState,
  type ValidationFinding,
} from '@ai-designer/garment-model';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { assertVersion } from '../../platform/concurrency/assert-version.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { ProjectsService } from '../projects/projects.service.js';

import { DesignCommitHooks } from './commit-hooks.js';
import { RevisionService } from './revision.service.js';

/** At most this many findings travel back in an error or a response. */
const MAX_FINDINGS = 50;

/**
 * The single writer of `working_copies` (ADR-018, I12). State changes come only from design
 * operations (`writeOperationState`, I14) and never create revisions; commits lock the row, write an immutable revision and rebase the working
 * copy onto it; restores replace the state with an old revision without touching history.
 */
@Injectable()
export class WorkingCopyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly revisions: RevisionService,
    private readonly projects: ProjectsService,
    private readonly commitHooks: DesignCommitHooks,
  ) {}

  /** Parses (upgrading older schema versions) and validates a state; blocking findings throw. */
  validate(input: unknown): { state: GarmentDesignState; findings: ValidationFinding[] } {
    let upgraded: unknown;
    try {
      upgraded = readAnyVersion(input).migrated.state;
    } catch (err) {
      if (err instanceof GarmentModelError)
        throw new AppError('VALIDATION_FAILED', err.message, {
          issues: [{ path: 'state.schemaVersion', message: err.message, code: err.code }],
        });
      // Shape errors are reported as findings below.
      upgraded = input;
    }
    const result = validateDesignState(upgraded);
    if (!result.ok || !result.state)
      throw new AppError('VALIDATION_BLOCKED', 'The design has problems that must be fixed first', {
        findings: result.findings.slice(0, MAX_FINDINGS),
      });
    return { state: result.state, findings: result.findings.filter((f) => f.outcome !== 'valid') };
  }

  async create(
    tx: Prisma.TransactionClient,
    input: {
      design: Design;
      state: GarmentDesignState;
      baseRevisionId: string;
      userId: string;
    },
  ): Promise<WorkingCopy> {
    return tx.workingCopy.create({
      data: {
        id: newId(),
        organizationId: input.design.organizationId,
        designId: input.design.id,
        baseRevisionId: input.baseRevisionId,
        state: input.state as unknown as Prisma.InputJsonValue,
        schemaVersion: input.state.schemaVersion,
        semanticHash: semanticHash(input.state),
        hasUncommittedChanges: false,
        lastModifiedBy: input.userId,
      },
    });
  }

  async get(ctx: AuthzContext, designId: string): Promise<WorkingCopyView> {
    const wc = await this.find(this.prisma, ctx.organizationId, designId);
    const read = readAnyVersion(wc.state);
    const findings = validateDesignState(read.state).findings.filter((f) => f.outcome !== 'valid');
    return this.toView(
      wc,
      read.state,
      findings,
      read.migrated.applied.length ? read.migrated.from : null,
    );
  }

  /** Current working state with its version (validation runs, I20). */
  async currentSnapshot(
    organizationId: string,
    designId: string,
  ): Promise<{ state: GarmentDesignState; version: number }> {
    const wc = await this.find(this.prisma, organizationId, designId);
    return { state: readAnyVersion(wc.state).state, version: wc.version };
  }

  /** Current version only (staleness of validation runs). */
  async currentVersion(organizationId: string, designId: string): Promise<number> {
    return (await this.find(this.prisma, organizationId, designId)).version;
  }

  /** Current working state, upgraded for reading (used by compare). */
  async currentState(organizationId: string, designId: string): Promise<GarmentDesignState> {
    const wc = await this.find(this.prisma, organizationId, designId);
    return readAnyVersion(wc.state).state;
  }

  /**
   * Opens an operation on the working copy (I14): locks the row, checks the project allows changes
   * and the caller saw the current version, and returns the state upgraded for reading.
   */
  async lockForOperation(
    tx: Prisma.TransactionClient,
    organizationId: string,
    designId: string,
    expectedVersion: number,
  ) {
    await this.lock(tx, designId);
    const design = await this.design(tx, organizationId, designId);
    await this.projects.requireWorkable(organizationId, design.projectId, tx);
    const wc = await this.find(tx, organizationId, designId);
    assertVersion(expectedVersion, wc.version, { designId });
    return { design, workingCopy: wc, state: readAnyVersion(wc.state).state };
  }

  /**
   * The ONLY way a working copy's state changes outside commit/restore (AC1 of I14): called by the
   * operations module inside the transaction opened with `lockForOperation`.
   */
  async writeOperationState(
    tx: Prisma.TransactionClient,
    design: Design,
    current: WorkingCopy,
    state: GarmentDesignState,
    input: { userId: string; operationId: string },
  ): Promise<WorkingCopy> {
    const semantic = semanticHash(state);
    const head = await this.revisions.headSemanticHash(tx, design);
    const updated = await this.write(tx, current, {
      state: state as unknown as Prisma.InputJsonValue,
      schemaVersion: state.schemaVersion,
      semanticHash: semantic,
      hasUncommittedChanges: semantic !== head,
      lastModifiedBy: input.userId,
    });
    await this.outbox.append(
      tx,
      WorkingCopyUpdatedEvent,
      {
        organizationId: design.organizationId,
        projectId: design.projectId,
        designId: design.id,
        version: updated.version,
        operationId: input.operationId,
      },
      { organizationId: design.organizationId },
    );
    return updated;
  }

  /**
   * Commits the working copy as the next immutable revision (SPEC-006 §10.1): locks the row, checks
   * the version, validates, hashes, extracts pinned references, writes the revision and rebases the
   * working copy — all in one transaction.
   */
  async commit(
    ctx: AuthzContext,
    designId: string,
    body: { expectedVersion: number; summary?: string | undefined; allowNoChanges: boolean },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, designId);
      const design = await this.design(tx, ctx.organizationId, designId);
      await this.projects.requireWorkable(ctx.organizationId, design.projectId, tx);
      const wc = await this.find(tx, ctx.organizationId, designId);
      assertVersion(body.expectedVersion, wc.version, { designId });
      const { state, findings } = this.validate(wc.state);
      const head = design.headRevisionId
        ? await this.revisions.loadVerified(tx, ctx.organizationId, design.headRevisionId, designId)
        : null;
      if (head && !body.allowNoChanges) {
        const { diff } = this.revisions.diff(head.state, state);
        if (!diff.hasSemanticChanges)
          throw new AppError(
            'NO_CHANGES',
            'Nothing about the garment changed since the last revision',
            {
              headRevisionId: head.row.id,
              metadataOnly: diff.metadataOnly,
            },
          );
      }
      const revisionId = newId();
      // Operations since the last commit now belong to this revision (OPR-004).
      const operationIds = await this.commitHooks.run(tx, {
        organizationId: ctx.organizationId,
        designId,
        revisionId,
      });
      const revision = await this.revisions.insert(tx, {
        id: revisionId,
        design,
        state,
        parent: head ? { id: head.row.id, state: head.state } : null,
        restoredFromRevisionId: wc.restoredFromRevisionId,
        summaryText: body.summary,
        findings,
        createdBy: ctx.userId,
        operationIds,
      });
      const rebased = await this.write(tx, wc, {
        state: state as unknown as Prisma.InputJsonValue,
        schemaVersion: state.schemaVersion,
        semanticHash: revision.semanticHash,
        baseRevisionId: revision.id,
        restoredFromRevisionId: null,
        hasUncommittedChanges: false,
        lastModifiedBy: ctx.userId,
      });
      await this.audit.record(
        {
          eventType: RevisionCommittedEvent.type,
          action: 'design.commit',
          outcome: 'success',
          resourceType: 'design',
          resourceId: designId,
          metadata: {
            revisionId: revision.id,
            displayId: revision.displayId,
            contentHash: revision.contentHash,
            ...(revision.restoredFromRevisionId
              ? { restoredFromRevisionId: revision.restoredFromRevisionId }
              : {}),
          },
        },
        tx,
      );
      await this.outbox.append(tx, RevisionCommittedEvent, {
        organizationId: ctx.organizationId,
        projectId: design.projectId,
        designId,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        contentHash: revision.contentHash,
        parentRevisionIds: revision.parentRevisionIds,
        ...(revision.restoredFromRevisionId
          ? { restoredFromRevisionId: revision.restoredFromRevisionId }
          : {}),
      });
      const [summary] = await this.revisions.toSummaries([revision]);
      return { revision: summary!, workingCopyVersion: rebased.version };
    });
  }

  /**
   * Puts revision R's state into the working copy (FR-PRJ-033): base = R, `restoredFrom` = R. History
   * is untouched; the next commit gets the current head as parent and records the restore.
   */
  async restore(
    ctx: AuthzContext,
    designId: string,
    body: { revisionId: string; expectedVersion: number },
  ): Promise<WorkingCopyView> {
    const { wc, state } = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, designId);
      const design = await this.design(tx, ctx.organizationId, designId);
      await this.projects.requireWorkable(ctx.organizationId, design.projectId, tx);
      const current = await this.find(tx, ctx.organizationId, designId);
      assertVersion(body.expectedVersion, current.version, { designId });
      const source = await this.revisions.loadVerified(
        tx,
        ctx.organizationId,
        body.revisionId,
        designId,
      );
      const semantic = semanticHash(source.state);
      const head = await this.revisions.headSemanticHash(tx, design);
      const updated = await this.write(tx, current, {
        state: source.state as unknown as Prisma.InputJsonValue,
        schemaVersion: source.state.schemaVersion,
        semanticHash: semantic,
        baseRevisionId: source.row.id,
        restoredFromRevisionId: source.row.id,
        hasUncommittedChanges: semantic !== head,
        lastModifiedBy: ctx.userId,
      });
      await this.audit.record(
        {
          eventType: RevisionRestoredToWorkingCopyEvent.type,
          action: 'design.restore',
          outcome: 'success',
          resourceType: 'design',
          resourceId: designId,
          metadata: { revisionId: source.row.id, displayId: source.row.displayId },
        },
        tx,
      );
      await this.outbox.append(tx, RevisionRestoredToWorkingCopyEvent, {
        organizationId: ctx.organizationId,
        projectId: design.projectId,
        designId,
        revisionId: source.row.id,
        workingCopyVersion: updated.version,
      });
      return { wc: updated, state: source.state };
    });
    const findings = validateDesignState(state).findings.filter((f) => f.outcome !== 'valid');
    return this.toView(wc, state, findings, null);
  }

  // ---------------------------------------------------------------- helpers

  /** Version-guarded write; a lost race reports the version that won. */
  private async write(
    tx: Prisma.TransactionClient,
    current: WorkingCopy,
    data: Prisma.WorkingCopyUncheckedUpdateManyInput,
  ): Promise<WorkingCopy> {
    const { count } = await tx.workingCopy.updateMany({
      where: { id: current.id, version: current.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      const latest = await tx.workingCopy.findUnique({
        where: { id: current.id },
        select: { version: true },
      });
      throw new AppError(
        'CONCURRENT_MODIFICATION',
        'The design was changed by someone else; reload and retry',
        {
          designId: current.designId,
          expectedVersion: current.version,
          currentVersion: latest?.version ?? null,
        },
      );
    }
    return tx.workingCopy.findUniqueOrThrow({ where: { id: current.id } });
  }

  private async lock(tx: Prisma.TransactionClient, designId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM working_copies WHERE design_id = ${designId}::uuid FOR UPDATE`;
  }

  private async design(tx: Prisma.TransactionClient, organizationId: string, designId: string) {
    const design = await tx.design.findFirst({
      where: { id: designId, organizationId, deletedAt: null },
    });
    if (!design) throw AppError.notFound('Design');
    return design;
  }

  private async find(
    db: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    designId: string,
  ): Promise<WorkingCopy> {
    const wc = await db.workingCopy.findFirst({ where: { designId, organizationId } });
    if (!wc) throw AppError.notFound('Design');
    return wc;
  }

  toView(
    wc: WorkingCopy,
    state: GarmentDesignState,
    findings: readonly ValidationFinding[],
    migratedFrom: string | null,
  ): WorkingCopyView {
    return {
      designId: wc.designId,
      version: wc.version,
      baseRevisionId: wc.baseRevisionId,
      restoredFromRevisionId: wc.restoredFromRevisionId,
      schemaVersion: state.schemaVersion,
      migratedFrom,
      state: state as unknown as Record<string, unknown>,
      hasUncommittedChanges: wc.hasUncommittedChanges,
      findings: findings.slice(0, MAX_FINDINGS),
      lastModifiedBy: wc.lastModifiedBy,
      updatedAt: wc.updatedAt.toISOString(),
    };
  }
}
