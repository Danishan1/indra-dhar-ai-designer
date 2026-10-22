import { pingJobPayloadSchema, SystemJobNames } from '@ai-designer/contracts';
import { afterAll, describe, expect, it } from 'vitest';

import { SystemQueueService } from './system-queue.service.js';
import { closeRedisClient, createRedisClient } from '../redis/redis.module.js';

describe('SystemQueueService (integration)', () => {
  const redis = createRedisClient(process.env.REDIS_URL ?? '', 'aid-api-test');
  const service = new SystemQueueService(redis);

  afterAll(async () => {
    await service.queue.obliterate({ force: true });
    await service.onModuleDestroy();
    await closeRedisClient(redis);
  });

  it('enqueues a validated ping job on the system queue', async () => {
    const id = await service.enqueuePing('integration-test');
    const job = await service.queue.getJob(id);
    expect(job?.name).toBe(SystemJobNames.ping);
    expect(pingJobPayloadSchema.parse(job?.data).requestedBy).toBe('integration-test');
  });
});
