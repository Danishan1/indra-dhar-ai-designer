import { z } from 'zod';

/**
 * Durable job vocabulary (ADR-023). I03 provides the generic lifecycle; I21 extends states for AI
 * jobs (awaiting_provider, outcome_unknown, …) — see docs/plan/03-domain-model.md §1.
 */
export const JobStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export const jobStatusSchema = z.enum(JobStatuses);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JobKinds = {
  /** Test/diagnostic job that does nothing. */
  systemNoop: 'system.noop',
} as const;
export type JobKind = (typeof JobKinds)[keyof typeof JobKinds] | (string & {});

/** BullMQ message for durable jobs: identifiers only (docs/plan/01-architecture.md §4.7). */
export const durableJobMessageSchema = z.object({ jobId: z.uuid() });
export type DurableJobMessage = z.infer<typeof durableJobMessageSchema>;

export const jobViewSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  kind: z.string(),
  status: jobStatusSchema,
  attempts: z.number().int(),
  result: z.unknown().nullable(),
  failure: z.unknown().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type JobView = z.infer<typeof jobViewSchema>;
