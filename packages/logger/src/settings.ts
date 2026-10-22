import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Logging environment variables shared by api, worker and web (server side).
 *  LOG_LEVEL            minimum level for console + main log file (default info)
 *  LOG_PRETTY           human-readable console output (default false → JSON)
 *  LOG_TO_FILE          also write rotating files under LOG_DIR (default: on in development only)
 *  LOG_DIR              directory for log files (default: <repo root>/logs)
 *  LOG_FILE_MAX_SIZE    rotate when a file reaches this size, e.g. 10m, 512k (default 10m)
 *  LOG_FILE_RETENTION   number of rotated files kept per stream (default 14)
 */
export const logEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LOG_PRETTY: booleanString.default(false),
  LOG_TO_FILE: booleanString.optional(),
  LOG_DIR: z.string().min(1).optional(),
  LOG_FILE_MAX_SIZE: z
    .string()
    .regex(/^\d+[kmg]?$/i, 'use a size like 10m, 512k or 1g')
    .default('10m'),
  LOG_FILE_RETENTION: z.coerce.number().int().min(1).max(365).default(14),
});

export interface LogSettings {
  level: LogLevel;
  pretty: boolean;
  toFile: boolean;
  dir: string;
  maxSize: string;
  retention: number;
}

/** Walks up from `startDir` to the monorepo root (folder containing pnpm-workspace.yaml). */
export function findRepoRoot(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveLogSettings(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): LogSettings {
  const parsed = logEnvSchema.parse(env);
  const root = findRepoRoot(cwd) ?? cwd;
  const dir = parsed.LOG_DIR
    ? isAbsolute(parsed.LOG_DIR)
      ? parsed.LOG_DIR
      : resolve(root, parsed.LOG_DIR)
    : join(root, 'logs');
  return {
    level: parsed.LOG_LEVEL,
    pretty: parsed.LOG_PRETTY,
    toFile: parsed.LOG_TO_FILE ?? parsed.NODE_ENV === 'development',
    dir,
    maxSize: parsed.LOG_FILE_MAX_SIZE,
    retention: parsed.LOG_FILE_RETENTION,
  };
}
