import type { EventEnvelope } from '@ai-designer/contracts';
import { type PrismaClient, toEnvelope } from '@ai-designer/db';
import type { Logger } from 'pino';

export interface OutboxDispatcherOptions {
  batchSize: number;
  maxAttempts: number;
  pollIntervalMs: number;
}

export type PublishFn = (envelope: EventEnvelope) => Promise<void>;

/** Retry delay after a failed publish: 1s, 2s, 4s … capped at 5 minutes. */
export function outboxBackoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts - 1), 300_000);
}

/**
 * Transactional-outbox relay (ADR-005): claims unpublished rows with FOR UPDATE SKIP LOCKED (safe
 * with several worker processes), publishes each to the `events` queue and marks it published.
 * Failures are retried with backoff; after `maxAttempts` the row is dead-lettered (kept, flagged,
 * logged at error level) for an operator to inspect.
 */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly publish: PublishFn,
    private readonly options: OutboxDispatcherOptions,
    private readonly logger: Logger,
  ) {}

  /** Publishes one batch. Returns the number of events published. */
  async dispatchOnce(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM outbox_events
        WHERE published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now()
        ORDER BY occurred_at, id
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED`;
      if (claimed.length === 0) return 0;
      const rows = await tx.outboxEvent.findMany({
        where: { id: { in: claimed.map((r) => r.id) } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      let published = 0;
      for (const row of rows) {
        const attempts = row.attempts + 1;
        try {
          await this.publish(toEnvelope(row));
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { publishedAt: new Date(), attempts, lastError: null },
          });
          published += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const dead = attempts >= this.options.maxAttempts;
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: {
              attempts,
              lastError: message.slice(0, 2000),
              availableAt: new Date(Date.now() + outboxBackoffMs(attempts)),
              ...(dead ? { deadLetteredAt: new Date() } : {}),
            },
          });
          const log = { eventId: row.id, type: row.type, attempts, err: message };
          if (dead) this.logger.error(log, 'outbox event dead-lettered');
          else this.logger.warn(log, 'outbox publish failed, will retry');
        }
      }
      return published;
    });
  }

  start(): void {
    this.stopped = false;
    const tick = async (): Promise<void> => {
      let published = 0;
      try {
        published = await this.dispatchOnce();
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'outbox dispatch cycle failed',
        );
      }
      if (this.stopped) return;
      // A full batch means there is likely more: continue immediately.
      const delay = published >= this.options.batchSize ? 0 : this.options.pollIntervalMs;
      this.timer = setTimeout(() => {
        this.running = tick();
      }, delay);
    };
    this.running = tick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
