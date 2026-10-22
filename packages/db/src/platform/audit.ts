import type { DbClient } from '../client.js';

import { newId } from './ids.js';
import type { WriteMeta } from './meta.js';
import { redactSecrets } from './redact.js';

export type AuditOutcome = 'success' | 'denied' | 'failed' | 'indeterminate';

export interface AuditInput {
  eventType: string;
  action: string;
  outcome: AuditOutcome;
  resourceType?: string;
  resourceId?: string;
  reasonCode?: string;
  policyVersion?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Appends an audit event (SPEC-009 §15.2). Rows are immutable (DB trigger). Metadata is redacted;
 * store references, not confidential content.
 */
export async function recordAuditEvent(
  db: DbClient,
  input: AuditInput,
  meta: WriteMeta,
): Promise<string> {
  const id = newId();
  await db.auditEvent.create({
    data: {
      id,
      eventType: input.eventType,
      actorType: meta.actor.type,
      actorId: meta.actor.id,
      organizationId: meta.organizationId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      action: input.action,
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      requestId: meta.requestId ?? null,
      correlationId: meta.correlationId ?? null,
      policyVersion: input.policyVersion ?? null,
      metadata: redactSecrets(input.metadata ?? {}) as object,
    },
  });
  return id;
}
