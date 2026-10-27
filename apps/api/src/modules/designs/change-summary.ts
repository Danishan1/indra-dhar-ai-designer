import type { ValidationSummary } from '@ai-designer/contracts';
import {
  constraintSetFor,
  defaultCatalog,
  type DesignDiff,
  type GarmentDesignState,
  type PropertyChange,
  runDesignValidation,
} from '@ai-designer/garment-model';

/** Upper bound on auto-generated lines kept in a revision summary (the full diff is stored too). */
export const MAX_SUMMARY_LINES = 40;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function formatValue(v: unknown, unit: string | null): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'string') return `"${v.replaceAll('_', ' ')}"`;
  if (typeof v === 'number' || typeof v === 'boolean')
    return `${String(v)}${unit ? ` ${unit}` : ''}`;
  return 'a new value';
}

function describeProperty(change: PropertyChange): string {
  const label = defaultCatalog.properties.get(change.key)?.label ?? change.key;
  if (change.kind === 'added') return `${label} added`;
  if (change.kind === 'removed') return `${label} removed`;
  const before = change.before;
  const after = change.after;
  if (!before || !after) return `${label} changed`;
  if (JSON.stringify(before.value) !== JSON.stringify(after.value) || before.unit !== after.unit) {
    const text = `${label} set to ${formatValue(after.value, after.unit)}`;
    return after.status === 'confirmed' ? text : `${text} (${after.status.replace('_', ' ')})`;
  }
  if (before.status !== after.status) return `${label} marked ${after.status.replace('_', ' ')}`;
  return `${label} evidence updated`;
}

/**
 * Plain-language lines describing a structural diff (FR-PRJ-029/031). Deterministic: same diff →
 * same lines, so stored summaries are reproducible.
 */
export function summarizeDiff(
  diff: DesignDiff,
  before: GarmentDesignState | null,
  after: GarmentDesignState,
): string[] {
  const nameOf = (id: string) =>
    after.components.find((c) => c.componentId === id)?.displayName ??
    before?.components.find((c) => c.componentId === id)?.displayName ??
    id;
  const lines: string[] = [];
  for (const f of diff.state.fields) {
    lines.push(
      f.field === 'garmentCategory'
        ? `Garment category changed from ${String(f.before ?? 'none')} to ${String(f.after ?? 'none')}`
        : `Garment type changed from ${String(f.before)} to ${String(f.after)}`,
    );
  }
  for (const c of diff.components.added) lines.push(`Added ${c.displayName}`);
  for (const c of diff.components.removed) lines.push(`Removed ${c.displayName}`);
  for (const c of diff.components.changed) {
    if (!c.semantic) continue;
    const name = nameOf(c.componentId);
    for (const f of c.fields) {
      if (f.field === 'displayName')
        lines.push(`Renamed ${String(f.before)} to ${String(f.after)}`);
      else if (f.field === 'parentComponentId') lines.push(`${name}: moved to another parent`);
      else lines.push(`${name}: ${f.field.replace(/([A-Z])/g, ' $1').toLowerCase()} changed`);
    }
    for (const p of c.properties) lines.push(`${name}: ${describeProperty(p)}`);
  }
  for (const r of diff.artifactRefs.repinned)
    lines.push(`${nameOf(r.componentId)}: artifact updated to revision ${r.after}`);
  for (const r of diff.artifactRefs.added)
    lines.push(`${nameOf(r.componentId)}: uses artifact revision ${r.artifactRevisionId}`);
  for (const r of diff.artifactRefs.removed)
    lines.push(
      `${nameOf(r.componentId)}: no longer uses artifact revision ${r.artifactRevisionId}`,
    );
  const rel = diff.relationships;
  if (rel.added.length) lines.push(`Added ${plural(rel.added.length, 'relationship')}`);
  if (rel.removed.length) lines.push(`Removed ${plural(rel.removed.length, 'relationship')}`);
  if (rel.changed.length) lines.push(`Changed ${plural(rel.changed.length, 'relationship')}`);
  const cst = diff.constraints;
  if (cst.added.length) lines.push(`Added ${plural(cst.added.length, 'constraint')}`);
  if (cst.removed.length) lines.push(`Removed ${plural(cst.removed.length, 'constraint')}`);
  if (cst.changed.length) lines.push(`Changed ${plural(cst.changed.length, 'constraint')}`);
  if (diff.metadataOnly) lines.push('Only descriptive details or display settings changed');
  if (lines.length > MAX_SUMMARY_LINES) {
    const extra = lines.length - MAX_SUMMARY_LINES + 1;
    return [...lines.slice(0, MAX_SUMMARY_LINES - 1), `…and ${extra} more changes`];
  }
  return lines;
}

/** Counts stored next to the summary (for lists and badges without loading the diff). */
export function diffCounts(diff: DesignDiff) {
  return {
    componentsAdded: diff.components.added.length,
    componentsRemoved: diff.components.removed.length,
    componentsChanged: diff.components.changed.filter((c) => c.semantic).length,
    propertiesChanged: diff.components.changed.reduce((n, c) => n + c.properties.length, 0),
    relationshipsChanged:
      diff.relationships.added.length +
      diff.relationships.removed.length +
      diff.relationships.changed.length,
    artifactRefsChanged:
      diff.artifactRefs.added.length +
      diff.artifactRefs.removed.length +
      diff.artifactRefs.repinned.length,
    metadataOnly: diff.metadataOnly,
  };
}

/** The user's words first, then the generated lines. */
export function composeChangeSummary(userText: string | undefined, lines: string[]): string {
  const auto = lines.length ? lines.map((l) => `• ${l}`).join('\n') : '• No structural changes';
  const text = userText?.trim();
  return text ? `${text}\n${auto}` : auto;
}

/**
 * Everything a revision pins (FR-PRJ-028, ART-004): artifact revisions bound to components or used
 * as relationship endpoints, and assets referenced by components. Sorted, de-duplicated.
 */
export function extractRefs(state: GarmentDesignState): {
  artifactRevisionRefs: string[];
  sourceAssetRefs: string[];
} {
  const artifacts = new Set<string>();
  const assets = new Set<string>();
  for (const c of state.components) {
    for (const b of c.artifactBindings) artifacts.add(b.artifactRevisionId);
    for (const a of c.assetRefs) assets.add(a.assetId);
  }
  for (const r of state.relationships) {
    for (const end of [r.source, r.target]) {
      if (end.entityType === 'artifact_revision') artifacts.add(end.entityId);
      if (end.entityType === 'asset') assets.add(end.entityId);
    }
  }
  const sort = (s: Set<string>) => [...s].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { artifactRevisionRefs: sort(artifacts), sourceAssetRefs: sort(assets) };
}

/**
 * Validation summary recorded on a revision (I20): counts of the design-structure validation of the
 * snapshot, with the constraint-set version that produced them (CST-004). Structural findings are
 * part of the run. Never a production-readiness statement (CST-006).
 */
export function validationSummaryOf(state: GarmentDesignState): ValidationSummary {
  const report = runDesignValidation(state, constraintSetFor(state.garmentType));
  return { ...report.counts, constraintSet: report.constraintSetRef };
}
