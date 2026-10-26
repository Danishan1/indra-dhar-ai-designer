import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { logEnvSchema } from '@ai-designer/logger';
import { z } from 'zod';

export const workerEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_VERSION: z.string().default('0.0.0'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    /** Object storage (I09: asset processing). Same values as the API. */
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false', '1', '0'])
      .transform((v) => v === 'true' || v === '1')
      .default(true),
    S3_BUCKET_ORIGINALS: z.string().min(3).default('aid-assets-original'),
    S3_BUCKET_DERIVED: z.string().min(3).default('aid-assets-derived'),
    ASSET_MAX_PIXELS: z.coerce.number().int().min(1_000_000).default(50_000_000),
    /** Malware scanner for uploads (ADR-029): none until ClamAV in I47; eicar-test for tests. */
    ASSET_SCANNER: z.enum(['none', 'eicar-test']).default('none'),
    WORKER_ID: z.string().min(1).default(`${hostname()}-${process.pid}`),
    WORKER_CONCURRENCY_SYSTEM: z.coerce.number().int().min(1).max(32).default(2),
    WORKER_CONCURRENCY_EVENTS: z.coerce.number().int().min(1).max(64).default(4),
    WORKER_CONCURRENCY_JOBS: z.coerce.number().int().min(1).max(64).default(2),
    /** Outbox dispatcher (ADR-005). */
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(500),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(50),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(10),
    /** Durable-job recovery sweeper (ADR-023). */
    JOB_SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    /** queued jobs untouched for this long are re-enqueued (Redis lost the message). */
    JOB_REQUEUE_AFTER_MS: z.coerce.number().int().min(0).default(60_000),
    /** running jobs without a heartbeat for this long are considered abandoned (worker crashed). */
    JOB_STALE_AFTER_MS: z.coerce.number().int().min(1000).default(300_000),
  })
  .extend(logEnvSchema.omit({ NODE_ENV: true }).shape);

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
