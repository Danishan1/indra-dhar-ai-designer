import { z } from 'zod';

import { entityRefSchema } from './entity-ref.js';

/** SPEC-003 §15.3. A warning is never silently a pass; manual review stays visible until resolved. */
export const FindingOutcomes = [
  'valid',
  'warning',
  'error',
  'not_evaluated',
  'requires_manual_review',
] as const;
export const findingOutcomeSchema = z.enum(FindingOutcomes);
export type FindingOutcome = z.infer<typeof findingOutcomeSchema>;

export const validationFindingSchema = z.object({
  /** Stable rule id, e.g. `component.parent_not_allowed`. */
  ruleId: z.string().min(1).max(120),
  outcome: findingOutcomeSchema,
  /** The affected component/relationship (CST-002); null for design-level findings. */
  entity: entityRefSchema.nullable(),
  /** JSON-pointer-ish path inside the state, for the UI to focus the field. */
  path: z.string().max(300).nullable().default(null),
  message: z.string().min(1).max(500),
  resolution: z.string().max(500).nullable().default(null),
});
export type ValidationFinding = z.infer<typeof validationFindingSchema>;

export function hasBlockingFindings(findings: readonly ValidationFinding[]): boolean {
  return findings.some((f) => f.outcome === 'error');
}
