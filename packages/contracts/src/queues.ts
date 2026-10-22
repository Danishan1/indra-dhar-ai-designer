import { z } from 'zod';

/**
 * BullMQ queue names. Messages carry only identifiers; durable state lives in Postgres
 * (docs/plan/01-architecture.md §4.7). Queue payload schemas are validated on both sides.
 */
export const QueueNames = {
  /** Infrastructure/system jobs (ping, maintenance). */
  system: 'system',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export const SystemJobNames = {
  ping: 'ping',
} as const;

export const pingJobPayloadSchema = z.object({
  requestedAt: z.iso.datetime(),
  requestedBy: z.string().min(1),
});

export type PingJobPayload = z.infer<typeof pingJobPayloadSchema>;

export const pingJobResultSchema = z.object({
  pong: z.literal(true),
  processedAt: z.iso.datetime(),
  workerId: z.string(),
});

export type PingJobResult = z.infer<typeof pingJobResultSchema>;
