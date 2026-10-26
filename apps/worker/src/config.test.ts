import { describe, expect, it } from 'vitest';

import { parseWorkerEnv } from './config.js';

const S3 = {
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'a',
  S3_SECRET_ACCESS_KEY: 'b',
};

describe('parseWorkerEnv', () => {
  it('requires REDIS_URL and DATABASE_URL and applies defaults', () => {
    const env = parseWorkerEnv({
      ...S3,
      REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://a:b@localhost:5432/db',
    });
    expect(env.WORKER_CONCURRENCY_SYSTEM).toBe(2);
    expect(env.WORKER_ID.length).toBeGreaterThan(0);
  });

  it('fails with a readable message', () => {
    expect(() =>
      parseWorkerEnv({
        ...S3,
        REDIS_URL: 'http://x',
        DATABASE_URL: 'postgresql://a:b@localhost:5432/db',
      }),
    ).toThrow(/REDIS_URL/);
  });
});
