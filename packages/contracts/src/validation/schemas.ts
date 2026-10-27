import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';

/**
 * Design-structure validation (I20, SPEC-003 §15, FR-EDT-117…124). The rules are code in
 * `@ai-designer/garment-model`; runs and findings are stored by the API's `validation` module.
 * Passing design validation is never production readiness (CST-006).
 */

export const findingSeveritySchema = z.enum(['blocking', 'warning', 'info']);
export type FindingSeverityKey = z.infer<typeof findingSeveritySchema>;

export const validationTargetSchema = z.enum(['working_copy', 'revision']);
export type ValidationTarget = z.infer<typeof validationTargetSchema>;

export const validationFindingViewSchema = z.object({
  /** Stable across runs (same rule + entity + path). */
  findingId: z.string(),
  ruleId: z.string(),
  ruleVersion: z.string(),
  category: z.string(),
  severity: findingSeveritySchema,
  outcome: z.enum(['valid', 'warning', 'error', 'not_evaluated', 'requires_manual_review']),
  entity: z.object({ entityType: z.string(), entityId: z.string() }).nullable(),
  path: z.string().nullable(),
  message: z.string(),
  resolution: z.string().nullable(),
});
export type ValidationFindingView = z.infer<typeof validationFindingViewSchema>;

export const findingCountsSchema = z.object({
  errors: z.number().int(),
  warnings: z.number().int(),
  manualReview: z.number().int(),
  info: z.number().int(),
});
export type FindingCountsView = z.infer<typeof findingCountsSchema>;

export const validationRunSchema = z.object({
  id: z.uuid(),
  designId: z.uuid(),
  target: validationTargetSchema,
  revisionId: z.uuid().nullable(),
  /** Working-copy version, or the revision number. */
  targetVersion: z.number().int(),
  /** `design-structure@1.0.0` (CST-004). */
  constraintSet: z.string(),
  status: z.enum(['completed']),
  counts: findingCountsSchema,
  /** A working-copy run whose version is no longer current (FR-EDT-121). Revision runs never are. */
  stale: z.boolean(),
  /** Current working-copy version when the run was read (working-copy runs). */
  currentVersion: z.number().int().nullable(),
  requestedBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  findings: z.array(validationFindingViewSchema),
  /** Always shown with results (CST-006, FR-EDT-124). */
  scopeNote: z.string(),
});
export type ValidationRun = z.infer<typeof validationRunSchema>;

export const runValidationRequestSchema = z.object({
  target: validationTargetSchema.default('working_copy'),
  /** Required when `target` is `revision`. */
  revisionId: z.uuid().optional(),
});
export type RunValidationRequest = z.input<typeof runValidationRequestSchema>;

export const latestValidationQuerySchema = z.object({
  target: validationTargetSchema.default('working_copy'),
  revisionId: z.uuid().optional(),
});

export const latestValidationResponseSchema = z.object({
  /** Null when the target was never validated. */
  run: validationRunSchema.nullable(),
});

export const validationRunParamsSchema = z.object({ orgId: z.uuid(), runId: z.uuid() });

export const constraintSetSchema = z.object({
  key: z.string(),
  version: z.string(),
  label: z.string(),
  garmentTypes: z.array(z.string()),
  rules: z.array(z.string()),
});

export const VALIDATION_SCOPE_NOTE =
  'Design structure validation — checks how the design is put together. It is not production readiness.';
