/**
 * Dev-only: enqueue a `system.ping` job and wait for the worker's answer.
 * Proves API → Redis/BullMQ → worker transport (I02 AC5).  Usage: pnpm --filter @ai-designer/api dev:ping
 */
import { pingJobResultSchema, QueueNames } from '@ai-designer/contracts';
import { QueueEvents } from 'bullmq';

import { AppConfig } from '../platform/config/app-config.js';
import { loadRootEnv } from '../platform/config/load-env.js';
import { SystemQueueService } from '../platform/queue/system-queue.service.js';
import { closeRedisClient, createRedisClient } from '../platform/redis/redis.module.js';

loadRootEnv();
const config = AppConfig.fromProcessEnv();
const redis = createRedisClient(config.env.REDIS_URL, 'aid-dev-ping');
const service = new SystemQueueService(redis);
const events = new QueueEvents(QueueNames.system, { connection: { url: config.env.REDIS_URL } });
try {
  await events.waitUntilReady();
  const id = await service.enqueuePing('dev:ping');
  const job = await service.queue.getJob(id);
  const result = pingJobResultSchema.parse(await job?.waitUntilFinished(events, 10_000));
  console.warn(
    `[dev:ping] job ${id} answered by worker ${result.workerId} at ${result.processedAt}`,
  );
} finally {
  await events.close();
  await service.onModuleDestroy();
  await closeRedisClient(redis);
}
