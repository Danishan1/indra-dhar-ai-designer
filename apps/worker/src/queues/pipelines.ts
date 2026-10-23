import {
  durableJobMessageSchema,
  type EventEnvelope,
  eventEnvelopeSchema,
  QueueNames,
} from '@ai-designer/contracts';
import type { PrismaClient } from '@ai-designer/db';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { type EventConsumer, processEvent } from '../events/consumers.js';
import {
  type JobHandler,
  RetryableJobError,
  runDurableJob,
} from '../jobs/durable-job-processor.js';

/** Producers for the `events` and `jobs` queues. Message ids dedupe re-publishing. */
export class QueueProducers {
  readonly events: Queue;
  readonly jobs: Queue;

  constructor(connection: Redis) {
    this.events = new Queue(QueueNames.events, { connection });
    this.jobs = new Queue(QueueNames.jobs, { connection });
  }

  async publishEvent(envelope: EventEnvelope): Promise<void> {
    await this.events.add(envelope.type, envelope, {
      jobId: envelope.eventId,
      attempts: 8,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });
  }

  async enqueueJob(jobId: string): Promise<void> {
    await this.jobs.add('run', durableJobMessageSchema.parse({ jobId }), {
      jobId,
      attempts: 10,
      backoff: { type: 'exponential', delay: 2000 },
      // Freed ids let the sweeper re-enqueue a job whose message was lost or exhausted.
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async close(): Promise<void> {
    await Promise.all([this.events.close(), this.jobs.close()]);
  }
}

export interface PipelineDeps {
  prisma: PrismaClient;
  producers: QueueProducers;
  consumers: readonly EventConsumer[];
  handlers: ReadonlyMap<string, JobHandler>;
  workerId: string;
  logger: Logger;
}

export function createEventsWorker(
  connection: Redis,
  deps: PipelineDeps,
  concurrency: number,
): Worker {
  const worker = new Worker(
    QueueNames.events,
    async (job) => {
      const envelope = eventEnvelopeSchema.parse(job.data) as EventEnvelope;
      return processEvent(envelope, deps.consumers, deps.prisma, {
        logger: deps.logger,
        enqueueJob: (id) => deps.producers.enqueueJob(id),
        invalidateCache: async (keys) => {
          if (keys.length) await connection.del(...keys);
        },
      });
    },
    { connection, concurrency },
  );
  worker.on('failed', (job, err) =>
    deps.logger.error(
      { eventId: job?.id, type: job?.name, attempts: job?.attemptsMade, err: err.message },
      'event processing failed',
    ),
  );
  worker.on('error', (err) => deps.logger.warn({ err: err.message }, 'events worker error'));
  return worker;
}

export function createJobsWorker(
  connection: Redis,
  deps: PipelineDeps,
  concurrency: number,
): Worker {
  const worker = new Worker(
    QueueNames.jobs,
    async (job) => {
      const { jobId } = durableJobMessageSchema.parse(job.data);
      const outcome = await runDurableJob(jobId, deps);
      if (outcome === 'retry') throw new RetryableJobError(`job ${jobId} will be retried`);
      return { outcome };
    },
    { connection, concurrency },
  );
  worker.on('error', (err) => deps.logger.warn({ err: err.message }, 'jobs worker error'));
  return worker;
}
