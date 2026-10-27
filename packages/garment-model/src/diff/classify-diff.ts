import { type Catalog, defaultCatalog } from '../registry/catalog.js';
import type { DesignComponent } from '../schema/component.js';
import type { GarmentDesignState } from '../schema/design-state.js';

import type { DesignDiff } from './diff-design-states.js';

/**
 * What a change is about (FR-PRJ-031, FR-EDT-094):
 * - `structural` — components added/removed/renamed/moved, garment type/category;
 * - `property` — a component property value or its status;
 * - `artifact` — reusable artifact revisions used, replaced or re-pinned;
 * - `relationship` — relationships and constraints (placements, attachments);
 * - `metadata` — descriptive data, provenance, schema version (not the garment);
 * - `editor_hint` — editor-only flags (visible, locked): never a design change.
 */
export const DiffCategories = [
  'structural',
  'property',
  'artifact',
  'relationship',
  'metadata',
  'editor_hint',
] as const;
export type DiffCategory = (typeof DiffCategories)[number];

export interface DiffEntry {
  category: DiffCategory;
  kind: 'added' | 'removed' | 'changed';
  /** Component the change belongs to (for highlighting), when there is one. */
  componentId: string | null;
  /** Stable id of what changed: component, relationship, constraint id or metadata key. */
  entityId: string;
  /** Property key or field name, when the change is to one. */
  field: string | null;
  /** Plain-language subject, e.g. "Left sleeve · Sleeve length". */
  label: string;
  before: unknown;
  after: unknown;
  /** Value statuses for property changes (confirmed, proposed…). */
  statusBefore: string | null;
  statusAfter: string | null;
  /** Only how it looks changed (appearance properties) — reported separately (FR-PRJ-031). */
  visualOnly: boolean;
  /** Counts as a change to the garment (false for metadata and editor hints). */
  semantic: boolean;
}

const humanField = (f: string) => f.replace(/([A-Z])/g, ' $1').toLowerCase();

const ORDER: Record<DiffCategory, number> = {
  structural: 0,
  property: 1,
  artifact: 2,
  relationship: 3,
  metadata: 4,
  editor_hint: 5,
};

/**
 * Flattens a structural diff into labelled entries grouped by category, in a deterministic order
 * (category, then the diff's own order). Pure; used by the compare API and the editor's diff list.
 */
