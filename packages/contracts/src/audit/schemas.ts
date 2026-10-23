import { z } from 'zod';

import { pageQuerySchema, pageSchema } from '../pagination.js';

export const AuditOutcomes = ['success', 'denied', 'failed', 'indeterminate'] as const;

/** Search filters (FR-SEC-182). Time range is ISO-8601; eventType matches a prefix. */
export const auditSearchQuerySchema = pageQuerySchema.extend({
  actorId: z.string().max(64).optional(),
  resourceType: z.string().max(64).optional(),
  resourceId: z.string().max(64).optional(),
  eventType: z.string().max(128).optional(),
  outcome: z.enum(AuditOutcomes).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type AuditSearchQuery = z.input<typeof auditSearchQuerySchema>;

export const auditEventViewSchema = z.object({
  id: z.uuid(),
  occurredAt: z.string(),
  eventType: z.string(),
  action: z.string(),
  outcome: z.enum(AuditOutcomes),
  actor: z.object({
    type: z.string(),
    id: z.string().nullable(),
    displayName: z.string().nullable(),
  }),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  reasonCode: z.string().nullable(),
  requestId: z.string().nullable(),
  /** Already redacted at write time; references only, never secrets (FR-SEC-181). */
  metadata: z.record(z.string(), z.unknown()),
});
export type AuditEventView = z.infer<typeof auditEventViewSchema>;
export const auditSearchResponseSchema = pageSchema(auditEventViewSchema);
