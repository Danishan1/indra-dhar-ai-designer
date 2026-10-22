import { createServiceLogger, type LogSettings, resolveLogSettings } from '@ai-designer/logger';
import type { Logger } from 'pino';

import type { WorkerEnv } from './config.js';

export { REDACT_PATHS } from '@ai-designer/logger';

/**
 * Worker logger: console + (LOG_TO_FILE, default on in development) rotating files
 * logs/worker/worker.<date>.<n>.log and logs/worker/worker-error.<date>.<n>.log.
 */
export async function createLogger(
  env: Pick<WorkerEnv, 'APP_VERSION' | 'WORKER_ID'>,
  settings: LogSettings = resolveLogSettings(),
): Promise<Logger> {
  const { logger } = await createServiceLogger({
    service: 'worker',
    version: env.APP_VERSION,
    base: { workerId: env.WORKER_ID },
    settings,
  });
  return logger;
}
