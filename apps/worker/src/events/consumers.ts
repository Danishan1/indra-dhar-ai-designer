import {
  accessCacheKey,
  DevEchoedEvent,
  type EventEnvelope,
  JobQueuedEvent,
  MembershipReactivatedEvent,
  MembershipRevokedEvent,
  MembershipSuspendedEvent,
  OwnershipTransferredEvent,
  RoleAssignmentChangedEvent,
} from '@ai-designer/contracts';
import { type PrismaClient, type TxClient, withIdempotentConsumer } from '@ai-designer/db';
import type { Logger } from 'pino';

export interface ConsumerDeps {
  logger: Logger;
  enqueueJob: (jobId: string) => Promise<void>;
  /** Deletes Redis cache keys (best effort; idempotent). */
  invalidateCache: (keys: string[]) => Promise<void>;
}

/**
 * An event consumer. `handle` runs inside a transaction that also records
 * (consumer, eventId) in processed_events, so duplicate deliveries are skipped (EVT-002).
 * Side effects outside Postgres (queues, email…) must themselves be idempotent (dedupe ids).
 */
export interface EventConsumer {
  name: string;
  types: readonly string[];
  handle(event: EventEnvelope, tx: TxClient, deps: ConsumerDeps): Promise<void>;
}

/** Built-in platform consumers. Business modules append theirs in later iterations. */
export const platformConsumers: EventConsumer[] = [
  {
    name: 'jobs.enqueue',
    types: [JobQueuedEvent.type],
    async handle(event, _tx, deps) {
      const payload = JobQueuedEvent.payload.parse(event.payload);
      await deps.enqueueJob(payload.jobId);
    },
  },
  {
    // Second line of defence for authorization caches: the API invalidates synchronously after a
    // change; this repeats it from the outbox in case that failed (TTL is the final bound).
    name: 'authorization.access-cache-invalidate',
    types: [
      MembershipSuspendedEvent.type,
      MembershipReactivatedEvent.type,
      MembershipRevokedEvent.type,
      RoleAssignmentChangedEvent.type,
      OwnershipTransferredEvent.type,
    ],
    async handle(event, _tx, deps) {
      const p = event.payload as {
        organizationId: string;
        userId?: string;
        fromUserId?: string;
        toUserId?: string;
      };
      const users = [p.userId, p.fromUserId, p.toUserId].filter((u): u is string => !!u);
      await deps.invalidateCache(users.map((u) => accessCacheKey(p.organizationId, u)));
    },
  },
  {
    name: 'dev.echo-log',
    types: [DevEchoedEvent.type],
    async handle(event, _tx, deps) {
      const payload = DevEchoedEvent.payload.parse(event.payload);
      deps.logger.info({ eventId: event.eventId, message: payload.message }, 'dev.echoed received');
    },
  },
];

export interface EventProcessingResult {
  consumer: string;
  processed: boolean;
}

/** Delivers one event to every consumer subscribed to its type, at most once per consumer. */
export async function processEvent(
  event: EventEnvelope,
  consumers: readonly EventConsumer[],
  prisma: PrismaClient,
  deps: ConsumerDeps,
): Promise<EventProcessingResult[]> {
  const results: EventProcessingResult[] = [];
  for (const consumer of consumers) {
    if (!consumer.types.includes(event.type)) continue;
    const processed = await withIdempotentConsumer(prisma, consumer.name, event.eventId, (tx) =>
      consumer.handle(event, tx, deps),
    );
    if (!processed)
      deps.logger.debug(
        { eventId: event.eventId, consumer: consumer.name },
        'duplicate event skipped',
      );
    results.push({ consumer: consumer.name, processed });
  }
  return results;
}
