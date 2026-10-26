import {
  decodeCursor,
  DesignOperationCompletedEvent,
  type DesignOperationView,
  DisplayIdPrefixes,
  encodeCursor,
  type Page,
  type SubmitOperationResponse,
} from '@ai-designer/contracts';
import { type DesignOperation, newId, nextDisplayId, type Prisma } from '@ai-designer/db';
import {
  applyOperation,
  type ApplyResult,
  entitySnapshots,
  type InternalOperation,
  invert,
  type Operation,
  OPERATION_SCHEMA_VERSION,
  type OperationEnvelope,
  operationEnvelopeSchema,
  selectStrategy,
  type StrategyChoice,
} from '@ai-designer/design-operations';
import {
  type EntityRef,
  type GarmentDesignState,
  sha256Hex,
  type ValidationFinding,
} from '@ai-designer/garment-model';
import { Injectable, type OnModuleInit } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { ArtifactsService } from '../artifacts/artifacts.service.js';
import { DesignCommitHooks } from '../designs/commit-hooks.js';
import { WorkingCopyService } from '../designs/working-copy.service.js';

const MAX_FINDINGS = 50;

interface Plan {
  envelope: OperationEnvelope;
  /** What is applied: the client operation, a stored inverse (revert) or an internal operation. */
  apply: Operation;
  strategy: StrategyChoice;
  revertTarget: DesignOperation | null;
}

class Rejected extends Error {
  constructor(readonly findings: ValidationFinding[]) {
    super('rejected');
  }
}

/**
 * The design operation router (SS-06, I14). Validates an operation, picks the execution strategy
 * (deterministic first; AI strategies arrive in I25), applies it atomically under the working-copy
 * lock and records it with its inverse (undo) and provenance. Owns `design_operations`.
 */
