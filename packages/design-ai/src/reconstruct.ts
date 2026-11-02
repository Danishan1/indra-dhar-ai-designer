import {
  allowedPropertyKeys,
  type ComponentShape,
  defaultCatalog,
  type DesignComponent,
  type GarmentDesignState,
  type ShapePoint,
  type SourcePlacement,
} from '@ai-designer/garment-model';
import { geometryCapability, renderGarment } from '@ai-designer/garment-render';

import type { AnalysisComponent, Decomposition } from './analysis-schema.js';

/**
 * Editable reconstruction (ADR-057): the garment is rebuilt as vector artifacts — one shape per
 * component and view — instead of cropped pictures. Priority per component:
 *  1. the outline the AI traced on the uploaded image (`observed`, with its confidence),
 *  2. the parametric technical-flat geometry for shirts / T-shirts (`template`),
 *  3. a box at the region the AI pointed at, or a typical position (`inferred`).
 * Back views the images do not show are mirrored from the front (`inferred`, lower confidence).
 *
 * Garment frame: millimetres, origin at the top centre of the body, x right, y down — the same
 * frame as the technical-flat renderer.
 */

type Pt = { x: number; y: number };

/** Dimension each box side drives, per component type (only when the type has that property). */
const LINKS: Record<string, { width?: string; height?: string }> = {
  garment_body: { width: 'dimension.chest_width', height: 'dimension.body_length' },
  front_body_panel: { height: 'dimension.body_length' },
  back_body_panel: { height: 'dimension.body_length' },
  sleeve: { height: 'dimension.sleeve_length' },
  cuff: { height: 'dimension.cuff_width' },
  collar: { height: 'dimension.collar_height' },
  collar_stand: { height: 'dimension.collar_stand_height' },
  placket: { width: 'dimension.placket_width' },
  waistband: { height: 'dimension.waistband_height' },
  skirt_panel: { height: 'dimension.skirt_length' },
  leg_panel: { height: 'dimension.inseam' },
};

export function shapeLinks(componentType: string): ComponentShape['links'] {
  const allowed = new Set(allowedPropertyKeys(defaultCatalog, componentType));
  const l = LINKS[componentType] ?? {};
  return {
    width: l.width && allowed.has(l.width) ? l.width : null,
    height: l.height && allowed.has(l.height) ? l.height : null,
  };
}

/** Draw order: body under sleeves under small parts. */
const LAYER: Record<string, number> = {
  garment_body: 0,
  back_body_panel: 1,
  front_body_panel: 1,
  skirt_panel: 1,
  leg_panel: 1,
  hood: 2,
  sleeve: 2,
  yoke: 3,
  waistband: 3,
  collar_stand: 4,
  collar: 5,
  cuff: 5,
  placket: 6,
  pocket: 7,
};
export const layerOf = (type: string) => LAYER[type] ?? 6;

// ── path helpers ─────────────────────────────────────────────────────────────

/** Points of an absolute SVG path (M/L/H/V/Q/C/Z); curves are sampled. */
export function flattenPath(d: string): Pt[] {
  const tokens = d.match(/[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = '';
  let cur: Pt = { x: 0, y: 0 };
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[A-Za-z]/.test(t)) {
      cmd = t.toUpperCase();
      i++;
      if (cmd === 'Z') continue;
    }
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: num(), y: num() };
      pts.push(cur);
    } else if (cmd === 'H') {
      cur = { x: num(), y: cur.y };
      pts.push(cur);
    } else if (cmd === 'V') {
      cur = { x: cur.x, y: num() };
      pts.push(cur);
    } else if (cmd === 'Q') {
      const c = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 8; k++) {
        const t2 = k / 8;
        const a = (1 - t2) ** 2;
        const b = 2 * (1 - t2) * t2;
        const cc = t2 ** 2;
        pts.push({ x: a * cur.x + b * c.x + cc * e.x, y: a * cur.y + b * c.y + cc * e.y });
      }
      cur = e;
    } else if (cmd === 'C') {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const e = { x: num(), y: num() };
      for (let k = 1; k <= 10; k++) {
        const t2 = k / 10;
        const a = (1 - t2) ** 3;
        const b = 3 * (1 - t2) ** 2 * t2;
        const c = 3 * (1 - t2) * t2 ** 2;
        const f = t2 ** 3;
        pts.push({
          x: a * cur.x + b * c1.x + c * c2.x + f * e.x,
          y: a * cur.y + b * c1.y + c * c2.y + f * e.y,
        });
      }
      cur = e;
    } else i++; // unknown token: skip
  }
  return pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** Ramer–Douglas–Peucker simplification (keeps editable point counts small). */
