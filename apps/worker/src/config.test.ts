import { describe, expect, it } from 'vitest';

import { parseWorkerEnv } from './config.js';

describe('parseWorkerEnv', () => {
  it('requires REDIS_URL and applies defaults', () => {
    const env = parseWorkerEnv({ REDIS_URL: 'redis://localhost:6379' });
    expect(env.WORKER_CONCURRENCY_SYSTEM).toBe(2);
    expect(env.WORKER_ID.length).toBeGreaterThan(0);
  });

  it('fails with a readable message', () => {
    expect(() => parseWorkerEnv({ REDIS_URL: 'http://x' })).toThrow(/REDIS_URL/);
  });
});