@Injectable()
export class OperationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly workingCopies: WorkingCopyService,
    private readonly artifacts: ArtifactsService,
    private readonly commitHooks: DesignCommitHooks,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('operation', {
      label: 'Operation',
      organizationOf: async (id) =>
        (
          await this.prisma.designOperation.findFirst({
            where: { id, design: { deletedAt: null } },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      governedBy: async (id) => {
        const op = await this.prisma.designOperation.findFirst({
          where: { id },
          select: { design: { select: { projectId: true } } },
        });
        return op ? { type: 'project', id: op.design.projectId } : null;
      },
    });
    // A commit takes every completed operation since the last commit (OPR-004).
    this.commitHooks.register('operations', async (tx, commit) => {
      const pending = await tx.designOperation.findMany({
        where: {
          organizationId: commit.organizationId,
          designId: commit.designId,
          resultRevisionId: null,
          status: 'completed',
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (pending.length)
        await tx.designOperation.updateMany({
          where: { id: { in: pending.map((p) => p.id) } },
          data: { resultRevisionId: commit.revisionId },
        });
      return pending.map((p) => p.id);
    });
  }

  // ---------------------------------------------------------------- submit / validate

  async submit(
    ctx: AuthzContext,
    designId: string,
    body: { expectedVersion: number } & Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<SubmitOperationResponse> {
    const envelope = this.parse(body);
    return this.run(ctx, designId, body.expectedVersion, envelope, {
      idempotencyKey: idempotencyKey ?? null,
    });
  }

  /** Dry run for editor previews: same checks, nothing stored (the transaction is rolled back). */
  async validate(
    ctx: AuthzContext,
    designId: string,
    body: { expectedVersion: number } & Record<string, unknown>,
  ) {
    const envelope = this.parse(body);
    try {
      const plan = await this.plan(ctx, designId, envelope);
      const result = await this.prisma
        .$transaction(async (tx) => {
          const { state } = await this.workingCopies.lockForOperation(
            tx,
            ctx.organizationId,
            designId,
            body.expectedVersion,
          );
          const r = await this.applyPlan(ctx, plan, state, null);
          throw new DryRun(r);
        })
        .catch((e: unknown) => {
          if (e instanceof DryRun) return e.result;
          throw e;
        });
      return {
        valid: true,
        executionStrategy: plan.strategy.strategy,
        strategyRationale: plan.strategy.rationale,
        findings: result.findings.slice(0, MAX_FINDINGS),
        patch: result.after as unknown as SubmitOperationResponse['patch'],
      };
    } catch (e) {
      if (e instanceof Rejected)
        return {
          valid: false,
          executionStrategy: null,
          strategyRationale: '',
          findings: e.findings.slice(0, MAX_FINDINGS),
          patch: null,
        };
      if (e instanceof AppError && e.code === 'UNSUPPORTED_CAPABILITY')
        return {
          valid: false,
          executionStrategy: null,
          strategyRationale: e.message,
          findings: [],
          patch: null,
        };
      throw e;
    }
  }

  /**
   * Server-side operations that clients may not send (imports, system tools, tests): full-state
   * replacement and exact restores. Recorded like any other operation.
   */
  async applyInternal(
    ctx: AuthzContext,
    designId: string,
    expectedVersion: number,
    op: InternalOperation,
  ) {
    const envelope: OperationEnvelope = {
      operation: { type: 'revert_operation', operationId: '-' },
      preservationConstraints: [],
      sourceRefs: [],
      executionPolicy: { allowDeterministic: true, allowAi: false, requireUserReview: false },
    };
    return this.run(ctx, designId, expectedVersion, envelope, {
      idempotencyKey: null,
      internal: op,
    });
  }

  // ---------------------------------------------------------------- read

  async history(
    ctx: AuthzContext,
    designId: string,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<Page<DesignOperationView>> {
    const cursor = query.cursor ? decodeCursor<{ c: string; id: string }>(query.cursor) : null;
    const rows = await this.prisma.designOperation.findMany({
      where: {
        organizationId: ctx.organizationId,
        designId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.c) } },
                { createdAt: new Date(cursor.c), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toView),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ c: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(ctx: AuthzContext, operationId: string): Promise<DesignOperationView> {
    const row = await this.prisma.designOperation.findFirst({
      where: { id: operationId, organizationId: ctx.organizationId },
    });
    if (!row) throw AppError.notFound('Operation');
    return toView(row);
  }

  // ---------------------------------------------------------------- internals

  private parse(body: Record<string, unknown>): OperationEnvelope {
    const { expectedVersion: _v, ...rest } = body;
    const parsed = operationEnvelopeSchema.safeParse(rest);
    if (!parsed.success)
      throw new AppError('VALIDATION_FAILED', 'The operation is not valid', {
        issues: parsed.error.issues
          .slice(0, 20)
          .map((i) => ({ path: i.path.map(String).join('.'), message: i.message, code: i.code })),
      });
    return parsed.data;
  }

  /** Strategy selection and revert lookup (no state needed). */
  private async plan(
    ctx: AuthzContext,
    designId: string,
    envelope: OperationEnvelope,
    internal?: InternalOperation,
  ): Promise<Plan> {
    const op = envelope.operation;
    const type = internal?.type ?? op.type;
    const strategy = selectStrategy(type, envelope.executionPolicy);
    if (strategy.strategy === null)
      throw new AppError('UNSUPPORTED_CAPABILITY', strategy.rationale, {
        reason: strategy.reason,
        operationType: type,
      });
    if (internal) return { envelope, apply: internal, strategy, revertTarget: null };
    if (op.type === 'revert_operation') {
      const target = await this.prisma.designOperation.findFirst({
        where: { id: op.operationId, organizationId: ctx.organizationId, designId },
      });
      if (!target) throw AppError.notFound('Operation');
      if (target.status !== 'completed' || target.revertedByOperationId || !target.inverse)
        throw new AppError('INVALID_STATE_TRANSITION', 'This operation cannot be undone', {
          status: target.status,
        });
      return {
        envelope,
        apply: target.inverse as unknown as InternalOperation,
        strategy,
        revertTarget: target,
      };
    }
    return { envelope, apply: op, strategy, revertTarget: null };
  }

  private async applyPlan(
    ctx: AuthzContext,
    plan: Plan,
    state: GarmentDesignState,
    operationId: string | null,
  ) {
    if (plan.revertTarget) {
      // Undo only while nothing else changed the same entities since (no silent overwrite).
      const stored = (plan.revertTarget.resultEntityHashes ?? {}) as Record<string, string>;
      const refs = Object.keys(stored).map((k) => {
        const [entityType, ...rest] = k.split(':');
        return { entityType, entityId: rest.join(':') } as EntityRef;
      });
      const now = hashSnapshots(entitySnapshots(state, refs));
      if (Object.entries(stored).some(([k, h]) => now[k] !== h))
        throw new AppError(
          'CONFLICT',
          'The same parts were changed afterwards; undo those changes first',
          {
            reason: 'changed_since',
            operationId: plan.revertTarget.id,
          },
        );
    }
    const artifacts = await this.artifacts.revisionInfos(
      ctx,
      artifactRevisionIdsOf(plan.apply, state),
    );
    const result: ApplyResult = applyOperation(state, plan.apply, {
      actorUserId: ctx.userId,
      now: new Date().toISOString(),
      operationId,
      artifacts,
    });
    if (!result.ok) throw new Rejected(result.findings);
    if (result.changed.length === 0)
      throw new AppError('NO_CHANGES', 'The operation would not change anything');
    return result;
  }

  private async run(
    ctx: AuthzContext,
    designId: string,
    expectedVersion: number,
    envelope: OperationEnvelope,
    opts: { idempotencyKey: string | null; internal?: InternalOperation },
  ): Promise<SubmitOperationResponse> {
    const type = opts.internal?.type ?? envelope.operation.type;
    try {
      const plan = await this.plan(ctx, designId, envelope, opts.internal);
      return await this.prisma.$transaction(async (tx) => {
        const { design, workingCopy, state } = await this.workingCopies.lockForOperation(
          tx,
          ctx.organizationId,
          designId,
          expectedVersion,
        );
        const operationId = newId();
        const result = await this.applyPlan(ctx, plan, state, operationId);
        if (!result.ok) throw new Error('unreachable');
        const updated = await this.workingCopies.writeOperationState(
          tx,
          design,
          workingCopy,
          result.state,
          {
            userId: ctx.userId,
            operationId,
          },
        );
        const row = await tx.designOperation.create({
          data: {
            id: operationId,
            organizationId: ctx.organizationId,
            designId,
            displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.operation),
            operationType: type,
            operationSchemaVersion: OPERATION_SCHEMA_VERSION,
            baseRevisionId: design.headRevisionId,
            baseWorkingCopyVersion: workingCopy.version,
            resultWorkingCopyVersion: updated.version,
            targetEntities: result.changed as unknown as Prisma.InputJsonValue,
            requestedChanges: (plan.revertTarget || opts.internal
              ? opts.internal
                ? { type: opts.internal.type }
                : envelope.operation
              : result.operation) as unknown as Prisma.InputJsonValue,
            preservationConstraints:
              envelope.preservationConstraints as unknown as Prisma.InputJsonValue,
            sourceRefs: envelope.sourceRefs as unknown as Prisma.InputJsonValue,
            executionPolicy: envelope.executionPolicy as unknown as Prisma.InputJsonValue,
            executionStrategy: plan.strategy.strategy,
            strategyRationale: plan.strategy.rationale,
            status: 'completed',
            findings: result.findings.slice(0, MAX_FINDINGS) as unknown as Prisma.InputJsonValue,
            inverse: invert(state, result.state) as unknown as Prisma.InputJsonValue,
            resultEntityHashes: hashSnapshots(
              entitySnapshots(result.state, result.changed),
            ) as Prisma.InputJsonValue,
            revertsOperationId: plan.revertTarget?.id ?? null,
            idempotencyKey: opts.idempotencyKey,
            requestedBy: ctx.userId,
            completedAt: new Date(),
          },
        });
        if (plan.revertTarget) {
          const target = plan.revertTarget;
          await tx.designOperation.update({
            where: { id: target.id },
            data: { status: 'reverted', revertedByOperationId: operationId },
          });
          // Undoing an undo (redo) makes the original operation active again.
          if (target.revertsOperationId)
            await tx.designOperation.updateMany({
              where: { id: target.revertsOperationId, revertedByOperationId: target.id },
              data: { status: 'completed', revertedByOperationId: null },
            });
        }
        await this.outbox.append(
          tx,
          DesignOperationCompletedEvent,
          {
            organizationId: ctx.organizationId,
            projectId: design.projectId,
            designId,
            operationId,
            operationType: type,
            executionStrategy: plan.strategy.strategy,
            resultWorkingCopyVersion: updated.version,
          },
          { organizationId: ctx.organizationId },
        );
        return {
          operation: toView(row),
          workingCopy: {
            designId,
            version: updated.version,
            baseRevisionId: updated.baseRevisionId,
            hasUncommittedChanges: updated.hasUncommittedChanges,
          },
          patch: result.after as unknown as SubmitOperationResponse['patch'],
          findings: result.findings.slice(0, MAX_FINDINGS),
        };
      });
    } catch (e) {
      if (e instanceof Rejected) {
        await this.recordRejection(
          ctx,
          designId,
          type,
          e.findings.map((f) => f.ruleId),
        );
        throw new AppError(
          'VALIDATION_BLOCKED',
          e.findings[0]?.message ?? 'The operation cannot be applied',
          {
            findings: e.findings.slice(0, MAX_FINDINGS),
          },
        );
      }
      if (e instanceof AppError && e.code === 'UNSUPPORTED_CAPABILITY')
        await this.recordRejection(ctx, designId, type, ['strategy.unsupported']);
      throw e;
    }
  }

  /** Rejected operations are not stored, but audited (DesignOperationRejected). */
  private async recordRejection(
    ctx: AuthzContext,
    designId: string,
    operationType: string,
    ruleIds: string[],
  ) {
    await this.audit.record(
      {
        eventType: 'operations.design_operation_rejected',
        action: 'design.edit',
        outcome: 'failed',
        resourceType: 'design',
        resourceId: designId,
        metadata: { operationType, ruleIds: [...new Set(ruleIds)].slice(0, 20) },
      },
      undefined,
      { organizationId: ctx.organizationId },
    );
  }
}

class DryRun extends Error {
  constructor(readonly result: Extract<ApplyResult, { ok: true }>) {
    super('dry run');
  }
}

function hashSnapshots(snapshots: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(snapshots).map(([k, v]) => [k, sha256Hex(v)]));
}

/** Artifact revisions the operation names or touches (attach/replace, placements of existing relationships). */
function artifactRevisionIdsOf(op: Operation, state: GarmentDesignState): string[] {
  const ids: string[] = [];
  const walk = (o: Operation) => {
    if (o.type === 'attach_artifact' || o.type === 'replace_artifact')
      ids.push(o.artifactRevisionId);
    if (o.type === 'update_placement') {
      const rel = state.relationships.find((r) => r.relationshipId === o.relationshipId);
      if (rel?.source.entityType === 'artifact_revision') ids.push(rel.source.entityId);
    }
    if (o.type === 'replace_artifact') {
      for (const r of state.relationships)
        if (r.source.entityType === 'artifact_revision' && r.target.entityId === o.componentId)
          ids.push(r.source.entityId);
    }
    if (o.type === 'batch') for (const inner of o.operations) walk(inner as Operation);
  };
  walk(op);
  return ids;
}

export function toView(r: DesignOperation): DesignOperationView {
  return {
    id: r.id,
    displayId: r.displayId,
    designId: r.designId,
    operationType: r.operationType,
    operationSchemaVersion: r.operationSchemaVersion,
    status: r.status as DesignOperationView['status'],
    baseRevisionId: r.baseRevisionId,
    baseWorkingCopyVersion: r.baseWorkingCopyVersion,
    resultWorkingCopyVersion: r.resultWorkingCopyVersion,
    resultRevisionId: r.resultRevisionId,
    jobId: r.jobId,
    targetEntities: r.targetEntities as DesignOperationView['targetEntities'],
    requestedChanges: r.requestedChanges as Record<string, unknown>,
    preservationConstraints: r.preservationConstraints as Record<string, unknown>[],
    sourceRefs: r.sourceRefs as Record<string, unknown>[],
    executionPolicy: r.executionPolicy as Record<string, unknown>,
    executionStrategy: r.executionStrategy,
    strategyRationale: r.strategyRationale,
    findings: r.findings as DesignOperationView['findings'],
    revertible: r.status === 'completed' && r.inverse !== null && r.revertedByOperationId === null,
    revertsOperationId: r.revertsOperationId,
    revertedByOperationId: r.revertedByOperationId,
    requestedBy: r.requestedBy,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}