export function simplify(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length <= 3) return [...points];
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  };
  const rec = (pts: readonly Pt[]): Pt[] => {
    let max = 0;
    let idx = 0;
    for (let k = 1; k < pts.length - 1; k++) {
      const dd = dist(pts[k]!, pts[0]!, pts[pts.length - 1]!);
      if (dd > max) {
        max = dd;
        idx = k;
      }
    }
    if (max <= tolerance) return [pts[0]!, pts[pts.length - 1]!];
    return [...rec(pts.slice(0, idx + 1)).slice(0, -1), ...rec(pts.slice(idx))];
  };
  const out = rec(points);
  // closed outline: drop a duplicate end point
  const a = out[0]!;
  const b = out[out.length - 1]!;
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6 ? out.slice(0, -1) : out;
}

/** A shape from absolute mm points (box + normalized path). */
export function shapeFromPoints(
  points: readonly Pt[],
  base: Omit<ComponentShape, 'x' | 'y' | 'width' | 'height' | 'path'>,
): ComponentShape | null {
  const simple = simplify(points, 1.5).slice(0, 200);
  if (simple.length < 3) return null;
  const xs = simple.map((p) => p.x);
  const ys = simple.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - x);
  const height = Math.max(1, Math.max(...ys) - y);
  return {
    ...base,
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    path: simple.map((p) => ({ x: round4((p.x - x) / width), y: round4((p.y - y) / height) })),
  };
}

const round = (v: number) => Math.round(v * 10) / 10;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Catmull-Rom handles for the points the model marked as smooth. */
export function smoothHandles(points: readonly (Pt & { smooth?: boolean })[]): ShapePoint[] {
  const n = points.length;
  return points.map((p, i) => {
    const out: ShapePoint = { x: round4(p.x), y: round4(p.y) };
    if (!p.smooth) return out;
    const prev = points[(i - 1 + n) % n]!;
    const next = points[(i + 1) % n]!;
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    out.c1 = { x: round4(p.x - tx), y: round4(p.y - ty) };
    out.c2 = { x: round4(p.x + tx), y: round4(p.y + ty) };
    return out;
  });
}

const RECT: ShapePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

// ── template geometry (shirts / T-shirts) ───────────────────────────────────

/** Panel outlines of the parametric technical flat, per component and view. */
export function templateShapes(state: GarmentDesignState): Map<string, ComponentShape[]> {
  const out = new Map<string, ComponentShape[]>();
  if (geometryCapability(state) !== 'G2') return out;
  const scene = renderGarment(state);
  for (const view of ['front', 'back'] as const) {
    const vs = scene.views[view];
    if (!vs.available) continue;
    const best = new Map<string, Pt[]>();
    for (const el of vs.elements) {
      if (el.role !== 'panel' || !el.componentId) continue;
      const pts = flattenPath(el.d);
      const prev = best.get(el.componentId);
      if (!prev || pts.length > prev.length) best.set(el.componentId, pts);
    }
    for (const [componentId, pts] of best) {
      const c = state.components.find((x) => x.componentId === componentId);
      if (!c) continue;
      const shape = shapeFromPoints(pts, {
        view,
        rotation: 0,
        layer: layerOf(c.componentType),
        style: { fill: null, stroke: '#1f2937', opacity: 1 },
        details: [],
        source: 'template',
        confidence: null,
        links: shapeLinks(c.componentType),
      });
      if (shape) out.set(componentId, [...(out.get(componentId) ?? []), shape]);
    }
  }
  return out;
}

// ── observed geometry (from the AI's outline on the image) ──────────────────

export interface ImageSize {
  width: number;
  height: number;
}

