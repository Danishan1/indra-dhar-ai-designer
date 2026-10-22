import 'server-only';

import { createServiceLogger, type Logger } from '@ai-designer/logger';

/**
 * Web (Next.js server) loggers. Files (when LOG_TO_FILE is on, default in development):
 *   logs/web/server.<date>.<n>.log, logs/web/server-error.<date>.<n>.log — server-side errors/events
 *   logs/web/client.<date>.<n>.log, logs/web/client-error.<date>.<n>.log — errors reported by browsers
 */
const cache = new Map<string, Promise<Logger>>();

export function getWebLogger(stream: 'server' | 'client'): Promise<Logger> {
  let logger = cache.get(stream);
  if (!logger) {
    logger = createServiceLogger({ service: 'web', stream, base: { stream } }).then(
      (r) => r.logger,
    );
    cache.set(stream, logger);
  }
  return logger;
}
