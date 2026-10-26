import { describe, expect, it } from 'vitest';

import { GarmentModelError } from './errors.js';
import { SCHEMA_VERSION } from './schema/design-state.js';
import { userValue } from './schema/property-value.js';
import { byType, shirt, WHEN } from './test-helpers.js';
import {
  assertNoPromotion,
  MIGRATIONS,
  migrateToLatest,
  readAnyVersion,
  type Migration,
} from './versioning/migrations.js';
import { compareVersions, parseVersion } from './versioning/version.js';

describe('versions', () => {
  it('records the schema version on every state (AC6, VER-001)', () => {
    expect(SCHEMA_VERSION).toBe('1.0.0');
    expect(shirt().schemaVersion).toBe(SCHEMA_VERSION);
    expect(MIGRATIONS).toEqual([]);
  });

  it('parses and compares', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(() => parseVersion('1.2')).toThrow(GarmentModelError);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });
});

// A fake 0.9 → 1.0 migration: renames a property and wraps a legacy flat value.
const fake: Migration = {
  from: '0.9.0',
  to: '1.0.0',
  description: 'rename dimension.length → dimension.sleeve_length',
  renamedProperties: { 'dimension.length': 'dimension.sleeve_length' },
  migrate(state) {
    const components = (state.components as Record<string, unknown>[]).map((c) => {
      const props = { ...(c.properties as Record<string, unknown>) };
      if ('dimension.length' in props) {
        props['dimension.sleeve_length'] = props['dimension.length'];
        delete props['dimension.length'];
      }
      return { ...c, properties: props };
    });
    return { ...state, components };
  },
};

function oldState() {
  const s = structuredClone(shirt()) as unknown as Record<string, unknown>;
  s.schemaVersion = '0.9.0';
  const sleeve = byType(s as unknown as ReturnType<typeof shirt>, 'sleeve', 'left');
  sleeve.properties['dimension.length'] = {
    ...userValue(580, { confirmedBy: 'u1', confirmedAt: WHEN }, 'mm'),
  };
  sleeve.properties['construction.sleeve_type'] = {
    ...sleeve.properties['construction.sleeve_type']!,
    status: 'inferred',
    sourceType: 'ai_interpretation',
  };
  return s;
}

describe('migrateToLatest (VER-001…006)', () => {
  it('upgrades deterministically without touching the stored snapshot', () => {
    const input = oldState();
    const frozen = JSON.stringify(input);
    const a = migrateToLatest(input, [fake]);
    const b = migrateToLatest(input, [fake]);
    expect(JSON.stringify(input)).toBe(frozen);
    expect(a).toEqual(b);
    expect(a.applied).toEqual([{ from: '0.9.0', to: '1.0.0', description: fake.description }]);
    expect(a.state.schemaVersion).toBe('1.0.0');
    expect(a.from).toBe('0.9.0');
    expect(a.to).toBe('1.0.0');
  });

  it('keeps statuses: confirmed stays confirmed, inferred never becomes confirmed (AC6)', () => {
    const { state } = readAnyVersion(oldState(), [fake]);
    const sleeve = byType(state, 'sleeve', 'left');
    expect(sleeve.properties['dimension.sleeve_length']).toMatchObject({
      status: 'confirmed',
      value: 580,
    });
    expect(sleeve.properties['construction.sleeve_type']!.status).toBe('inferred');
    expect(sleeve.properties['dimension.length']).toBeUndefined();
  });

  it('refuses a migration that promotes a value', () => {
    const evil: Migration = {
      ...fake,
      migrate(state) {
        const comps = (state.components as Record<string, unknown>[]).map((c) => ({
          ...c,
          properties: Object.fromEntries(
            Object.entries(c.properties as Record<string, Record<string, unknown>>).map(
              ([k, v]) => [k, { ...v, status: 'confirmed' }],
            ),
          ),
        }));
        return { ...state, components: comps };
      },
    };
    expect(() => migrateToLatest(oldState(), [evil])).toThrow(/would confirm/);
  });

  it('assertNoPromotion covers relationships and renames', () => {
    const before = {
      components: [{ componentId: 'c', properties: { a: { status: 'proposed' } } }],
      relationships: [{ relationshipId: 'r', status: 'proposed' }],
    };
    expect(() =>
      assertNoPromotion(before, {
        ...before,
        relationships: [{ relationshipId: 'r', status: 'confirmed' }],
      }),
    ).toThrow();
    expect(() =>
      assertNoPromotion(
        before,
        {
          components: [{ componentId: 'c', properties: { b: { status: 'proposed' } } }],
          relationships: [],
        },
        { a: 'b' },
      ),
    ).not.toThrow();
    expect(() =>
      assertNoPromotion(before, {
        components: [{ componentId: 'new', properties: { a: { status: 'confirmed' } } }],
      }),
    ).toThrow();
  });

  it('returns current states unchanged and stamps additive older minors', () => {
    const current = shirt();
    expect(migrateToLatest(current).applied).toEqual([]);
    expect(migrateToLatest(current).state).toEqual(current);
    const older = migrateToLatest({ ...current, schemaVersion: '1.0.0' }, [], '1.1.0');
    expect(older.state.schemaVersion).toBe('1.1.0');
  });

  it('reads newer same-major states as they are and preserves unknown fields (VER-005)', () => {
    const newer = { ...shirt(), schemaVersion: '1.4.0', futureField: { keep: true } } as Record<
      string,
      unknown
    >;
    const { state } = readAnyVersion(newer);
    expect(state.schemaVersion).toBe('1.4.0');
    expect((state as Record<string, unknown>).futureField).toEqual({ keep: true });
  });

  it('rejects unsupported versions with a clear error', () => {
    expect(() => migrateToLatest({ ...shirt(), schemaVersion: '2.0.0' })).toThrow(
      /newer than this build/,
    );
    expect(() => migrateToLatest({ ...shirt(), schemaVersion: '0.5.0' })).toThrow(
      /No migration from schema 0.5.0/,
    );
    expect(() => migrateToLatest({})).toThrow(/does not say/);
    expect(() => migrateToLatest('nope')).toThrow(GarmentModelError);
  });

  it('chains several steps in order', () => {
    const steps: Migration[] = [
      {
        from: '0.8.0',
        to: '0.9.0',
        description: 'a',
        migrate: (s) => ({ ...s, metadata: { ...(s.metadata as object), a: 1 } }),
      },
      { ...fake },
    ];
    const r = migrateToLatest({ ...oldState(), schemaVersion: '0.8.0' }, steps);
    expect(r.applied.map((a) => a.from)).toEqual(['0.8.0', '0.9.0']);
    expect((r.state.metadata as Record<string, unknown>).a).toBe(1);
  });
});
