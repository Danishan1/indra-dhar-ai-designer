import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createServiceLogger } from './logger.js';
import { resolveLogSettings } from './settings.js';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'aid-logs-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function readAll(dir: string, prefix: string): string {
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.log'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('');
}

const flush = () => new Promise((r) => setTimeout(r, 150));

describe('resolveLogSettings', () => {
  it('writes files by default only in development, into <repo>/logs', () => {
    const dev = resolveLogSettings({ NODE_ENV: 'development' });
    expect(dev.toFile).toBe(true);
    expect(dev.dir.replace(/\\/g, '/')).toMatch(/\/logs$/);
    expect(resolveLogSettings({ NODE_ENV: 'test' }).toFile).toBe(false);
    expect(resolveLogSettings({ NODE_ENV: 'production' }).toFile).toBe(false);
    expect(resolveLogSettings({ NODE_ENV: 'production', LOG_TO_FILE: 'true' }).toFile).toBe(true);
  });

  it('validates size and retention', () => {
    expect(() => resolveLogSettings({ LOG_FILE_MAX_SIZE: 'big' })).toThrow();
    expect(resolveLogSettings({ LOG_FILE_RETENTION: '7' }).retention).toBe(7);
  });
});

describe('createServiceLogger with files', () => {
  it('writes all logs and an error-only file per service, redacting secrets', async () => {
    const dir = tempDir();
    const settings = resolveLogSettings({
      NODE_ENV: 'development',
      LOG_DIR: dir,
      LOG_LEVEL: 'info',
    });
    const { logger } = await createServiceLogger({ service: 'api', settings, console: false });

    logger.info({ user: { password: 'hunter2' } }, 'hello');
    logger.debug('not written at info level');
    logger.error({ err: new Error('boom') }, 'failed');
    await flush();

    const serviceDir = join(dir, 'api');
    const all = readAll(serviceDir, 'api.2');
    const errors = readAll(serviceDir, 'api-error.');
    expect(all).toContain('hello');
    expect(all).toContain('failed');
    expect(all).not.toContain('not written');
    expect(all).not.toContain('hunter2');
    expect(all).toContain('[REDACTED]');
    expect(errors).toContain('failed');
    expect(errors).not.toContain('hello');
    expect(JSON.parse(errors.trim().split('\n')[0] ?? '{}')).toMatchObject({
      service: 'api',
      level: 50,
    });
  });

  it('supports a named stream inside a service folder', async () => {
    const dir = tempDir();
    const settings = resolveLogSettings({ NODE_ENV: 'development', LOG_DIR: dir });
    const { logger } = await createServiceLogger({
      service: 'web',
      stream: 'client',
      settings,
      console: false,
    });
    logger.warn('client side warning');
    await flush();
    expect(readAll(join(dir, 'web'), 'client.2')).toContain('client side warning');
  });

  it('writes no files when LOG_TO_FILE is false', async () => {
    const dir = tempDir();
    const settings = resolveLogSettings({
      NODE_ENV: 'development',
      LOG_DIR: dir,
      LOG_TO_FILE: 'false',
    });
    const { logger } = await createServiceLogger({ service: 'worker', settings, console: false });
    logger.info('x');
    await flush();
    expect(readdirSync(dir)).toEqual([]);
  });
});
