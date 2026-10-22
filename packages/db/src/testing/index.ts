/**
 * Integration-test helpers shared by api and worker (`@ai-designer/db/testing`). Never import from
 * production code.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations', import.meta.url));

/** Defaults: the isolated compose `test` profile (`pnpm infra:test:up`). */
export const TEST_DATABASE_URL =
  'postgresql://aid:aid_test_password@localhost:55432/ai_designer_test';
export const TEST_REDIS_URL = 'redis://localhost:56379';

function findRepoRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * Applies forced test values, each overridable with AID_IT_<KEY> from the shell or from the
 * repository-root .env (only AID_IT_* keys are read from .env, so dev settings never leak in).
 */
export function applyIntegrationEnv(defaults: Record<string, string>): void {
  const root = findRepoRoot(process.cwd());
  const envFile = root ? join(root, '.env') : undefined;
  const fromFile = envFile && existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  for (const [key, value] of Object.entries(defaults)) {
    const overrideKey = `AID_IT_${key}`;
    process.env[key] = process.env[overrideKey] ?? fromFile[overrideKey] ?? value;
  }
}

async function ensureDatabaseExists(url: URL): Promise<void> {
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      dbName,
    ]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

/**
 * Drops and recreates the `public` schema of a *_test database and applies every migration SQL in
 * order (same result as `prisma migrate reset`, without the Prisma schema-engine binary).
 */
export async function resetTestDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  if (!url.pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database "${url.pathname.slice(1)}"`);
  }
  await ensureDatabaseExists(url);
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
}
