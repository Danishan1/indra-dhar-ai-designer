import { z } from 'zod';

/**
 * Status of every manufacturing/design value (CLAUDE.md rule 3; SPEC-008/009). AI output is never
 * `confirmed` automatically. The UI renders these with `<ValueStatusBadge>` (icon + label, never
 * color alone — FR-EDT-129).
 */
export const ValueStatuses = [
  'confirmed',
  'inferred',
  'proposed',
  'missing',
  'needs_review',
  'not_applicable',
] as const;
export const valueStatusSchema = z.enum(ValueStatuses);
export type ValueStatus = z.infer<typeof valueStatusSchema>;

export const ValueStatusLabels: Record<ValueStatus, string> = {
  confirmed: 'Confirmed',
  inferred: 'Inferred',
  proposed: 'Proposed',
  missing: 'Missing',
  needs_review: 'Needs review',
  not_applicable: 'Not applicable',
};
