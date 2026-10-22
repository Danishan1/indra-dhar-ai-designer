import {
  type PingJobPayload,
  pingJobPayloadSchema,
  QueueNames,
  SystemJobNames,
} from '@ai-designer/contracts';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module.js';

/**
 * Producer for the `system` queue. Business jobs get durable Postgres records first (I03);
 * this queue only carries infrastructure/maintenance work.
 */
@Injectable()
export class SystemQueueService implements OnModuleDestroy {
  readonly queue: Queue;

  constructor(@Inject(REDIS) redis: Redis) {
    this.queue = new Queue(QueueNames.system, { connection: redis });
    // Errors are already logged by the shared Redis client; avoid unhandled 'error' events.
    this.queue.on('error', () => undefined);
  }

  async enqueuePing(requestedBy: string): Promise<string> {
    const payload: PingJobPayload = pingJobPayloadSchema.parse({
      requestedAt: new Date().toISOString(),
      requestedBy,
    });
    const job = await this.queue.add(SystemJobNames.ping, payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    return job.id ?? '';
  }

  async onModuleDestroy(): Promise<void> {
    // Queue.close() waits for pending Redis commands; never let an unreachable Redis block shutdown.
    await Promise.race([
      this.queue.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2_000).unref()),
    ]);
  }
}
