import { describe, expect, it } from 'vitest';

import { ConfigValidationError, parseApiEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://aid:pw@localhost:5432/ai_designer',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-1234',
};

describe('parseApiEnv', () => {
  it('applies defaults to a minimal valid environment', () => {
    const env = parseApiEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.S3_BUCKET_ORIGINALS).toBe('aid-assets-original');
  });

  it('coerces numbers and booleans', () => {
    const env = parseApiEnv({ ...valid, API_PORT: '4100', S3_FORCE_PATH_STYLE: 'false' });
    expect(env.API_PORT).toBe(4100);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('lists every invalid or missing key in one readable error', () => {
    try {
      parseApiEnv({ API_PORT: 'abc', REDIS_URL: 'http://wrong' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const message = (err as Error).message;
      for (const key of [
        'API_PORT',
        'DATABASE_URL',
        'REDIS_URL',
        'S3_ENDPOINT',
        'S3_ACCESS_KEY_ID',
      ]) {
        expect(message).toContain(key);
      }
    }
  });

  it('does not echo secret values in the error message', () => {
    try {
      parseApiEnv({ ...valid, DATABASE_URL: 'not a url with s3cr3t' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('s3cr3t');
    }
  });
});

describe('auth configuration', () => {
  it('rejects a short BETTER_AUTH_SECRET and defaults session timeouts', () => {
    expect(() => parseApiEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    const env = parseApiEnv(valid);
    expect(env.SESSION_IDLE_TIMEOUT_MIN).toBe(7 * 24 * 60);
    expect(env.SESSION_ABSOLUTE_TIMEOUT_H).toBe(720);
    expect(env.AUTH_COOKIE_SECURE).toBe(true);
  });
});
