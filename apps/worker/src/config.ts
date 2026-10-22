import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: booleanString.default(false),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  WORKER_ID: z.string().min(1).default(`${hostname()}-${process.pid}`),
  WORKER_CONCURRENCY_SYSTEM: z.coerce.number().int().min(1).max(32).default(2),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseWorkerEnv(env: NodeJS.ProcessEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid worker configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}

/** Loads the repository-root .env without overriding real environment variables. */
export function loadRootEnv(startDir: string = process.cwd()): void {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      if (existsSync(join(dir, '.env'))) process.loadEnvFile(join(dir, '.env'));
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
