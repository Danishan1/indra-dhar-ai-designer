// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { canonicalize } from './canonical/canonicalize.js';
import { contentHash, semanticHash } from './canonical/hash.js';
import { createComponentId } from './ids.js';
import { GOLDEN, shirt } from './test-helpers.js';

/**
 * The same hash must come out in a browser-like runtime as in Node (ADR-003): the web app hashes
 * states too. The Node-side value is asserted in canonical.test.ts via node:crypto; here we pin
 * golden values that both environments must produce.
 */
describe('hashing in a browser-like environment', () => {
  it('runs without Node-only APIs', () => {
    expect(typeof window).toBe('object');
    expect(createComponentId()).toMatch(/^cmp_[a-z0-9]{12}$/);
  });

  it('produces the golden hashes for the deterministic shirt', () => {
    const s = shirt();
    expect(canonicalize(s).length).toBeGreaterThan(1000);
    expect(contentHash(s)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(semanticHash(s)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentHash(s)).toBe(GOLDEN.content);
    expect(semanticHash(s)).toBe(GOLDEN.semantic);
  });
});
