import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';
import { designFindingSchema } from '../designs/schemas.js';
import { pageQuerySchema, pageSchema } from '../pagination.js';

/**
 * Design operations (I14). The operation payload itself is validated server-side by
 * `@ai-designer/design-operations` (`operationEnvelopeSchema`); clients import that package for the
 * precise types. Here it travels as JSON with a `type`.
 */
export const operationPayloadSchema = z.looseObject({ type: z.string().min(1).max(60) });

export const submitOperationRequestSchema = z.object({
  /** Working-copy version the operation was prepared against (API-002). */
  expectedVersion: z.number().int().min(1),
  operation: operationPayloadSchema,
  preservationConstraints: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  sourceRefs: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  executionPolicy: z.record(z.string(), z.unknown()).optional(),
});
export type SubmitOperationRequest = z.input<typeof submitOperationRequestSchema>;

export const validateOperationRequestSchema = submitOperationRequestSchema;

export const OperationStatuses = [
  'requested',
  'running',
  'completed',
  'failed',
  'cancelled',
  'reverted',
] as const;

export const designOperationSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  designId: z.uuid(),
  operationType: z.string(),
  operationSchemaVersion: z.string(),
  status: z.enum(OperationStatuses),
  baseRevisionId: z.uuid().nullable(),
  baseWorkingCopyVersion: z.number().int(),
  resultWorkingCopyVersion: z.number().int().nullable(),
  resultRevisionId: z.uuid().nullable(),
  jobId: z.uuid().nullable(),
  targetEntities: z.array(z.object({ entityType: z.string(), entityId: z.string() })),
  requestedChanges: z.record(z.string(), z.unknown()),
  preservationConstraints: z.array(z.record(z.string(), z.unknown())),
  sourceRefs: z.array(z.record(z.string(), z.unknown())),
  executionPolicy: z.record(z.string(), z.unknown()),
  executionStrategy: z.string(),
  strategyRationale: z.string(),
  findings: z.array(designFindingSchema),
  /** It can be undone with `revert_operation` (until something else changes the same entities). */
  revertible: z.boolean(),
  revertsOperationId: z.uuid().nullable(),
  revertedByOperationId: z.uuid().nullable(),
  requestedBy: z.uuid(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type DesignOperationView = z.infer<typeof designOperationSchema>;

/** Changed entities by id (null = removed); apply with `applyEntityPatch` from design-operations. */
export const entityPatchSchema = z.object({
  components: z.record(z.string(), z.record(z.string(), z.unknown()).nullable()),
  relationships: z.record(z.string(), z.record(z.string(), z.unknown()).nullable()),
  root: z.record(z.string(), z.unknown()).optional(),
});

export const submitOperationResponseSchema = z.object({
  operation: designOperationSchema,
  workingCopy: z.object({
    designId: z.uuid(),
    version: z.number().int(),
    baseRevisionId: z.uuid().nullable(),
    hasUncommittedChanges: z.boolean(),
  }),
  /** Only what changed — keeps responses small for the editor. */
  patch: entityPatchSchema,
  findings: z.array(designFindingSchema),
});
export type SubmitOperationResponse = z.infer<typeof submitOperationResponseSchema>;

export const validateOperationResponseSchema = z.object({
  valid: z.boolean(),
  executionStrategy: z.string().nullable(),
  strategyRationale: z.string(),
  findings: z.array(designFindingSchema),
  patch: entityPatchSchema.nullable(),
});

export const operationListQuerySchema = pageQuerySchema;
export const operationListResponseSchema = pageSchema(designOperationSchema);
export const operationParamsSchema = z.object({ orgId: z.uuid(), operationId: z.uuid() });
