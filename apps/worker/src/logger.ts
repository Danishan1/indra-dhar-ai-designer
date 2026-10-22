import { pino, type Logger } from 'pino';

import type { WorkerEnv } from './config.js';

/** Same redaction policy as the API (apps/api/src/platform/logging/logger-options.ts). */
export const REDACT_PATHS = [
  '*.password',
  '*.apiKey',
  '*.secret',
  '*.secretAccessKey',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.*.password',
  '*.*.apiKey',
  '*.*.secret',
  '*.*.token',
];

export function createLogger(
  env: Pick<WorkerEnv, 'LOG_LEVEL' | 'LOG_PRETTY' | 'APP_VERSION' | 'WORKER_ID'>,
): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'worker', version: env.APP_VERSION, workerId: env.WORKER_ID },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(env.LOG_PRETTY
      ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
      : {}),
  });
}
