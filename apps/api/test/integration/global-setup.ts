/**
 * Integration-test global setup: resets the TEST database schema and applies every migration SQL
 * file in order (equivalent outcome to `prisma migrate reset`, without requiring the Prisma
 * schema-engine binary), then makes sure test buckets exist.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

import { applyTestEnv } from './test-env.js';
import { AppConfig } from '../../src/platform/config/app-config.js';
import { S3ObjectStorage } from '../../src/platform/storage/object-storage.js';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../prisma/migrations');

export async function setup(): Promise<void> {
  applyTestEnv();
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!url.pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${url.pathname.slice(1)}"`);
  }
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const name of migrations) {
      await client.query(readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    }
  } finally {
    await client.end();
  }

  const config = AppConfig.fromProcessEnv();
  const storage = new S3ObjectStorage(config.storage);
  try {
    for (const bucket of Object.values(config.storage.buckets)) await storage.ensureBucket(bucket);
  } finally {
    storage.destroy();
  }
}
