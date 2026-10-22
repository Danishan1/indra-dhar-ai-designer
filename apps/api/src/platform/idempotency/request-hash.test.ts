import { describe, expect, it } from 'vitest';

import { requestHash, stableStringify } from './request-hash.js';

describe('request hash', () => {
  it('is independent of key order', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe(
      stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });

  it('differs when the body differs', () => {
    const base = { method: 'POST', route: '/v1/x', query: {}, params: {} };
    expect(requestHash({ ...base, body: { a: 1 } })).toBe(requestHash({ ...base, body: { a: 1 } }));
    expect(requestHash({ ...base, body: { a: 1 } })).not.toBe(
      requestHash({ ...base, body: { a: 2 } }),
    );
  });
});
