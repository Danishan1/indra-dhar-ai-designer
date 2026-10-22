#!/usr/bin/env node
/**
 * Cross-platform wrapper around Docker Compose for local infrastructure (Windows/macOS/Linux).
 *   node infra/scripts/infra.mjs up          start dev services, wait for health, create buckets
 *   node infra/scripts/infra.mjs down        stop dev services (data kept)
 *   node infra/scripts/infra.mjs reset --yes stop and DELETE all local dev data volumes
 *   node infra/scripts/infra.mjs test-up     start isolated test services (tmpfs) for integration tests
 *   node infra/scripts/infra.mjs test-down   stop and remove test services
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = join(root, 'infra/compose/docker-compose.dev.yml');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

// INFRA_LOCAL_POSTGRES=true → use a PostgreSQL installed on this machine instead of the container.
const localPostgres = ['true', '1'].includes(
  (process.env.INFRA_LOCAL_POSTGRES ?? '').toLowerCase(),
);
const devProfiles = localPostgres ? [] : ['--profile', 'docker-postgres'];
const TEST_SERVICES = [
  'redis-test',
  'objectstore-test',
  ...(localPostgres ? [] : ['postgres-test']),
];
const testProfiles = [
  '--profile',
  'test',
  ...(localPostgres ? [] : ['--profile', 'test-docker-postgres']),
];

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: root,
    shell: process.platform === 'win32',
    ...opts,
  });
  if (res.error) {
    console.error(`Failed to run ${cmd}: ${res.error.message}. Is Docker installed and running?`);
    process.exit(1);
  }
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const compose = (...args) => run('docker', ['compose', '-f', composeFile, ...args]);
const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'up':
    if (localPostgres)
      console.log(
        'INFRA_LOCAL_POSTGRES=true → skipping the PostgreSQL container (using DATABASE_URL).',
      );
    compose(...devProfiles, 'up', '-d', '--wait');
    run('pnpm', ['--filter', '@ai-designer/api', 'storage:init']);
    console.log('\nInfrastructure ready. Next: pnpm db:migrate && pnpm db:seed && pnpm dev');
    console.log('Mailpit UI: http://localhost:8025');
    break;
  case 'down':
    compose('--profile', 'docker-postgres', 'down');
    break;
  case 'reset':
    if (!rest.includes('--yes')) {
      console.error(
        'This deletes ALL local dev data (database, objects, redis). Re-run with --yes to confirm.',
      );
      process.exit(1);
    }
    compose('--profile', 'docker-postgres', 'down', '-v');
    break;
  case 'test-up':
    compose(...testProfiles, 'up', '-d', '--wait', ...TEST_SERVICES);
    if (localPostgres) {
      console.log(
        'INFRA_LOCAL_POSTGRES=true → integration tests use AID_IT_DATABASE_URL (database name must end in _test; it is created automatically).',
      );
    }
    break;
  case 'test-down':
    compose(...testProfiles, 'rm', '-s', '-f', ...TEST_SERVICES);
    break;
  default:
    console.error('Usage: infra.mjs <up|down|reset --yes|test-up|test-down>');
    process.exit(1);
}
