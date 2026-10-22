import { describe, expect, it } from 'vitest';

import { clientLogSchema } from './client-log-schema';
import { FixedWindowRateLimiter } from './rate-limit';

describe('clientLogSchema', () => {
  it('accepts a browser error report and defaults level', () => {
    const parsed = clientLogSchema.parse({ kind: 'error', message: 'x is undefined' });
    expect(parsed.level).toBe('error');
  });

  it('rejects oversized or unknown fields gracefully', () => {
    expect(clientLogSchema.safeParse({ kind: 'error', message: 'a'.repeat(2_001) }).success).toBe(
      false,
    );
    expect(clientLogSchema.safeParse({ kind: 'hack', message: 'x' }).success).toBe(false);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('limits per key within a window and resets afterwards', () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 10)).toBe(true);
    expect(limiter.allow('a', 20)).toBe(false);
    expect(limiter.allow('b', 20)).toBe(true);
    expect(limiter.allow('a', 1_001)).toBe(true);
  });
});
