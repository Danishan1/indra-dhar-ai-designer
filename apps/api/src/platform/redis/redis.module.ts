import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfig } from '../config/app-config.js';

export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

/**
 * Creates an ioredis client suitable for both caching and BullMQ (maxRetriesPerRequest: null).
 * Connection errors are logged (rate-limited) instead of surfacing as unhandled events; the
 * readiness endpoint reports Redis as `down` while it is unreachable.
 */
export function createRedisClient(url: string, connectionName: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });
  let lastLogged = 0;
  client.on('error', (err: Error) => {
    const now = Date.now();
    if (now - lastLogged > 10_000) {
      lastLogged = now;
      logger.warn(`Redis connection error (${connectionName}): ${err.message}`);
    }
  });
  return client;
}

/** Closes a client gracefully when connected, otherwise disconnects immediately. */
export async function closeRedisClient(client: Redis): Promise<void> {
  if (client.status === 'ready') {
    await client.quit().catch(() => client.disconnect());
  } else {
    client.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedisClient(config.env.REDIS_URL, 'aid-api'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await closeRedisClient(this.redis);
  }
}
