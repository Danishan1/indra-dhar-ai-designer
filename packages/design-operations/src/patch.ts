import {
  canonicalJson,
  type DesignComponent,
  type DesignRelationship,
  type EntityRef,
  type GarmentDesignState,
} from '@ai-designer/garment-model';

/**
 * Changed entities as `id → snapshot` (null = removed). Used three ways: the response to the editor
 * (small payload, apply with `applyEntityPatch`), the stored undo data (`restore_entities` with the
 * previous snapshots) and conflict checks for reverts (hashes of the result snapshots).
 */
export interface EntityPatch {
  components: Record<string, DesignComponent | null>;
  relationships: Record<string, DesignRelationship | null>;
  /** Present only when design-level fields changed (garment type/category, metadata…). */
  root?: Partial<Omit<GarmentDesignState, 'components' | 'relationships'>>;
}

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** Entities whose content differs between two states (by id). */
export function diffEntities(
  prev: GarmentDesignState,
  next: GarmentDesignState,
): { before: EntityPatch; after: EntityPatch; changed: EntityRef[] } {
  const before: EntityPatch = { components: {}, relationships: {} };
  const after: EntityPatch = { components: {}, relationships: {} };
  const changed: EntityRef[] = [];
  const prevC = new Map(prev.components.map((c) => [c.componentId, c]));
  const nextC = new Map(next.components.map((c) => [c.componentId, c]));
  for (const key of [...new Set([...prevC.keys(), ...nextC.keys()])].sort()) {
    const a = prevC.get(key) ?? null;
    const b = nextC.get(key) ?? null;
    if (!same(a, b)) {
      before.components[key] = a;
      after.components[key] = b;
      changed.push({ entityType: 'design_component', entityId: key });
    }
  }
  const prevR = new Map(prev.relationships.map((r) => [r.relationshipId, r]));
  const nextR = new Map(next.relationships.map((r) => [r.relationshipId, r]));
  for (const key of [...new Set([...prevR.keys(), ...nextR.keys()])].sort()) {
    const a = prevR.get(key) ?? null;
    const b = nextR.get(key) ?? null;
    if (!same(a, b)) {
      before.relationships[key] = a;
      after.relationships[key] = b;
      changed.push({ entityType: 'relationship', entityId: key });
    }
  }
  const { components: _pc, relationships: _pr, ...prevRoot } = prev;
  const { components: _nc, relationships: _nr, ...nextRoot } = next;
  if (!same(prevRoot, nextRoot)) {
    before.root = prevRoot;
    after.root = nextRoot;
    changed.push({ entityType: 'design_revision', entityId: 'root' });
  }
  return { before, after, changed };
}

/** Applies a patch (put/delete by id; new entities are appended). Never mutates the input. */
export function applyEntityPatch(
  state: GarmentDesignState,
  patch: EntityPatch,
): GarmentDesignState {
  const components = state.components
    .filter((c) => patch.components[c.componentId] !== null)
    .map((c) =>
      c.componentId in patch.components ? (patch.components[c.componentId] as DesignComponent) : c,
    );
  const have = new Set(state.components.map((c) => c.componentId));
  for (const [id, c] of Object.entries(patch.components))
    if (c && !have.has(id)) components.push(c);
  const relationships = state.relationships
    .filter((r) => patch.relationships[r.relationshipId] !== null)
    .map((r) =>
      r.relationshipId in patch.relationships
        ? (patch.relationships[r.relationshipId] as DesignRelationship)
        : r,
    );
  const haveR = new Set(state.relationships.map((r) => r.relationshipId));
  for (const [id, r] of Object.entries(patch.relationships))
    if (r && !haveR.has(id)) relationships.push(r);
  return { ...state, ...(patch.root ?? {}), components, relationships } as GarmentDesignState;
}

/** Canonical hash input per changed entity (used to detect later edits before a revert). */
export function entitySnapshots(
  state: GarmentDesignState,
  refs: readonly EntityRef[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ref of refs) {
    const key = `${ref.entityType}:${ref.entityId}`;
    if (ref.entityType === 'design_component')
      out[key] = canonicalJson(
        state.components.find((c) => c.componentId === ref.entityId) ?? null,
      );
    else if (ref.entityType === 'relationship')
      out[key] = canonicalJson(
        state.relationships.find((r) => r.relationshipId === ref.entityId) ?? null,
      );
    else {
      const { components: _c, relationships: _r, ...root } = state;
      out[key] = canonicalJson(root);
    }
  }
  return out;
}
