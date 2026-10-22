import { JobKinds } from '@ai-designer/contracts';
import { z } from 'zod';

import type { JobHandler } from './durable-job-processor.js';

const noopPayload = z.object({
  message: z.string().optional(),
  /** Test hook: fail the first N attempts. */
  failTimes: z.number().int().min(0).optional(),
});

/** `system.noop`: does nothing (diagnostics, tests, the dev example endpoint). */
export const noopHandler: JobHandler = async ({ job, payload }) => {
  const input = noopPayload.parse(payload);
  if (input.failTimes && job.attempts <= input.failTimes) {
    throw new Error(`noop: simulated failure ${job.attempts}/${input.failTimes}`);
  }
  return { ok: true, ...(input.message ? { message: input.message } : {}) };
};

/** Registry of job kinds → handlers. Later iterations add their kinds here. */
export function createJobHandlers(): Map<string, JobHandler> {
  return new Map<string, JobHandler>([[JobKinds.systemNoop, noopHandler]]);
}
