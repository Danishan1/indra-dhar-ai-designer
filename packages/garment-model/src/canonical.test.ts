import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { canonicalJson, canonicalize, semanticView } from './canonical/canonicalize.js';
import { contentHash, semanticHash, sha256Hex } from './canonical/hash.js';
import { userValue } from './schema/property-value.js';
import { byType, GOLDEN, shirt, WHEN } from './test-helpers.js';

const json: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  leaf: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.boolean(),
    fc.constant(null),
  ),
  node: fc.oneof(
    { depthSize: 'small' },
    tie('leaf'),
    fc.array(tie('node'), { maxLength: 4 }),
    fc.dictionary(fc.string({ maxLength: 6 }), tie('node'), { maxKeys: 4 }),
  ),
})).node;

function shuffleKeys(v: unknown, seed: number): unknown {
  if (Array.isArray(v)) return v.map((x) => shuffleKeys(x, seed));
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).map(
      ([k, x]) => [k, shuffleKeys(x, seed)] as const,
    );
    entries.sort(
      (a, b) =>
        ((a[0].length * seed + a[0].charCodeAt(0)) % 7) -
        ((b[0].length * seed + b[0].charCodeAt(0)) % 7),
    );
    return Object.fromEntries(entries);
  }
  return v;
}

describe('canonicalJson', () => {
  it('sorts keys, drops undefined, strips whitespace and -0', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: -0 }] })).toBe(
      '{"a":[2,{"c":0}],"b":1}',
    );
  });

  it('normalizes float noise', () => {
    expect(canonicalJson(0.1 + 0.2)).toBe('0.3');
    expect(canonicalJson(1e-9)).toBe('0');
  });

  it('refuses values that have no canonical form', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(() => 1)).toThrow();
    expect(() => canonicalJson(1n)).toThrow();
  });

  it('is idempotent and independent of key order (property-based)', () => {
    fc.assert(
      fc.property(json, fc.integer({ min: 1, max: 5 }), (v, seed) => {
        const once = canonicalJson(v);
        expect(canonicalJson(JSON.parse(once))).toBe(once);
        expect(canonicalJson(shuffleKeys(v, seed))).toBe(once);
      }),
    );
  });
});

describe('contentHash (AC5, DSN-010)', () => {
  it('is stable under key and array reordering', () => {
    const a = shirt();
    const b = structuredClone(a);
    b.components.reverse();
    b.components = b.components.map((c) => ({
      ...c,
      properties: Object.fromEntries(Object.entries(c.properties).reverse()),
      tags: [...c.tags].reverse(),
    }));
    expect(contentHash(b)).toBe(contentHash(a));
    expect(canonicalize(b)).toBe(canonicalize(a));
  });

  it('has the sha256: prefix and matches Node crypto (runtime independence)', () => {
    const state = shirt();
    const text = canonicalize(state);
    expect(contentHash(state)).toBe(
      `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`,
    );
    expect(sha256Hex('héllo ✓')).toBe(
      `sha256:${createHash('sha256').update('héllo ✓', 'utf8').digest('hex')}`,
    );
  });

  it('golden hashes of the seeded shirt are stable (same values asserted in jsdom)', () => {
    expect(contentHash(shirt())).toBe(GOLDEN.content);
    expect(semanticHash(shirt())).toBe(GOLDEN.semantic);
  });

  it('known answer: stable across releases', () => {
    expect(sha256Hex('{}')).toBe(
      'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });

  it('changes when any semantic field changes', () => {
    const base = shirt();
    const h = contentHash(base);
    const mutations: ((s: typeof base) => void)[] = [
      (s) => (byType(s, 'collar').properties['construction.collar_type']!.value = 'point'),
      (s) => (byType(s, 'collar').displayName = 'Neck collar'),
      (s) => (byType(s, 'collar').side = 'center'),
      (s) => s.components.pop(),
      (s) => (s.garmentCategory = null),
      (s) => (byType(s, 'sleeve', 'left').tags = ['x']),
      (s) => (byType(s, 'collar').properties['construction.collar_type']!.status = 'needs_review'),
      (s) => (s.metadata = { season: 'SS27' }),
      (s) => (byType(s, 'collar').visible = false),
    ];
    const seen = new Set([h]);
    for (const m of mutations) {
      const s = structuredClone(base);
      m(s);
      seen.add(contentHash(s));
    }
    expect(seen.size).toBe(mutations.length + 1);
  });
});

describe('semanticHash', () => {
  it('ignores editor flags, metadata, annotations, provenance and schema version', () => {
    const a = shirt();
    const b = structuredClone(a);
    byType(b, 'collar').visible = false;
    byType(b, 'collar').locked = true;
    b.metadata = { season: 'SS27' };
    b.annotationsRef = 'ann-1';
    b.provenance = { ...b.provenance, createdFrom: 'duplicate' };
    expect(semanticHash(b)).toBe(semanticHash(a));
    expect(contentHash(b)).not.toBe(contentHash(a));
    expect(JSON.stringify(semanticView(a))).not.toContain('"visible"');
  });

  it('changes with a real edit', () => {
    const a = shirt();
    const b = structuredClone(a);
    byType(b, 'sleeve', 'left').properties['dimension.sleeve_length'] = userValue(
      580,
      { confirmedBy: 'u1', confirmedAt: WHEN },
      'mm',
    );
    expect(semanticHash(b)).not.toBe(semanticHash(a));
  });
});
