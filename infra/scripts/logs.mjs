#!/usr/bin/env node
/**
 * Local log viewer for files under logs/ (see logs/README.md). Cross-platform.
 *   pnpm logs [api|worker|web|all] [--errors] [-f|--follow] [-n <lines>] [--raw] [--clear]
 */
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const logDir = process.env.LOG_DIR ? resolve(root, process.env.LOG_DIR) : join(root, 'logs');

const args = process.argv.slice(2);
const flag = (...names) => names.some((n) => args.includes(n));
const valueOf = (...names) => {
  const i = args.findIndex((a) => names.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
};
const SERVICES = ['api', 'worker', 'web'];
const service = args.find((a) => SERVICES.includes(a) || a === 'all') ?? 'all';
const services = service === 'all' ? SERVICES : [service];
const errorsOnly = flag('--errors', '-e');
const follow = flag('--follow', '-f');
const raw = flag('--raw');
const lines = Number(valueOf('-n', '--lines') ?? 50);

if (flag('--help', '-h')) {
  console.log(
    'Usage: pnpm logs [api|worker|web|all] [--errors] [-f|--follow] [-n <lines>] [--raw] [--clear]',
  );
  process.exit(0);
}

if (flag('--clear')) {
  for (const s of SERVICES) rmSync(join(logDir, s), { recursive: true, force: true });
  console.log(`Cleared log files in ${logDir}`);
  process.exit(0);
}

// pino-pretty is a dependency of @ai-designer/logger.
let prettify = (line) => line;
if (!raw) {
  try {
    const require = createRequire(join(root, 'packages/logger/package.json'));
    const { prettyFactory } = require('pino-pretty');
    const p = prettyFactory({
      colorize: process.stdout.isTTY,
      singleLine: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
    });
    prettify = (line) => {
      try {
        return p(JSON.parse(line)).replace(/\n$/, '');
      } catch {
        return line;
      }
    };
  } catch {
    // fall back to raw output
  }
}

/** Latest file per stream in a service folder, e.g. api + api-error. */
function currentFiles(svc) {
  const dir = join(logDir, svc);
  if (!existsSync(dir)) return [];
  const byStream = new Map();
  for (const name of readdirSync(dir)) {
    const m = name.match(/^(.+?)\.\d{4}-\d{2}-\d{2}\.\d+\.log$/);
    if (!m) continue;
    const stream = m[1];
    if (errorsOnly !== stream.endsWith('-error')) continue;
    const full = join(dir, name);
    const mtime = statSync(full).mtimeMs;
    const prev = byStream.get(stream);
    if (!prev || mtime > prev.mtime) byStream.set(stream, { file: full, mtime });
  }
  return [...byStream.values()].map((v) => v.file);
}

function timeOf(line) {
  try {
    const t = JSON.parse(line).time;
    return typeof t === 'number' ? t : Date.parse(t);
  } catch {
    return 0;
  }
}

const files = services.flatMap(currentFiles);
if (files.length === 0) {
  console.log(
    `No ${errorsOnly ? 'error ' : ''}log files yet in ${logDir} for: ${services.join(', ')}.`,
  );
  console.log('Start the apps with `pnpm dev` (LOG_TO_FILE defaults to true in development).');
  if (!follow) process.exit(0);
}

const entries = files
  .flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean))
  .sort((a, b) => timeOf(a) - timeOf(b))
  .slice(-lines);
for (const line of entries) console.log(prettify(line));

if (follow) {
  const offsets = new Map(files.map((f) => [f, statSync(f).size]));
  const readNew = (file) => {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    const from = offsets.get(file) ?? 0;
    if (size <= from) return offsets.set(file, size);
    const fd = openSync(file, 'r');
    const buf = Buffer.alloc(size - from);
    readSync(fd, buf, 0, buf.length, from);
    closeSync(fd);
    offsets.set(file, size);
    for (const line of buf.toString('utf8').split('\n').filter(Boolean))
      console.log(prettify(line));
  };
  console.log(
    `--- following ${services.join(', ')}${errorsOnly ? ' (errors)' : ''} — Ctrl+C to stop ---`,
  );
  // Poll (works on every OS, survives rotation: new files are picked up each tick).
  setInterval(() => {
    for (const f of services.flatMap(currentFiles)) {
      if (!offsets.has(f)) offsets.set(f, 0);
      readNew(f);
    }
  }, 500);
}
