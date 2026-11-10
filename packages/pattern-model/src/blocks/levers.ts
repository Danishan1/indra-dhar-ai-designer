import {
  type BodyMeasurementKey,
  garmentSpec,
  garmentsOf,
  type PatternSpec,
  patternSpecSchema,
} from '@ai-designer/garment-model';

import { pieceBounds } from '../cad/path.js';

import { draftPattern } from './draft-pattern.js';
import { garmentName, lengthFor, resolve } from './resolve.js';
import { BODY_LABELS, specMeasurements, measurementsForSpec } from './sizes.js';

/**
 * "Size by measurement" (ADR-062): make a piece a given width or length by changing the
 * measurement that drives it, then redraft — so every piece that depends on that measurement
 * changes with it and matching seams stay matched. A lever is one input of the spec (a body
 * measurement, an ease, a garment length or sleeve length); `solveLever` finds the value that gives
 * the piece the target size (bisection over full redrafts — the engine is deterministic and fast).
 */

export type LeverKind = 'body' | 'ease' | 'length' | 'sleeve';

export interface Lever {
  id: string;
  label: string;
  kind: LeverKind;
  /** Garment of a set the lever belongs to (`main` for shared body measurements and ease). */
  garmentKey: string;
  key: string;
  value: number;
  min: number;
  max: number;
}

export type PieceDim = 'width' | 'height';

const lengthKind = (family: string): 'top' | 'skirt' | 'trousers' =>
  family === 'top' || family === 'jacket'
    ? 'top'
    : family === 'dress' || family === 'skirt'
      ? 'skirt'
      : 'trousers';

/** Every lever of a spec with its current value. */
export function measurementLevers(input: PatternSpec): Lever[] {
  const spec = patternSpecSchema.parse(input);
  const chart = specMeasurements(spec);
  const out: Lever[] = [];
  for (const k of measurementsForSpec(spec)) {
    const v = spec.body[k] ?? chart[k] ?? 0;
    if (v > 0)
      out.push({
        id: `body:${k}`,
        label: BODY_LABELS[k],
        kind: 'body',
        garmentKey: 'main',
        key: k,
        value: v,
        min: Math.round(v * 0.5),
        max: Math.round(v * 1.8),
      });
  }
  const ctx0 = resolve(garmentSpec(spec, 'main'));
  for (const k of ['bust', 'waist', 'hip'] as const)
    out.push({
      id: `ease:${k}`,
      label: `Ease at ${k === 'bust' ? 'bust / chest' : k}`,
      kind: 'ease',
      garmentKey: 'main',
      key: k,
      value: ctx0.ease[k],
      min: -50,
      max: 600,
    });
  const set = spec.garments.length > 0;
  for (const g of garmentsOf(spec)) {
    const gs = garmentSpec(spec, g.key);
    const ctx = resolve(gs);
    const name = set ? `${garmentName(gs)} ` : '';
    const L = lengthFor(ctx, lengthKind(gs.family));
    out.push({
      id: `length:${g.key}`,
      label: `${name}length`.replace(/^./, (c) => c.toUpperCase()),
      kind: 'length',
      garmentKey: g.key,
      key: 'lengthMm',
      value: L,
      min: 60,
      max: 2000,
    });
    if (gs.style.sleeve !== 'none' && ['top', 'dress', 'jacket', 'jumpsuit'].includes(gs.family)) {
      const draft = draftPattern(gs);
      const sleeve = draft.parts.flatMap((p) => p.pieces).find((p) => p.template === 'sleeve');
      const S = gs.style.sleeveLengthMm ?? (sleeve ? pieceBounds(sleeve).height : 200);
      out.push({
        id: `sleeve:${g.key}`,
        label: `${name}sleeve length`.replace(/^./, (c) => c.toUpperCase()),
        kind: 'sleeve',
        garmentKey: g.key,
        key: 'sleeveLengthMm',
        value: S,
        min: 40,
        max: 1200,
      });
    }
  }
  return out;
}

/** The spec with one lever set to `value`. */
export function applyLever(input: PatternSpec, lever: Lever, value: number): PatternSpec {
  const spec = patternSpecSchema.parse(input);
  const v = Math.round(Math.min(lever.max, Math.max(lever.min, value)) * 10) / 10;
  if (lever.kind === 'body')
    return { ...spec, body: { ...spec.body, [lever.key as BodyMeasurementKey]: v } };
  if (lever.kind === 'ease') return { ...spec, ease: { ...spec.ease, [lever.key]: v } };
  const patch = { [lever.key]: v };
  if (lever.garmentKey === 'main') return { ...spec, style: { ...spec.style, ...patch } };
  return {
    ...spec,
    garments: spec.garments.map((g) =>
      g.key === lever.garmentKey ? { ...g, style: { ...g.style, ...patch } } : g,
    ),
  };
}

/** Width or height of a drafted piece (seam line), by template; null when the spec has no such piece. */
export function draftedDimension(
  spec: PatternSpec,
  template: string,
  dim: PieceDim,
): number | null {
  const piece = draftPattern(spec)
    .parts.flatMap((p) => p.pieces)
    .find((p) => p.template === template);
  if (!piece) return null;
  const b = pieceBounds(piece);
  return dim === 'width' ? b.width : b.height;
}

/**
 * Levers that change the piece's dimension, most effective first (mm of piece per mm of lever).
 */
export function suggestLevers(
  spec: PatternSpec,
  template: string,
  dim: PieceDim,
): { lever: Lever; rate: number }[] {
  const base = draftedDimension(spec, template, dim);
  if (base === null) return [];
  const out: { lever: Lever; rate: number }[] = [];
  for (const lever of measurementLevers(spec)) {
    const step = Math.max(5, Math.abs(lever.value) * 0.05);
    const d = draftedDimension(applyLever(spec, lever, lever.value + step), template, dim);
    if (d === null) continue;
    const rate = (d - base) / step;
    if (Math.abs(rate) >= 0.05) out.push({ lever, rate });
  }
  return out.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));
}

/**
 * The lever value that gives the piece `target` mm in `dim` (within 0.5 mm), or the closest value
 * the lever's range allows. Returns the new spec and the size it achieves.
 */
export function solveLever(
  spec: PatternSpec,
  lever: Lever,
  template: string,
  dim: PieceDim,
  target: number,
): { spec: PatternSpec; value: number; achieved: number } | null {
  const at = (v: number) => draftedDimension(applyLever(spec, lever, v), template, dim);
  let lo = lever.min;
  let hi = lever.max;
  const fLo = at(lo);
  const fHi = at(hi);
  if (fLo === null || fHi === null) return null;
  const increasing = fHi >= fLo;
  // Out of range: clamp to the nearest end.
  if ((increasing && target <= fLo) || (!increasing && target >= fLo))
    return { spec: applyLever(spec, lever, lo), value: lo, achieved: fLo };
  if ((increasing && target >= fHi) || (!increasing && target <= fHi))
    return { spec: applyLever(spec, lever, hi), value: hi, achieved: fHi };
  let best = { value: lever.value, achieved: at(lever.value) ?? fLo };
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const f = at(mid)!;
    if (Math.abs(f - target) < Math.abs(best.achieved - target)) best = { value: mid, achieved: f };
    if (Math.abs(f - target) < 0.5) break;
    if (f < target === increasing) lo = mid;
    else hi = mid;
  }
  const value = Math.round(best.value * 10) / 10;
  return { spec: applyLever(spec, lever, value), value, achieved: at(value) ?? best.achieved };
}
