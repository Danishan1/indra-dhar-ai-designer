import { z } from 'zod';

export const livenessSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  version: z.string(),
  time: z.string(),
});
export type Liveness = z.infer<typeof livenessSchema>;

const componentStatus = z.enum(['ok', 'down']);
export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: componentStatus,
    redis: componentStatus,
    objectStorage: componentStatus,
  }),
  time: z.string(),
});
export type Readiness = z.infer<typeof readinessSchema>;
