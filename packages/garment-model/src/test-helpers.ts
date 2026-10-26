import { sequentialRandomBytes } from './ids.js';
import type { GarmentDesignState } from './schema/design-state.js';
import { templates } from './templates/index.js';

/** A deterministic woven-shirt state (ids cmp_000000000001 …). */
export function shirt(): GarmentDesignState {
  return templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
}

export function tshirt(): GarmentDesignState {
  return templates.create('knit_tshirt', { randomBytes: sequentialRandomBytes() });
}

export function byType(state: GarmentDesignState, type: string, side?: string) {
  const found = state.components.find(
    (c) => c.componentType === type && (side === undefined || c.side === side),
  );
  if (!found) throw new Error(`no ${type}`);
  return found;
}

export const WHEN = '2026-10-26T10:00:00.000Z';

/**
 * Golden hashes of `shirt()` (seeded ids). Asserted in Node AND jsdom so both runtimes agree (ADR-003).
 * Update deliberately when the woven-shirt template or the canonical form changes.
 */
export const GOLDEN = {
  content: 'sha256:ebfb172c2e1e01bcb16fc7f8296801fe19b7c34829ab38f9d9aa1f45bd050221',
  semantic: 'sha256:ae78cad3d73f055e99f76fe86a8d7ecd543ffde3da0bbad7c355084cd2729013',
};
