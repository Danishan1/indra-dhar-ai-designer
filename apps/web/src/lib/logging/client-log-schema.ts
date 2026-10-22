import { z } from 'zod';

/** Payload accepted by POST /api/client-logs (browser errors reported by the web app). */
export const clientLogSchema = z.object({
  level: z.enum(['error', 'warn', 'info']).default('error'),
  kind: z.enum(['error', 'unhandledrejection', 'error-boundary', 'global-error', 'manual']),
  message: z.string().min(1).max(2_000),
  stack: z.string().max(8_000).optional(),
  digest: z.string().max(200).optional(),
  url: z.string().max(2_000).optional(),
  userAgent: z.string().max(500).optional(),
  occurredAt: z.iso.datetime().optional(),
});

export type ClientLogEntry = z.infer<typeof clientLogSchema>;

/** Hard limit on request body size accepted by the endpoint. */
export const CLIENT_LOG_MAX_BYTES = 16 * 1024;
