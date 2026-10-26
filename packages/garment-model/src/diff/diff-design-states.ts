import { canonicalJson } from '../canonical/canonicalize.js';
import type { ArtifactBinding, DesignComponent } from '../schema/component.js';
import type { Constraint } from '../schema/constraint.js';
import type { GarmentDesignState } from '../schema/design-state.js';
import type { PropertyValue } from '../schema/property-value.js';
import type { DesignRelationship } from '../schema/relationship.js';

const same = (a: unknown, b: unknown): boolean =>
  a === undefined || b === undefined ? a === b : canonicalJson(a) === canonicalJson(b);

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface PropertyChange {
  key: string;
  kind: 'added' | 'removed' | 'changed';
  before: PropertyValue | null;
  after: PropertyValue | null;
}

export interface BindingChanges {
  added: ArtifactBinding[];
  removed: ArtifactBinding[];
  changed: { before: ArtifactBinding; after: ArtifactBinding }[];
}

export interface ComponentChange {
  componentId: string;
  /** Semantic fields: type, name, parent, side, geometry/asset refs, tags. */
  fields: FieldChange[];
  properties: PropertyChange[];
  bindings: BindingChanges;
  /** Editor-only flags (visible, locked): not physical, never semantic. */
  flags: FieldChange[];
  semantic: boolean;
}

export interface RelationshipChange {
  relationshipId: string;
  fields: FieldChange[];
}

export interface ArtifactRefChange {
  componentId: string;
  artifactId: string;
  artifactRevisionId: string;
}

export interface DesignDiff {
  state: { fields: FieldChange[] };
  components: { added: DesignComponent[]; removed: DesignComponent[]; changed: ComponentChange[] };
  relationships: {
    added: DesignRelationship[];
    removed: DesignRelationship[];
    changed: RelationshipChange[];
  };
  constraints: {
    added: Constraint[];
    removed: Constraint[];
    changed: { before: Constraint; after: Constraint }[];
  };
  /** Which reusable artifact revisions are used where (ART-004). */
  artifactRefs: {
    added: ArtifactRefChange[];
    removed: ArtifactRefChange[];
    /** Same binding, different pinned revision. */
    repinned: { componentId: string; artifactId: string; before: string; after: string }[];
  };
  /** Non-semantic: metadata keys, annotations, provenance, schema version. */
  metadata: { changedKeys: string[]; fields: FieldChange[] };
  hasChanges: boolean;
  hasSemanticChanges: boolean;
  /** Something changed, but nothing about the garment itself (DSN-011). */
  metadataOnly: boolean;
}

function diffFields<T extends object>(
  a: T,
  b: T,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    if (!same(a[f], b[f])) out.push({ field: f, before: a[f], after: b[f] });
  }
  return out;
}

function diffById<T>(
  before: readonly T[],
  after: readonly T[],
  id: (t: T) => string,
): { added: T[]; removed: T[]; pairs: [T, T][] } {
  const b = new Map(before.map((x) => [id(x), x]));
  const a = new Map(after.map((x) => [id(x), x]));
  const byId = (x: T, y: T) => (id(x) < id(y) ? -1 : id(x) > id(y) ? 1 : 0);
  return {
    added: [...a.entries()]
      .filter(([k]) => !b.has(k))
      .map(([, v]) => v)
      .sort(byId),
    removed: [...b.entries()]
      .filter(([k]) => !a.has(k))
      .map(([, v]) => v)
      .sort(byId),
    pairs: [...a.entries()]
      .filter(([k]) => b.has(k))
      .map(([k, v]) => [b.get(k) as T, v] as [T, T])
      .sort((x, y) => byId(x[1], y[1])),
  };
}

function diffProperties(
  a: Record<string, PropertyValue>,
  b: Record<string, PropertyValue>,
): PropertyChange[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const out: PropertyChange[] = [];
  for (const key of keys) {
    const before = a[key] ?? null;
    const after = b[key] ?? null;
    if (before === null && after !== null) out.push({ key, kind: 'added', before, after });
    else if (before !== null && after === null) out.push({ key, kind: 'removed', before, after });
    else if (!same(before, after)) out.push({ key, kind: 'changed', before, after });
  }
  return out;
}

function diffBindings(
  a: readonly ArtifactBinding[],
  b: readonly ArtifactBinding[],
): BindingChanges {
  const d = diffById(a, b, (x) => x.bindingId);
  return {
    added: d.added,
    removed: d.removed,
    changed: d.pairs.filter(([x, y]) => !same(x, y)).map(([before, after]) => ({ before, after })),
  };
}

const COMPONENT_FIELDS = [
  'componentType',
  'displayName',
  'parentComponentId',
  'side',
  'geometryRefs',
  'assetRefs',
  'tags',
] as const;

function diffComponent(before: DesignComponent, after: DesignComponent): ComponentChange | null {
  const norm = (c: DesignComponent) => ({
    ...c,
    tags: [...c.tags].sort(),
    geometryRefs: [...c.geometryRefs].sort((x, y) => (x.refId < y.refId ? -1 : 1)),
    assetRefs: [...c.assetRefs].sort((x, y) =>
      `${x.assetId}${x.role}` < `${y.assetId}${y.role}` ? -1 : 1,
    ),
  });
  const nb = norm(before);
  const na = norm(after);
  const fields = diffFields(nb, na, COMPONENT_FIELDS);
  const properties = diffProperties(before.properties, after.properties);
  const bindings = diffBindings(before.artifactBindings, after.artifactBindings);
  const flags = diffFields(before, after, ['visible', 'locked'] as const);
  const bindingsChanged =
    bindings.added.length + bindings.removed.length + bindings.changed.length > 0;
  const semantic = fields.length > 0 || properties.length > 0 || bindingsChanged;
  if (!semantic && flags.length === 0) return null;
  return { componentId: after.componentId, fields, properties, bindings, flags, semantic };
}

