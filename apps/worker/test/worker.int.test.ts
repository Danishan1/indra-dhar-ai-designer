import { pingJobResultSchema, QueueNames, SystemJobNames } from '@ai-designer/contracts';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseWorkerEnv } from '../src/config.js';
import { startWorker, type WorkerHandle } from '../src/worker.js';

// Test-profile Redis (pnpm infra:test:up). Override with AID_IT_REDIS_URL.
const REDIS_URL = process.env.AID_IT_REDIS_URL ?? 'redis://localhost:56379';

describe('worker ↔ BullMQ round trip (integration)', () => {
  let handle: WorkerHandle;
  let producerConn: Redis;
  let queue: Queue;
  let events: QueueEvents;

  beforeAll(async () => {
    handle = await startWorker(
      parseWorkerEnv({ REDIS_URL, WORKER_ID: 'it-worker', LOG_LEVEL: 'silent' }),
      pino({ level: 'silent' }),
    );
    producerConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    queue = new Queue(QueueNames.system, { connection: producerConn });
    events = new QueueEvents(QueueNames.system, { connection: { url: REDIS_URL } });
    await events.waitUntilReady();
  });

  afterAll(async () => {
    await handle.stop();
    await events.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await producerConn.quit();
  });

  it('processes a ping enqueued by a producer within 5s', async () => {
    const job = await queue.add(SystemJobNames.ping, {
      requestedAt: new Date().toISOString(),
      requestedBy: 'api',
    });
    const result = pingJobResultSchema.parse(await job.waitUntilFinished(events, 5_000));
    expect(result).toMatchObject({ pong: true, workerId: 'it-worker' });
  });
});
