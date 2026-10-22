import { createPrismaClient, type PrismaClient } from '@ai-designer/db';
import type { Worker } from 'bullmq';
import type { Logger } from 'pino';

import { type WorkerEnv } from './config.js';
import { type EventConsumer, platformConsumers } from './events/consumers.js';
import { createJobHandlers } from './jobs/handlers.js';
import { createLogger } from './logger.js';
import { MaintenanceSweeper } from './maintenance/sweeper.js';
import { OutboxDispatcher } from './outbox/dispatcher.js';
import { createEventsWorker, createJobsWorker, QueueProducers } from './queues/pipelines.js';
import { createSystemWorker } from './queues/system.js';
import { closeRedisConnection, createRedisConnection } from './redis.js';

export interface WorkerHandle {
  readonly startedAt: Date;
  readonly logger: Logger;
  readonly workers: readonly Worker[];
  readonly prisma: PrismaClient;
  readonly producers: QueueProducers;
  readonly dispatcher: OutboxDispatcher;
  readonly sweeper: MaintenanceSweeper;
  stop(): Promise<void>;
}

export interface StartWorkerOptions {
  logger?: Logger;
  /** Extra event consumers (tests; later iterations register theirs in events/consumers.ts). */
  consumers?: EventConsumer[];
  /** Start the outbox dispatcher and sweeper loops (default true; tests drive them manually). */
  loops?: boolean;
}

/**
 * Starts the worker: system queue (ping), outbox dispatcher → `events` queue → idempotent
 * consumers, durable `jobs` queue → DurableJobProcessor, and the maintenance sweeper.
 * BullMQ messages only ever carry identifiers (docs/plan/01-architecture.md §4.7).
 */
export async function startWorker(
  env: WorkerEnv,
  options: StartWorkerOptions = {},
): Promise<WorkerHandle> {
  const logger = options.logger ?? (await createLogger(env));
  const startedAt = new Date();
  const prisma = createPrismaClient(env.DATABASE_URL);
  const connection = createRedisConnection(env.REDIS_URL, `aid-worker-${env.WORKER_ID}`, logger);
  const producers = new QueueProducers(connection);
  const deps = {
    prisma,
    producers,
    consumers: [...platformConsumers, ...(options.consumers ?? [])],
    handlers: createJobHandlers(),
    workerId: env.WORKER_ID,
    logger,
  };
  const workers = [
    createSystemWorker(
      connection,
      { workerId: env.WORKER_ID, logger },
      env.WORKER_CONCURRENCY_SYSTEM,
    ),
    createEventsWorker(connection, deps, env.WORKER_CONCURRENCY_EVENTS),
    createJobsWorker(connection, deps, env.WORKER_CONCURRENCY_JOBS),
  ];
  const dispatcher = new OutboxDispatcher(
    prisma,
    (envelope) => producers.publishEvent(envelope),
    {
      batchSize: env.OUTBOX_BATCH_SIZE,
      maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
      pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    },
    logger,
  );
  const sweeper = new MaintenanceSweeper(
    prisma,
    (id) => producers.enqueueJob(id),
    {
      intervalMs: env.JOB_SWEEP_INTERVAL_MS,
      requeueAfterMs: env.JOB_REQUEUE_AFTER_MS,
      staleAfterMs: env.JOB_STALE_AFTER_MS,
    },
    logger,
  );
  if (options.loops !== false) {
    dispatcher.start();
    sweeper.start();
  }
  logger.info({ queues: workers.map((w) => w.name), workerId: env.WORKER_ID }, 'worker ready');
  return {
    startedAt,
    logger,
    workers,
    prisma,
    producers,
    dispatcher,
    sweeper,
    async stop() {
      sweeper.stop();
      await dispatcher.stop();
      await Promise.all(workers.map((w) => w.close()));
      await producers.close();
      await closeRedisConnection(connection);
      await prisma.$disconnect();
      logger.info('worker stopped');
    },
  };
}
