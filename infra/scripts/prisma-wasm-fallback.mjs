#!/usr/bin/env node
/**
 * Prisma migration FALLBACK for environments that cannot download Prisma's native schema engine
 * (e.g. sandboxed cloud workspaces where binaries.prisma.sh is blocked).
 *
 * On a normal machine use the standard commands instead:  pnpm db:migrate  /  pnpm db:deploy
 *
 * This uses Prisma's own WebAssembly schema engine (@prisma/schema-engine-wasm, same engine commit
 * as the installed Prisma CLI) through the pg driver adapter, so generated SQL and the
 * `_prisma_migrations` bookkeeping are identical to `prisma migrate dev` / `prisma migrate deploy`.
 *
 * Usage (from repo root):
 *   node infra/scripts/prisma-wasm-fallback.mjs diff <migration_name>   # create a new migration from schema changes
 *   node infra/scripts/prisma-wasm-fallback.mjs deploy                  # apply pending migrations
 *
 * Env: DATABASE_URL (target), SHADOW_DATABASE_NAME (default aid_shadow; must exist, will be wiped).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dbDir = join(repoRoot, 'packages/db');
const rootEnv = join(repoRoot, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const [, , cmd, name] = process.argv;
if (!['diff', 'deploy'].includes(cmd ?? '') || (cmd === 'diff' && !name)) {
  console.error('Usage: prisma-wasm-fallback.mjs diff <name> | deploy');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const require = createRequire(join(dbDir, 'package.json'));
const engineCommit = JSON.parse(
  readFileSync(
    require.resolve('@prisma/engines-version/package.json', {
      paths: [dirname(require.resolve('prisma/package.json'))],
    }),
    'utf8',
  ),
).version;

// 1) Obtain the matching WASM schema engine from the npm registry (cached in the OS temp dir).
const cacheDir = join(tmpdir(), `prisma-schema-engine-wasm-${engineCommit}`);
if (!existsSync(join(cacheDir, 'package/schema_engine.js'))) {
  mkdirSync(cacheDir, { recursive: true });
  const tgz = execFileSync(
    'npm',
    ['pack', `@prisma/schema-engine-wasm@${engineCommit}`, '--silent'],
    { cwd: cacheDir, shell: process.platform === 'win32' },
  )
    .toString()
    .trim();
  execFileSync('tar', ['xzf', tgz], { cwd: cacheDir });
}
// Surface WASM panic messages (the engine expects this registry to exist).
globalThis.PRISMA_WASM_PANIC_REGISTRY ??= {
  set_message(message) {
    console.error(`[schema-engine panic] ${message}`);
  },
};
const { SchemaEngine } = await import(
  pathToFileURL(join(cacheDir, 'package/schema_engine.js')).href
);

// 2) pg driver adapter. adapter-pg 7.x cannot map the internal "char" type (OID 18) used by
//    catalog queries, so load a patched copy that maps it to Text.
const adapterEntry = require.resolve('@prisma/adapter-pg').replace(/index\.js$/, 'index.mjs');
const patched = adapterEntry.replace(/index\.mjs$/, 'index.wasm-fallback-v3.mjs');
if (!existsSync(patched)) {
  const src = readFileSync(adapterEntry, 'utf8');
  const marker = '    case ScalarColumnType.BPCHAR:';
  const splitter =
    '    const statements = script.split(";").map((stmt) => stmt.trim()).filter((stmt) => stmt.length > 0);';
  if (!src.includes(marker) || !src.includes(splitter)) {
    throw new Error('Unexpected @prisma/adapter-pg build; update the fallback patch.');
  }
  // (a) map OID 18 ("char", used by pg_catalog e.g. constraint types) → Character (the schema
  // describer reads it as char — Text makes CHECK constraints panic); (b) run migration scripts as one multi-statement query (the stock
  // adapter splits on ";", which breaks $$-quoted function bodies used by trigger migrations).
  writeFileSync(
    patched,
    src.replace(marker, `    case 18:\n      return ColumnTypeEnum.Character;\n${marker}`).replace(splitter, '    const statements = [script];'),
  );
}
const { PrismaPg } = await import(pathToFileURL(patched).href);
const { bindMigrationAwareSqlAdapterFactory } = await import(
  pathToFileURL(
    createRequire(adapterEntry)
      .resolve('@prisma/driver-adapter-utils')
      .replace(/index\.js$/, 'index.mjs'),
  ).href
);
const pg = (await import(pathToFileURL(createRequire(adapterEntry).resolve('pg')).href)).default;

const u = new URL(url);
const cfg = {
  host: u.hostname,
  port: Number(u.port || 5432),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
};
const shadowCfg = { ...cfg, database: process.env.SHADOW_DATABASE_NAME ?? 'aid_shadow' };
const factory = new PrismaPg(cfg);
const adapter = bindMigrationAwareSqlAdapterFactory({
  provider: factory.provider,
  adapterName: factory.adapterName,
  connect: () => factory.connect(),
  connectToShadowDb: async () => {
    const c = new pg.Client(shadowCfg);
    await c.connect();
    await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await c.end();
    return new PrismaPg(shadowCfg).connect();
  },
});

const schemaPath = join(dbDir, 'prisma/schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');
const migDir = join(dbDir, 'prisma/migrations');
const engine = await SchemaEngine.new(
  { datamodels: [[schemaPath, schema]] },
  () => undefined,
  adapter,
);
const filters = { externalTables: [], externalEnums: [] };

function migrationsList() {
  const dirs = existsSync(migDir)
    ? readdirSync(migDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  const lock = join(migDir, 'migration_lock.toml');
  return {
    baseDir: migDir,
    lockfile: {
      path: 'migration_lock.toml',
      content: existsSync(lock) ? readFileSync(lock, 'utf8') : null,
    },
    migrationDirectories: dirs.map((d) => ({
      path: d,
      migrationFile: {
        path: 'migration.sql',
        content: { tag: 'ok', value: readFileSync(join(migDir, d, 'migration.sql'), 'utf8') },
      },
    })),
    shadowDbInitScript: '',
  };
}

if (cmd === 'diff') {
  const res = await engine.diff({
    from: { tag: 'migrations', ...migrationsList() },
    to: { tag: 'schemaDatamodel', files: [{ path: schemaPath, content: schema }] },
    script: true,
    exitCode: null,
    filters,
  });
  const sql = res.stdout ?? '';
  if (!sql.trim() || /This is an empty migration/i.test(sql)) {
    console.log('No schema changes.');
  } else {
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const dir = join(migDir, `${ts}_${name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'migration.sql'), sql);
    console.log(`Created ${dir}\n\n${sql}`);
  }
} else {
  const res = await engine.applyMigrations({ migrationsList: migrationsList(), filters });
  console.log(
    'Applied migrations:',
    res.appliedMigrationNames.length ? res.appliedMigrationNames : 'none',
  );
}
process.exit(0);
