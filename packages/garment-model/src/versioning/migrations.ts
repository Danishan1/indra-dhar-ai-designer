import { GarmentModelError } from '../errors.js';
import {
  parseDesignState,
  SCHEMA_VERSION,
  type GarmentDesignState,
} from '../schema/design-state.js';

import { compareVersions, parseVersion } from './version.js';

type Json = Record<string, unknown>;

export interface Migration {
  /** Exact version this migration upgrades from. */
  from: string;
  to: string;
  description: string;
  /** Property keys renamed by this step (old → new), so the promotion guard can follow them. */
  renamedProperties?: Readonly<Record<string, string>>;
  migrate(state: Json): Json;
}

/** Registered migrations, oldest first. Empty while 1.0.0 is the only released schema. */
export const MIGRATIONS: readonly Migration[] = [];

export interface MigrationResult {
  state: Json;
  from: string;
  to: string;
  applied: { from: string; to: string; description: string }[];
}

const asRecord = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};

/** `componentId::propertyKey` → status, for every property in a raw (possibly old) state. */
function statusMap(state: Json): Map<string, string> {
  const map = new Map<string, string>();
  const components = Array.isArray(state.components) ? state.components : [];
  for (const c of components) {
    const comp = asRecord(c);
    for (const [key, pv] of Object.entries(asRecord(comp.properties))) {
      map.set(`${String(comp.componentId)}::${key}`, String(asRecord(pv).status));
    }
  }
  const rels = Array.isArray(state.relationships) ? state.relationships : [];
  for (const r of rels)
    map.set(`rel::${String(asRecord(r).relationshipId)}`, String(asRecord(r).status));
  return map;
}

/**
 * Migrations may reshape data but never promote it: anything `confirmed` after a step must have been
 * `confirmed` before it (VER-003). Renames are followed through `renamedProperties`.
 */
export function assertNoPromotion(
  before: Json,
  after: Json,
  renames: Readonly<Record<string, string>> = {},
): void {
  const was = statusMap(before);
  const reverse = new Map(Object.entries(renames).map(([from, to]) => [to, from]));
  for (const [key, status] of statusMap(after)) {
    if (status !== 'confirmed') continue;
    const [owner, prop = ''] = key.split('::');
    const original = owner === 'rel' ? key : `${owner}::${reverse.get(prop) ?? prop}`;
    if (was.get(original) !== 'confirmed') {
      throw new GarmentModelError(
        'MIGRATION_FAILED',
        `Migration would confirm "${key}" which was not confirmed before`,
      );
    }
  }
}

/**
 * Upgrades a stored state to the latest schema WITHOUT touching the input (the stored snapshot stays
 * as written, VER-004). Deterministic: the same input and migrations give the same output (VER-002).
 * Same-major states without a registered step are additive and only get their version stamped.
 */
export function migrateToLatest(
  input: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  latest: string = SCHEMA_VERSION,
): MigrationResult {
  let state = structuredClone(asRecord(input));
  const start = state.schemaVersion;
  if (typeof start !== 'string') {
    throw new GarmentModelError(
      'UNSUPPORTED_VERSION',
      'The state does not say which schema version it uses',
    );
  }
  const from = start;
  const latestV = parseVersion(latest);
  if (parseVersion(from).major > latestV.major) {
    throw new GarmentModelError(
      'UNSUPPORTED_VERSION',
      `Schema ${from} is newer than this build understands (${latest})`,
    );
  }
  const applied: MigrationResult['applied'] = [];
  let current = from;
  while (compareVersions(current, latest) < 0) {
    const step = migrations.find((m) => m.from === current);
    if (!step) {
      if (parseVersion(current).major === latestV.major) break; // additive minor/patch gap
      throw new GarmentModelError('MIGRATION_FAILED', `No migration from schema ${current}`);
    }
    const next = asRecord(step.migrate(structuredClone(state)));
    if (next.schemaVersion !== step.to) next.schemaVersion = step.to;
    assertNoPromotion(state, next, step.renamedProperties);
    applied.push({ from: step.from, to: step.to, description: step.description });
    state = next;
    current = step.to;
  }
  // A newer same-major version (additive fields) is read as-is; older ones are stamped.
  if (compareVersions(current, latest) < 0) state.schemaVersion = latest;
  return { state, from, to: asRecord(state).schemaVersion as string, applied };
}

/** Reads a stored state of any supported version as the current shape (validated, defaults applied). */
export function readAnyVersion(
  input: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
): {
  state: GarmentDesignState;
  migrated: MigrationResult;
} {
  const migrated = migrateToLatest(input, migrations);
  return { state: parseDesignState(migrated.state), migrated };
}
