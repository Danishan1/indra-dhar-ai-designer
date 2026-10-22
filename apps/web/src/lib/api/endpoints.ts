import { livenessSchema, readinessSchema } from '@ai-designer/contracts';

import { apiRequest } from './client';

/** Typed API calls, grouped by area. Features add theirs in features/<feature>/api.ts. */
export const systemApi = {
  liveness: (signal?: AbortSignal) =>
    apiRequest('/v1/health', { schema: livenessSchema, ...(signal ? { signal } : {}) }),
  readiness: (signal?: AbortSignal) =>
    apiRequest('/v1/health/ready', {
      schema: readinessSchema,
      acceptStatuses: [503],
      ...(signal ? { signal } : {}),
    }),
};

/** Dev-only example routes (apps/api/src/modules/dev-examples) used for diagnostics. */
export const devApi = {
  echo: (message: string, idempotencyKey?: string) =>
    apiRequest('/v1/_dev/echo-idempotent', {
      method: 'POST',
      body: { message },
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
};
