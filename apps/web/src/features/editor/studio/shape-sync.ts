import type {
  ComponentShape,
  DesignComponent,
  GarmentDesignState,
  PatternPiece,
} from '@ai-designer/garment-model';
import { draftComponentPieces } from '@ai-designer/pattern-model';

import type { EditorStore } from '../store';

/**
 * Keeps the three representations of a component in sync when its reconstruction shape changes
 * (ADR-057): (1) the shape, (2) the measurement the box side is linked to, (3) its pattern pieces —
 * redrafted when they follow drafting rules, scaled and flagged for review when they were traced.
 * All three changes are one undo step (shared group id).
 */
export function commitShapeChange(
  store: EditorStore,
  componentId: string,
  shapeIndex: number,
  next: ComponentShape,
  label: string,
): void {
  const s = store.getState();
  const component = s.display.components.find((c) => c.componentId === componentId);
  if (!component?.shapes?.[shapeIndex]) return;
  const prev = component.shapes[shapeIndex]!;
  const groupId = globalThis.crypto.randomUUID();
  const shapes = component.shapes.map((sh, i) => (i === shapeIndex ? next : sh));
  if (!s.apply({ type: 'set_component_shapes', componentId, shapes }, { label, groupId })) return;

  const sx = next.width / prev.width;
  const sy = next.height / prev.height;
  const resized = Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3;
  if (!resized) return;

  // 2. Linked measurements follow the box (proportionally to the current value).
  for (const [side, factor, size] of [
    ['width', sx, next.width],
    ['height', sy, next.height],
  ] as const) {
    const key = next.links[side];
    if (!key || Math.abs(factor - 1) < 1e-3) continue;
    const pv = component.properties[key];
    const current = typeof pv?.value === 'number' ? pv.value : null;
    const value = Math.round((current !== null ? current * factor : size) * 10) / 10;
    store.getState().apply(
      {
        type: 'set_property',
        componentId,
        key,
        value,
        unit: 'mm',
        status: 'proposed',
        note: 'Changed by resizing the shape in the editor — confirm when measured',
      },
      { label: `${label} (measurement)`, groupId },
    );
  }

  // 3. Dependent pattern pieces.
  const display = store.getState().display;
  const updated = display.components.find((c) => c.componentId === componentId);
  const pieces = (display.patternPieces ?? []).filter((p) => p.componentId === componentId);
  if (!updated || !pieces.length) return;
  const nextPieces = syncPieces(display, updated, pieces, sx, sy);
  store
    .getState()
    .apply(
      { type: 'replace_pattern_pieces', componentId, pieces: nextPieces },
      { label: `${label} (pattern)`, groupId },
    );
}

/** Redrafts rule-based pieces; scales traced pieces and marks them for review. */
export function syncPieces(
  state: GarmentDesignState,
  component: DesignComponent,
  pieces: readonly PatternPiece[],
  sx: number,
  sy: number,
): PatternPiece[] {
  const redrafted = draftComponentPieces(state, component, { previous: pieces });
  return pieces.map((p) => {
    if (p.draft?.method === 'parametric') {
      const fresh = redrafted.find((r) => r.draft?.template === p.draft?.template);
      return fresh ? { ...fresh, seamAllowanceMm: p.seamAllowanceMm, status: 'provisional' } : p;
    }
    const scale = (pt: { x: number; y: number }) => ({ x: pt.x * sx, y: pt.y * sy });
    return {
      ...p,
      outline: p.outline.map(scale),
      notches: p.notches.map(scale),
      grainline: p.grainline ? { from: scale(p.grainline.from), to: scale(p.grainline.to) } : null,
      foldLine: p.foldLine ? { from: scale(p.foldLine.from), to: scale(p.foldLine.to) } : null,
      status: 'needs_review',
      notes: [
        ...p.notes.filter((n) => !n.startsWith('Scaled with the shape')),
        'Scaled with the shape — not a drafting rule; check it before cutting',
      ].slice(0, 20),
    };
  });
}
