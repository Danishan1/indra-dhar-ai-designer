import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AppConfig } from '../config/app-config.js';
import { parseApiEnv } from '../config/env.schema.js';
import { AppError } from '../errors/app-error.js';

import { CsrfMiddleware } from './csrf.middleware.js';

const config = new AppConfig(
  parseApiEnv({
    DATABASE_URL: 'postgresql://a:b@localhost/db',
    REDIS_URL: 'redis://localhost',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'k',
    S3_SECRET_ACCESS_KEY: 's',
    BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-1234',
    APP_BASE_URL: 'http://localhost:3000',
  }),
);
const mw = new CsrfMiddleware(config);

function run(method: string, headers: Record<string, string>) {
  const next = vi.fn();
  mw.use({ method, headers } as unknown as Request, {} as Response, next);
  const arg = next.mock.calls[0]?.[0] as unknown;
  return arg instanceof AppError ? arg.code : 'ok';
}

describe('CsrfMiddleware (FR-SEC-049)', () => {
  const cookie = '__Host-aid_session=abc.sig';
  it('allows safe methods and trusted origins', () => {
    expect(run('GET', { cookie, origin: 'https://evil.example' })).toBe('ok');
    expect(run('POST', { cookie, origin: 'http://localhost:3000' })).toBe('ok');
  });

  it('blocks untrusted origins and cookie requests without origin or same-origin fetch metadata', () => {
    expect(run('POST', { origin: 'https://evil.example' })).toBe('PERMISSION_DENIED');
    expect(run('DELETE', { cookie })).toBe('PERMISSION_DENIED');
    expect(run('PATCH', { cookie, 'sec-fetch-site': 'cross-site' })).toBe('PERMISSION_DENIED');
    expect(run('PATCH', { cookie, 'sec-fetch-site': 'same-origin' })).toBe('ok');
  });

  it('does not affect cookie-less non-browser clients', () => {
    expect(run('POST', {})).toBe('ok');
  });
});
