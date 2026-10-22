import type { TxClient } from '../client.js';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Runs `fn` at most once per (consumer, eventId): the processed marker and the consumer's own
 * database effects commit in the same transaction (SPEC-004 EVT-002, SPEC-005 EVT-003).
 * Returns false when the event had already been processed (duplicate delivery).
 */
export async function withIdempotentConsumer(
  prisma: PrismaClient,
  consumer: string,
  eventId: string,
  fn: (tx: TxClient) => Promise<void>,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO processed_events (consumer, event_id, processed_at)
      VALUES (${consumer}, ${eventId}::uuid, now())
      ON CONFLICT DO NOTHING`;
    if (inserted === 0) return false;
    await fn(tx);
    return true;
  });
}
