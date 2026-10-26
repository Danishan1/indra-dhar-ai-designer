import { GarmentModelError } from '../errors.js';
import type { GarmentDesignState } from '../schema/design-state.js';

/** Digits kept in canonical numbers; removes float noise like 0.1 + 0.2 without changing real values. */
export const CANONICAL_NUMBER_DECIMALS = 6;

/** Code-unit comparison: locale independent, identical in Node and browsers. */
export const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function canonicalNumber(n: number): number {
  if (!Number.isFinite(n)) {
    throw new GarmentModelError(
      'NON_CANONICAL_NUMBER',
      `Cannot canonicalize non-finite number ${String(n)}`,
    );
  }
  const rounded = Number(n.toFixed(CANONICAL_NUMBER_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

/** Stable JSON text: object keys sorted, `undefined` dropped, numbers normalized, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return JSON.stringify(canonicalNumber(value));
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
      }
      const obj = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const key of Object.keys(obj).sort(compareStrings)) {
        const v = obj[key];
        if (v === undefined) continue;
        parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
      }
      return `{${parts.join(',')}}`;
    }
    default:
      throw new GarmentModelError('INVALID_VALUE', `Cannot canonicalize a ${typeof value}`);
  }
}

const sortBy = <T>(items: readonly T[], key: (t: T) => string): T[] =>
  [...items].sort((a, b) => compareStrings(key(a), key(b)));

/**
 * Orders arrays whose order carries no meaning (components, relationships, tags, bindings, refs) so
 * two states describing the same garment serialize identically. Arrays where order matters
 * (composition lists, polylines) are left alone.
 */
function normalizeOrder(state: GarmentDesignState): GarmentDesignState {
  return {
    ...state,
    components: sortBy(state.components, (c) => c.componentId).map((c) => ({
      ...c,
      tags: [...c.tags].sort(compareStrings),
      artifactBindings: sortBy(c.artifactBindings, (b) => b.bindingId),
      geometryRefs: sortBy(c.geometryRefs, (g) => g.refId),
      assetRefs: sortBy(c.assetRefs, (a) => `${a.assetId}|${a.role ?? ''}`),
      properties: Object.fromEntries(
        Object.entries(c.properties).map(([k, pv]) => [
          k,
          { ...pv, sourceRefs: sortBy(pv.sourceRefs, (s) => canonicalJson(s)) },
        ]),
      ),
    })),
    relationships: sortBy(state.relationships, (r) => r.relationshipId).map((r) => ({
      ...r,
      constraints: [...r.constraints].sort(compareStrings),
      provenanceRefs: [...r.provenanceRefs].sort(compareStrings),
    })),
    constraints: sortBy(state.constraints, (c) => c.constraintId),
  };
}

/** Canonical JSON of the whole state (DSN-010). */
export function canonicalize(state: GarmentDesignState): string {
  return canonicalJson(normalizeOrder(state));
}

/**
 * The part of a state that describes the garment itself. Editor flags (`visible`, `locked`),
 * descriptive `metadata`, `annotationsRef`, `provenance` and `schemaVersion` are excluded
 * (DSN-007, FR-EDT-024).
 */
export function semanticView(state: GarmentDesignState): Record<string, unknown> {
  const n = normalizeOrder(state);
  return {
    garmentType: n.garmentType,
    garmentCategory: n.garmentCategory,
    components: n.components.map(({ visible: _v, locked: _l, ...rest }) => rest),
    relationships: n.relationships,
    constraints: n.constraints,
  };
}

export function canonicalizeSemantic(state: GarmentDesignState): string {
  return canonicalJson(semanticView(state));
}