const RELATIONSHIP_FIELDS = [
  'type',
  'source',
  'target',
  'placement',
  'constraints',
  'status',
  'provenanceRefs',
] as const;

function bindingRefs(c: DesignComponent): ArtifactRefChange[] {
  return c.artifactBindings.map((b) => ({
    componentId: c.componentId,
    artifactId: b.artifactId,
    artifactRevisionId: b.artifactRevisionId,
  }));
}

/**
 * Structural comparison of two snapshots (DSN-011, FR-PRJ-031). Distinguishes changes to the garment
 * from changes to editor flags and descriptive metadata; deterministic ordering of every list.
 */
export function diffDesignStates(a: GarmentDesignState, b: GarmentDesignState): DesignDiff {
  const comps = diffById(a.components, b.components, (c) => c.componentId);
  const changed = comps.pairs
    .map(([x, y]) => diffComponent(x, y))
    .filter((c): c is ComponentChange => c !== null);

  const rels = diffById(a.relationships, b.relationships, (r) => r.relationshipId);
  const relChanged = rels.pairs
    .map(([x, y]) => ({
      relationshipId: y.relationshipId,
      fields: diffFields(x, y, RELATIONSHIP_FIELDS),
    }))
    .filter((r) => r.fields.length > 0);

  const csts = diffById(a.constraints, b.constraints, (c) => c.constraintId);
  const cstChanged = csts.pairs
    .filter(([x, y]) => !same(x, y))
    .map(([before, after]) => ({ before, after }));

  const artifactAdded = [...comps.added.flatMap(bindingRefs)];
  const artifactRemoved = [...comps.removed.flatMap(bindingRefs)];
  const repinned: DesignDiff['artifactRefs']['repinned'] = [];
  for (const c of changed) {
    const afterComp = b.components.find((x) => x.componentId === c.componentId);
    for (const bnd of c.bindings.added) {
      artifactAdded.push({
        componentId: c.componentId,
        artifactId: bnd.artifactId,
        artifactRevisionId: bnd.artifactRevisionId,
      });
    }
    for (const bnd of c.bindings.removed) {
      artifactRemoved.push({
        componentId: c.componentId,
        artifactId: bnd.artifactId,
        artifactRevisionId: bnd.artifactRevisionId,
      });
    }
    for (const ch of c.bindings.changed) {
      if (ch.before.artifactId === ch.after.artifactId) {
        if (ch.before.artifactRevisionId !== ch.after.artifactRevisionId) {
          repinned.push({
            componentId: afterComp?.componentId ?? c.componentId,
            artifactId: ch.after.artifactId,
            before: ch.before.artifactRevisionId,
            after: ch.after.artifactRevisionId,
          });
        }
      } else {
        artifactRemoved.push({
          componentId: c.componentId,
          artifactId: ch.before.artifactId,
          artifactRevisionId: ch.before.artifactRevisionId,
        });
        artifactAdded.push({
          componentId: c.componentId,
          artifactId: ch.after.artifactId,
          artifactRevisionId: ch.after.artifactRevisionId,
        });
      }
    }
  }
  const refOrder = (x: ArtifactRefChange, y: ArtifactRefChange) =>
    `${x.componentId}|${x.artifactRevisionId}` < `${y.componentId}|${y.artifactRevisionId}`
      ? -1
      : 1;
  artifactAdded.sort(refOrder);
  artifactRemoved.sort(refOrder);

  const stateFields = diffFields(a, b, ['garmentType', 'garmentCategory'] as const);

  const metaKeys = [...new Set([...Object.keys(a.metadata), ...Object.keys(b.metadata)])]
    .filter((k) => !same(a.metadata[k], b.metadata[k]))
    .sort();
  const metaFields = diffFields(a, b, ['annotationsRef', 'provenance', 'schemaVersion'] as const);

  const hasSemanticChanges =
    stateFields.length > 0 ||
    comps.added.length > 0 ||
    comps.removed.length > 0 ||
    changed.some((c) => c.semantic) ||
    rels.added.length > 0 ||
    rels.removed.length > 0 ||
    relChanged.length > 0 ||
    csts.added.length > 0 ||
    csts.removed.length > 0 ||
    cstChanged.length > 0;
  const hasNonSemantic =
    changed.some((c) => c.flags.length > 0) || metaKeys.length > 0 || metaFields.length > 0;

  return {
    state: { fields: stateFields },
    components: { added: comps.added, removed: comps.removed, changed },
    relationships: { added: rels.added, removed: rels.removed, changed: relChanged },
    constraints: { added: csts.added, removed: csts.removed, changed: cstChanged },
    artifactRefs: { added: artifactAdded, removed: artifactRemoved, repinned },
    metadata: { changedKeys: metaKeys, fields: metaFields },
    hasChanges: hasSemanticChanges || hasNonSemantic,
    hasSemanticChanges,
    metadataOnly: !hasSemanticChanges && hasNonSemantic,
  };
}
