/**
 * Integration-test global setup: resets the TEST database schema and applies every migration SQL
 * file in order (equivalent outcome to `prisma migrate reset`, without requiring the Prisma
 * schema-engine binary), then makes sure test buckets exist.
 */
import { resetTestDatabase } from '@ai-designer/db/testing';

import { AppConfig } from '../../src/platform/config/app-config.js';
import { S3ObjectStorage } from '../../src/platform/storage/object-storage.js';

import { applyTestEnv } from './test-env.js';

export async function setup(): Promise<void> {
  applyTestEnv();
  await resetTestDatabase(process.env.DATABASE_URL ?? '');

  const config = AppConfig.fromProcessEnv();
  const storage = new S3ObjectStorage(config.storage);
  try {
    for (const bucket of Object.values(config.storage.buckets)) await storage.ensureBucket(bucket);
  } finally {
    storage.destroy();
  }
}
