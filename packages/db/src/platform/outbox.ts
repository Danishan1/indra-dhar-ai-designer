import { type EventDefinition, type EventEnvelope } from '@ai-designer/contracts';
import type { z } from 'zod';

import type { DbClient } from '../client.js';

import { newId } from './ids.js';
import type { WriteMeta } from './meta.js';
import { redactSecrets } from './redact.js';

/**
 * Appends a domain event to the transactional outbox (ADR-005). Call it with the SAME transaction
 * client that performs the state change, so both commit or roll back together. The worker's
 * dispatcher publishes it afterwards (at-least-once); consumers must be idempotent.
 */
export async function appendOutboxEvent<P extends z.ZodType>(
  db: DbClient,
  def: EventDefinition<P>,
  payload: z.input<P>,
  meta: WriteMeta,
): Promise<string> {
  const parsed = def.payload.parse(payload) as Record<string, unknown>;
  const id = newId();
  await db.outboxEvent.create({
    data: {
      id,
      type: def.type,
      schemaVersion: def.schemaVersion,
      payload: redactSecrets(parsed) as object,
      organizationId: meta.organizationId ?? null,
      actorType: meta.actor.type,
      actorId: meta.actor.id,
      correlationId: meta.correlationId ?? meta.requestId ?? null,
      causationId: meta.causationId ?? null,
    },
  });
  return id;
}

/** Shape of an outbox row as published on the `events` queue. */
export function toEnvelope(row: {
  id: string;
  type: string;
  schemaVersion: number;
  payload: unknown;
  organizationId: string | null;
  actorType: string;
  actorId: string | null;
  correlationId: string | null;
  causationId: string | null;
  occurredAt: Date;
}): EventEnvelope {
  return {
    eventId: row.id,
    type: row.type,
    schemaVersion: row.schemaVersion,
    occurredAt: row.occurredAt.toISOString(),
    organizationId: row.organizationId,
    actor: { type: row.actorType as EventEnvelope['actor']['type'], id: row.actorId },
    correlationId: row.correlationId,
    causationId: row.causationId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
  };
}
