import type { GarmentDesignState } from '@ai-designer/garment-model';

import { diffEntities } from './patch.js';
import type { InternalOperation } from './schema.js';

/**
 * Exact inverse of a change (for undo): restores every changed entity to its previous snapshot, or
 * the whole previous state when design-level fields changed. `apply(next, invert(prev, next)) ≡ prev`
 * up to array order. Internal operation: only the server applies it (it carries prior provenance).
 */
export function invert(prev: GarmentDesignState, next: GarmentDesignState): InternalOperation {
  const { before } = diffEntities(prev, next);
  if (before.root)
    return { type: 'replace_state', state: prev as unknown as Record<string, unknown> };
  return {
    type: 'restore_entities',
    components: before.components,
    relationships: before.relationships,
  };
}
