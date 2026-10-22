import { DisplayIdPrefixes, JobQueuedEvent } from '@ai-designer/contracts';

import type { DbClient } from '../client.js';

import { newId, nextDisplayId } from './ids.js';
import type { WriteMeta } from './meta.js';
import { appendOutboxEvent } from './outbox.js';
import { redactSecrets } from './redact.js';

export interface CreateJobInput {
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
}

export interface CreatedJob {
  id: string;
  displayId: string;
  kind: string;
}

/**
 * Creates a durable job record (status `queued`) plus a `job.queued` outbox event in the same
 * transaction. The worker enqueues it on BullMQ when the event is dispatched — so a job can never
 * exist in the queue without its Postgres record, nor be lost if Redis drops it (sweeper re-enqueues).
 * Pass a transaction client when the job belongs to a larger state change.
 */
export async function createDurableJob(
  db: DbClient,
  input: CreateJobInput,
  meta: WriteMeta,
): Promise<CreatedJob> {
  const id = newId();
  const organizationId = meta.organizationId ?? null;
  const displayId = await nextDisplayId(db, organizationId, DisplayIdPrefixes.job);
  await db.job.create({
    data: {
      id,
      displayId,
      kind: input.kind,
      status: 'queued',
      organizationId,
      payload: redactSecrets(input.payload ?? {}) as object,
      maxAttempts: input.maxAttempts ?? 3,
      correlationId: meta.correlationId ?? meta.requestId ?? null,
      createdBy: meta.actor.id,
    },
  });
  await appendOutboxEvent(db, JobQueuedEvent, { jobId: id, kind: input.kind, displayId }, meta);
  return { id, displayId, kind: input.kind };
}
