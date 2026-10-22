import type { Worker } from 'bullmq';
import type { Logger } from 'pino';

import { type WorkerEnv } from './config.js';
import { createLogger } from './logger.js';
import { createSystemWorker } from './queues/system.js';
import { closeRedisConnection, createRedisConnection } from './redis.js';

export interface WorkerHandle {
  readonly startedAt: Date;
  readonly logger: Logger;
  readonly workers: readonly Worker[];
  stop(): Promise<void>;
}

/**
 * Starts all queue consumers. I03 adds the durable-job processor base (jobs table in Postgres);
 * BullMQ messages only ever carry identifiers (docs/plan/01-architecture.md §4.7).
 */
export async function startWorker(
  env: WorkerEnv,
  logger: Logger = createLogger(env),
): Promise<WorkerHandle> {
  const startedAt = new Date();
  const connection = createRedisConnection(env.REDIS_URL, `aid-worker-${env.WORKER_ID}`, logger);
  const workers = [
    createSystemWorker(
      connection,
      { workerId: env.WORKER_ID, logger },
      env.WORKER_CONCURRENCY_SYSTEM,
    ),
  ];
  logger.info({ queues: workers.map((w) => w.name) }, 'worker ready');
  return {
    startedAt,
    logger,
    workers,
    async stop() {
      await Promise.all(workers.map((w) => w.close()));
      await closeRedisConnection(connection);
      logger.info('worker stopped');
    },
  };
}
