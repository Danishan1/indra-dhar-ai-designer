import {
  type PingJobResult,
  pingJobPayloadSchema,
  pingJobResultSchema,
  QueueNames,
  SystemJobNames,
} from '@ai-designer/contracts';
import { type Job, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

export interface SystemProcessorDeps {
  workerId: string;
  logger: Logger;
}

/** Pure processor for the `system` queue (unit-testable without Redis). */
export async function processSystemJob(
  job: Pick<Job, 'name' | 'data' | 'id'>,
  deps: SystemProcessorDeps,
): Promise<PingJobResult> {
  switch (job.name) {
    case SystemJobNames.ping: {
      const payload = pingJobPayloadSchema.parse(job.data);
      const result = pingJobResultSchema.parse({
        pong: true,
        processedAt: new Date().toISOString(),
        workerId: deps.workerId,
      });
      deps.logger.info(
        { jobId: job.id, requestedBy: payload.requestedBy },
        'system.ping processed',
      );
      return result;
    }
    default:
      throw new Error(`Unknown system job: ${job.name}`);
  }
}

export function createSystemWorker(
  connection: Redis,
  deps: SystemProcessorDeps,
  concurrency: number,
): Worker {
  const worker = new Worker(QueueNames.system, (job) => processSystemJob(job, deps), {
    connection,
    concurrency,
  });
  worker.on('failed', (job, err) =>
    deps.logger.error({ jobId: job?.id, err: err.message }, 'system job failed'),
  );
  worker.on('error', (err) => deps.logger.warn({ err: err.message }, 'system worker error'));
  return worker;
}
