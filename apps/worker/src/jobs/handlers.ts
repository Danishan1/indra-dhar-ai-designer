import { JobKinds } from '@ai-designer/contracts';
import { type AssetProcessingDeps, processAsset } from '@ai-designer/media';
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

const assetPayload = z.object({ assetId: z.uuid() });

/** `asset.process` (I09): validate, scan, sanitize and derive a quarantined upload. */
export function assetProcessHandler(deps: AssetProcessingDeps): JobHandler {
  return async ({ payload, logger }) => {
    const { assetId } = assetPayload.parse(payload);
    const outcome = await processAsset(deps, assetId);
    logger.info({ assetId, outcome: outcome.status }, 'asset processed');
    return outcome;
  };
}

export interface JobHandlerDeps {
  assets?: AssetProcessingDeps;
}

/** Registry of job kinds → handlers. Later iterations add their kinds here. */
export function createJobHandlers(deps: JobHandlerDeps = {}): Map<string, JobHandler> {
  const handlers = new Map<string, JobHandler>([[JobKinds.systemNoop, noopHandler]]);
  if (deps.assets) handlers.set(JobKinds.assetProcess, assetProcessHandler(deps.assets));
  return handlers;
}