export interface ObservedReconstruction {
  shapes: Map<string, ComponentShape[]>;
  placements: Map<number, SourcePlacement>;
}

/**
 * Converts the outlines the model traced (normalized to each component's region on an image) into
 * garment-frame millimetres. Scale: the body's estimated length (or 750 mm) over its height on the
 * image — so proportions follow the drawing, absolute size follows the estimate.
 */
export function observedShapes(input: {
  decomposition: Decomposition;
  imageSizes: readonly (ImageSize | null)[];
  componentIds: Readonly<Record<string, string>>;
  /** image index → view (from the user's/model's role notes); default front */
  viewOf?: (imageIndex: number) => 'front' | 'back';
}): ObservedReconstruction {
  const shapes = new Map<string, ComponentShape[]>();
  const placements = new Map<number, SourcePlacement>();
  const d = input.decomposition;
  const body = d.components.find((c) => c.componentType === 'garment_body' && c.region);
  for (const [imageIndex, size] of input.imageSizes.entries()) {
    if (!size) continue;
    const onImage = d.components.filter(
      (c) => c.region?.imageIndex === imageIndex && c.outline?.length,
    );
    if (!onImage.length) continue;
    const ref =
      (body?.region?.imageIndex === imageIndex ? body : null) ??
      onImage.reduce((a, b) =>
        a.region!.width * a.region!.height >= b.region!.width * b.region!.height ? a : b,
      );
    const r = ref.region!;
    const bodyLengthMm = body?.measurementsMm['body_length'] ?? 750;
    const s = bodyLengthMm / Math.max(1, r.height * size.height); // mm per pixel
    const cx = (r.x + r.width / 2) * size.width;
    const top = r.y * size.height;
    const toMm = (nx: number, ny: number): Pt => ({
      x: (nx * size.width - cx) * s,
      y: (ny * size.height - top) * s,
    });
    const view = input.viewOf?.(imageIndex) ?? 'front';
    const tl = toMm(0, 0);
    placements.set(imageIndex, {
      view,
      x: round(tl.x),
      y: round(tl.y),
      width: round(size.width * s),
      height: round(size.height * s),
    });
    for (const c of onImage) {
      const id = input.componentIds[c.key];
      if (!id) continue;
      const reg = c.region!;
      const p0 = toMm(reg.x, reg.y);
      const width = Math.max(1, reg.width * size.width * s);
      const height = Math.max(1, reg.height * size.height * s);
      const shape: ComponentShape = {
        view: c.view ?? view,
        x: round(p0.x),
        y: round(p0.y),
        width: round(width),
        height: round(height),
        rotation: 0,
        path: smoothHandles(c.outline!),
        layer: layerOf(c.componentType),
        style: { fill: null, stroke: '#1f2937', opacity: 1 },
        details: (c.details ?? []).map((dt) => ({ kind: dt.kind, points: dt.points })),
        source: 'observed',
        confidence: c.confidence,
        links: shapeLinks(c.componentType),
      };
      shapes.set(id, [...(shapes.get(id) ?? []), shape]);
    }
  }
  return { shapes, placements };
}

// ── fallbacks ────────────────────────────────────────────────────────────────

/** Typical position of a part relative to a 560 × 750 mm body (front view), for boxes. */
const TYPICAL: Record<string, { x: number; y: number; w: number; h: number }> = {
  garment_body: { x: -280, y: 0, w: 560, h: 750 },
  front_body_panel: { x: -280, y: 0, w: 560, h: 750 },
  back_body_panel: { x: -280, y: 0, w: 560, h: 750 },
  collar: { x: -110, y: -60, w: 220, h: 70 },
  collar_stand: { x: -100, y: -20, w: 200, h: 30 },
  placket: { x: -18, y: 10, w: 36, h: 700 },
  pocket: { x: 60, y: 160, w: 120, h: 140 },
  yoke: { x: -280, y: 0, w: 560, h: 110 },
  waistband: { x: -280, y: -40, w: 560, h: 40 },
  hood: { x: -160, y: -340, w: 320, h: 340 },
  sleeve_left: { x: 280, y: 20, w: 200, h: 600 },
  sleeve_right: { x: -480, y: 20, w: 200, h: 600 },
  cuff_left: { x: 300, y: 620, w: 160, h: 65 },
  cuff_right: { x: -460, y: 620, w: 160, h: 65 },
  skirt_panel: { x: -300, y: 0, w: 600, h: 650 },
  leg_panel_left: { x: 0, y: 0, w: 260, h: 1000 },
  leg_panel_right: { x: -260, y: 0, w: 260, h: 1000 },
};

