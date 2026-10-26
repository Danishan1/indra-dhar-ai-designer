import {
  createBindingId,
  createComponentId,
  createConstraintId,
  createRelationshipId,
  type RandomBytes,
} from './ids.js';
import type { GarmentDesignState } from './schema/design-state.js';
import type { EntityRef } from './schema/entity-ref.js';

export interface CloneResult {
  state: GarmentDesignState;
  /** old id → new id, for components, relationships, constraints and bindings. */
  idMap: ReadonlyMap<string, string>;
}

/**
 * Deep copy with every component, relationship, constraint and binding id replaced, and every
 * reference between them rewritten (used when duplicating a design or project). Artifact revision
 * pins are kept as they are. The copy records where it came from.
 */
export function cloneWithNewIds(
  state: GarmentDesignState,
  opts: { randomBytes?: RandomBytes; sourceRevisionId?: string | null } = {},
): CloneResult {
  const rb = opts.randomBytes;
  const idMap = new Map<string, string>();
  const fresh = (old: string, make: (r?: RandomBytes) => string): string => {
    const existing = idMap.get(old);
    if (existing) return existing;
    const id = make(rb);
    idMap.set(old, id);
    return id;
  };
  // Assign in a stable order so seeded generators give stable results.
  for (const c of [...state.components].sort((a, b) => (a.componentId < b.componentId ? -1 : 1))) {
    fresh(c.componentId, createComponentId);
  }
  for (const k of [...state.constraints].sort((a, b) =>
    a.constraintId < b.constraintId ? -1 : 1,
  )) {
    fresh(k.constraintId, createConstraintId);
  }
  for (const r of [...state.relationships].sort((a, b) =>
    a.relationshipId < b.relationshipId ? -1 : 1,
  )) {
    fresh(r.relationshipId, createRelationshipId);
  }
  const mapRef = (e: EntityRef): EntityRef =>
    e.entityType === 'design_component' ||
    e.entityType === 'relationship' ||
    e.entityType === 'constraint'
      ? { ...e, entityId: idMap.get(e.entityId) ?? e.entityId }
      : e;

  const copy = structuredClone(state);
  copy.components = copy.components.map((c) => ({
    ...c,
    componentId: idMap.get(c.componentId) as string,
    parentComponentId: c.parentComponentId ? (idMap.get(c.parentComponentId) ?? null) : null,
    artifactBindings: c.artifactBindings.map((b) => ({
      ...b,
      bindingId: fresh(b.bindingId, createBindingId),
    })),
  }));
  copy.constraints = copy.constraints.map((k) => ({
    ...k,
    constraintId: idMap.get(k.constraintId) as string,
  }));
  copy.relationships = copy.relationships.map((r) => ({
    ...r,
    relationshipId: idMap.get(r.relationshipId) as string,
    source: mapRef(r.source),
    target: mapRef(r.target),
    constraints: r.constraints.map((id) => idMap.get(id) ?? id),
  }));
  copy.provenance = {
    ...copy.provenance,
    createdFrom: 'duplicate',
    sourceRevisionId: opts.sourceRevisionId ?? copy.provenance.sourceRevisionId,
  };
  return { state: copy, idMap };
}