export function classifyDiff(
  diff: DesignDiff,
  before: GarmentDesignState,
  after: GarmentDesignState,
  catalog: Catalog = defaultCatalog,
): DiffEntry[] {
  const comp = (id: string): DesignComponent | undefined =>
    after.components.find((c) => c.componentId === id) ??
    before.components.find((c) => c.componentId === id);
  const nameOf = (id: string) => comp(id)?.displayName ?? id;
  const entry = (
    e: Omit<DiffEntry, 'statusBefore' | 'statusAfter' | 'visualOnly' | 'field'> &
      Partial<Pick<DiffEntry, 'statusBefore' | 'statusAfter' | 'visualOnly' | 'field'>>,
  ): DiffEntry => ({
    field: null,
    statusBefore: null,
    statusAfter: null,
    visualOnly: false,
    ...e,
  });
  const out: DiffEntry[] = [];

  for (const f of diff.state.fields)
    out.push(
      entry({
        category: 'structural',
        kind: 'changed',
        componentId: null,
        entityId: 'design',
        field: f.field,
        label: f.field === 'garmentCategory' ? 'Garment category' : 'Garment type',
        before: f.before,
        after: f.after,
        semantic: true,
      }),
    );
  for (const c of diff.components.added)
    out.push(
      entry({
        category: 'structural',
        kind: 'added',
        componentId: c.componentId,
        entityId: c.componentId,
        label: c.displayName,
        before: null,
        after: c.componentType,
        semantic: true,
      }),
    );
  for (const c of diff.components.removed)
    out.push(
      entry({
        category: 'structural',
        kind: 'removed',
        componentId: c.componentId,
        entityId: c.componentId,
        label: c.displayName,
        before: c.componentType,
        after: null,
        semantic: true,
      }),
    );

  for (const c of diff.components.changed) {
    const name = nameOf(c.componentId);
    for (const f of c.fields)
      out.push(
        entry({
          category: 'structural',
          kind: 'changed',
          componentId: c.componentId,
          entityId: c.componentId,
          field: f.field,
          label: `${name} · ${humanField(f.field)}`,
          before: f.before,
          after: f.after,
          semantic: true,
        }),
      );
    for (const p of c.properties) {
      const def = catalog.properties.get(p.key);
      out.push(
        entry({
          category: 'property',
          kind: p.kind,
          componentId: c.componentId,
          entityId: c.componentId,
          field: p.key,
          label: `${name} · ${def?.label ?? p.key}`,
          before: p.before?.value ?? null,
          after: p.after?.value ?? null,
          statusBefore: p.before?.status ?? null,
          statusAfter: p.after?.status ?? null,
          visualOnly: def?.ui.group === 'Appearance',
          semantic: true,
        }),
      );
    }
    for (const f of c.flags)
      out.push(
        entry({
          category: 'editor_hint',
          kind: 'changed',
          componentId: c.componentId,
          entityId: c.componentId,
          field: f.field,
          label: `${name} · ${f.field === 'visible' ? 'visibility' : 'lock'} (editor only)`,
          before: f.before,
          after: f.after,
          semantic: false,
        }),
      );
  }

  for (const r of diff.artifactRefs.added)
    out.push(
      entry({
        category: 'artifact',
        kind: 'added',
        componentId: r.componentId,
        entityId: r.artifactRevisionId,
        label: `${nameOf(r.componentId)} · artifact`,
        before: null,
        after: r.artifactRevisionId,
        semantic: true,
      }),
    );
  for (const r of diff.artifactRefs.removed)
    out.push(
      entry({
        category: 'artifact',
        kind: 'removed',
        componentId: r.componentId,
        entityId: r.artifactRevisionId,
        label: `${nameOf(r.componentId)} · artifact`,
        before: r.artifactRevisionId,
        after: null,
        semantic: true,
      }),
    );
  for (const r of diff.artifactRefs.repinned)
    out.push(
      entry({
        category: 'artifact',
        kind: 'changed',
        componentId: r.componentId,
        entityId: r.artifactId,
        field: 'artifactRevisionId',
        label: `${nameOf(r.componentId)} · artifact revision`,
        before: r.before,
        after: r.after,
        semantic: true,
      }),
    );

  const relLabel = (type: string, targetId: string | null) =>
    `${catalog.relationshipTypes.get(type)?.label ?? humanField(type)}${targetId ? ` · ${nameOf(targetId)}` : ''}`;
  const targetOf = (r: { target: { entityType: string; entityId: string } }) =>
    r.target.entityType === 'design_component' ? r.target.entityId : null;
  for (const r of diff.relationships.added)
    out.push(
      entry({
        category: 'relationship',
        kind: 'added',
        componentId: targetOf(r),
        entityId: r.relationshipId,
        label: relLabel(r.type, targetOf(r)),
        before: null,
        after: r.type,
        semantic: true,
      }),
    );
  for (const r of diff.relationships.removed)
    out.push(
      entry({
        category: 'relationship',
        kind: 'removed',
        componentId: targetOf(r),
        entityId: r.relationshipId,
        label: relLabel(r.type, targetOf(r)),
        before: r.type,
        after: null,
        semantic: true,
      }),
    );
  for (const r of diff.relationships.changed) {
    const rel =
      after.relationships.find((x) => x.relationshipId === r.relationshipId) ??
      before.relationships.find((x) => x.relationshipId === r.relationshipId)!;
    for (const f of r.fields)
      out.push(
        entry({
          category: 'relationship',
          kind: 'changed',
          componentId: targetOf(rel),
          entityId: r.relationshipId,
          field: f.field,
          label: `${relLabel(rel.type, targetOf(rel))} · ${humanField(f.field)}`,
          before: f.before,
          after: f.after,
          semantic: true,
        }),
      );
  }
  for (const [kind, list] of [
    ['added', diff.constraints.added],
    ['removed', diff.constraints.removed],
  ] as const)
    for (const c of list)
      out.push(
        entry({
          category: 'relationship',
          kind,
          componentId: null,
          entityId: c.constraintId,
          label: `Constraint ${c.constraintId}`,
          before: kind === 'removed' ? c : null,
          after: kind === 'added' ? c : null,
          semantic: true,
        }),
      );
  for (const c of diff.constraints.changed)
    out.push(
      entry({
        category: 'relationship',
        kind: 'changed',
        componentId: null,
        entityId: c.after.constraintId,
        label: `Constraint ${c.after.constraintId}`,
        before: c.before,
        after: c.after,
        semantic: true,
      }),
    );

  for (const key of diff.metadata.changedKeys)
    out.push(
      entry({
        category: 'metadata',
        kind:
          before.metadata[key] === undefined
            ? 'added'
            : after.metadata[key] === undefined
              ? 'removed'
              : 'changed',
        componentId: null,
        entityId: key,
        field: key,
        label: `Metadata · ${humanField(key)}`,
        before: before.metadata[key] ?? null,
        after: after.metadata[key] ?? null,
        semantic: false,
      }),
    );
  for (const f of diff.metadata.fields)
    out.push(
      entry({
        category: 'metadata',
        kind: 'changed',
        componentId: null,
        entityId: f.field,
        field: f.field,
        label: humanField(f.field),
        before: f.before,
        after: f.after,
        semantic: false,
      }),
    );

  // Stable sort keeps the diff's own (deterministic) order within a category.
  return out
    .map((e, i) => [e, i] as const)
    .sort(([a, i], [b, j]) => ORDER[a.category] - ORDER[b.category] || i - j)
    .map(([e]) => e);
}

/** Components whose drawing or data differ (for highlighting, FR-EDT-095); editor hints excluded. */
export function changedComponentIds(entries: readonly DiffEntry[]): string[] {
  return [
    ...new Set(
      entries
        .filter((e) => e.semantic && e.componentId !== null)
        .map((e) => e.componentId as string),
    ),
  ].sort();
}