function boxShape(c: DesignComponent, view: 'front' | 'back'): ComponentShape {
  const key = `${c.componentType}_${c.side}`;
  const t = TYPICAL[key] ?? TYPICAL[c.componentType] ?? { x: -60, y: 200, w: 120, h: 120 };
  return {
    view,
    x: t.x,
    y: t.y,
    width: t.w,
    height: t.h,
    rotation: 0,
    path: RECT,
    layer: layerOf(c.componentType),
    style: { fill: null, stroke: '#1f2937', opacity: 1 },
    details: [],
    source: 'inferred',
    confidence: 0.2,
    links: shapeLinks(c.componentType),
  };
}

const BACK_TYPES = new Set([
  'garment_body',
  'back_body_panel',
  'sleeve',
  'cuff',
  'collar',
  'collar_stand',
  'yoke',
  'hood',
  'waistband',
  'skirt_panel',
  'leg_panel',
]);

/** Back view mirrored from the front where the images show no back (left ↔ right swap). */
function mirroredBack(shape: ComponentShape): ComponentShape {
  return {
    ...shape,
    view: 'back',
    x: round(-(shape.x + shape.width)),
    rotation: -shape.rotation,
    path: shape.path.map((p) => ({
      x: round4(1 - p.x),
      y: p.y,
      ...(p.c2 ? { c1: { x: round4(1 - p.c2.x), y: p.c2.y } } : {}),
      ...(p.c1 ? { c2: { x: round4(1 - p.c1.x), y: p.c1.y } } : {}),
    })),
    details: [],
    source: shape.source === 'template' ? 'template' : 'inferred',
    confidence: shape.confidence === null ? null : Math.min(shape.confidence, 0.4),
  };
}

/**
 * Gives every component its editable shapes (mutates `state`): observed outlines first, then the
 * technical-flat template, then a box; adds mirrored back views and the source-image placements.
 */
export function reconstructShapes(
  state: GarmentDesignState,
  observed: ObservedReconstruction | null,
): { observed: number; template: number; inferred: number } {
  const template = templateShapes(state);
  const counts = { observed: 0, template: 0, inferred: 0 };
  const frontPanelShape = () => {
    const fp = state.components.find((c) => c.componentType === 'front_body_panel');
    return fp?.shapes?.find((s) => s.view === 'front');
  };
  for (const c of state.components) {
    let shapes = observed?.shapes.get(c.componentId) ?? [];
    if (shapes.length) counts.observed++;
    else if (template.get(c.componentId)?.length) {
      shapes = template.get(c.componentId)!;
      counts.template++;
    } else if (c.componentType !== 'back_body_panel') {
      // Region the model pointed at without an outline → a box there.
      shapes = [boxShape(c, c.componentType === 'back_body_panel' ? 'back' : 'front')];
      counts.inferred++;
    }
    if (shapes.length) c.shapes = shapes;
  }
  // Back panel: mirror of the front panel when not seen.
  for (const c of state.components) {
    if (c.componentType === 'back_body_panel' && !c.shapes?.length) {
      const fp = frontPanelShape();
      c.shapes = [
        fp ? { ...mirroredBack(fp), links: shapeLinks(c.componentType) } : boxShape(c, 'back'),
      ];
      counts.inferred++;
    }
  }
  for (const c of state.components) {
    const has = (v: 'front' | 'back') => c.shapes?.some((s) => s.view === v);
    if (has('front') && !has('back') && BACK_TYPES.has(c.componentType)) {
      const front = c.shapes!.find((s) => s.view === 'front')!;
      c.shapes = [...c.shapes!, mirroredBack(front)].slice(0, 4);
    }
  }
  return counts;
}

export type { AnalysisComponent };
