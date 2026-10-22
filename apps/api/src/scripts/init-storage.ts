/**
 * Creates the private buckets the platform needs (idempotent). Run via `pnpm infra:init`
 * after `pnpm infra:up`. Bucket names come from S3_BUCKET_* env vars.
 */
import { AppConfig } from '../platform/config/app-config.js';
import { loadRootEnv } from '../platform/config/load-env.js';
import { S3ObjectStorage } from '../platform/storage/object-storage.js';

loadRootEnv();
const config = AppConfig.fromProcessEnv();
const storage = new S3ObjectStorage(config.storage);
try {
  for (const bucket of Object.values(config.storage.buckets)) {
    const result = await storage.ensureBucket(bucket);
    console.warn(`[storage:init] ${bucket}: ${result}`);
  }
} finally {
  storage.destroy();
}
