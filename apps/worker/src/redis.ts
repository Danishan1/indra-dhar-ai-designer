import { Redis } from 'ioredis';
import type { Logger } from 'pino';

/** BullMQ-compatible Redis connection (maxRetriesPerRequest must be null for workers). */
export function createRedisConnection(url: string, name: string, logger: Logger): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    connectionName: name,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });
  let lastLogged = 0;
  client.on('error', (err: Error) => {
    if (Date.now() - lastLogged > 10_000) {
      lastLogged = Date.now();
      logger.warn({ err: err.message }, 'redis connection error');
    }
  });
  return client;
}

export async function closeRedisConnection(client: Redis): Promise<void> {
  if (client.status === 'ready') await client.quit().catch(() => client.disconnect());
  else client.disconnect();
}
