/**
 * Trims and artwork from relationships (ADR-024): a lace/trim follows the target's boundary path by
 * repeating its motif (count proportional to the edge length); without a boundary it is drawn as a
 * labelled approximation (FR-RV-078/079). Embroidery/artwork are placeholders at their region.
 */
import type {
  DesignComponent,
  DesignRelationship,
  GarmentDesignState,
} from '@ai-designer/garment-model';

import {
  add,
  dist,
  offsetPolyline,
  path,
  pointAt,
  polyline,
  polylineLength,
  pt,
  rect,
  scale,
  sub,
} from './geometry.js';
import type {
  BoundaryPath,
  Bounds,
  Point,
  RenderOptions,
  SceneElement,
  SceneWarning,
  View,
} from './types.js';

const TRIM_RELATIONSHIPS = new Set([
  'decorative_trim_applied_to',
  'embroidery_placed_on',
  'applied_to',
]);

/** Which boundary a placement region means. */
const REGION_BOUNDARY: Record<string, readonly string[]> = {
  hem: ['hem_edge', 'cuff_edge', 'sleeve_opening'],
  cuff: ['cuff_edge', 'sleeve_opening'],
  opening: ['sleeve_opening', 'cuff_edge', 'pocket_opening'],
  neckline: ['neck_edge', 'collar_edge'],
  neck: ['neck_edge', 'collar_edge'],
  collar: ['collar_edge'],
  edge: [],
};

export interface TrimTarget {
  component: DesignComponent;
  anchors: Record<string, Point>;
  boundaries: BoundaryPath[];
  bounds: Bounds;
}

export function pickBoundary(
  boundaries: BoundaryPath[],
  region: string | null,
): BoundaryPath | null {
  if (boundaries.length === 0) return null;
  if (region) {
    const names = REGION_BOUNDARY[region] ?? [region];
    for (const n of names) {
      const b = boundaries.find((x) => x.name === n);
      if (b) return b;
    }
    if (REGION_BOUNDARY[region] === undefined) return null;
  }
  return boundaries[0] ?? null;
}

/** Number of motif repeats for an edge: proportional to its length (at least one). */
export const motifCount = (lengthMm: number, motifWidthMm: number): number =>
  Math.max(1, Math.round(lengthMm / Math.max(2, motifWidthMm)));

/** A scalloped border following `points`, bulging away from `inside`. */
export function scallopPath(points: Point[], width: number, inside: Point) {
  const total = polylineLength(points);
  const n = motifCount(total, width);
  const b = path();
  points.forEach((p, i) => (i === 0 ? b.move(p) : b.line(p)));
  b.move(pointAt(points, 0).p);
  for (let i = 0; i < n; i++) {
    const e = pointAt(points, (total * (i + 1)) / n);
    const mid = pointAt(points, (total * (i + 0.5)) / n);
    let normal = pt(-mid.tangent.y, mid.tangent.x);
    const away = sub(mid.p, inside);
    if (normal.x * away.x + normal.y * away.y < 0) normal = scale(normal, -1);
    b.quad(add(mid.p, scale(normal, width * 0.9)), e.p);
  }
  return { path: b, count: n };
}

const scaleOf = (r: DesignRelationship): number => {
  const sc = r.placement?.scale;
  return typeof sc === 'number' && sc > 0 ? sc : 1;
};
const offsetMm = (r: DesignRelationship): number => {
  const o = r.placement?.offset;
  if (!o) return 0;
  return o.unit === 'cm' ? o.value * 10 : o.unit === 'in' ? o.value * 25.4 : o.value;
};

/** Moves an edge `d` mm away from `inside` (negative: towards it). */
export function shiftAway(points: readonly Point[], d: number, inside: Point): Point[] {
  const shifted = offsetPolyline(points, d);
  const mid = points[Math.floor(points.length / 2)]!;
  const smid = shifted[Math.floor(points.length / 2)]!;
  const away = dist(smid, inside) > dist(mid, inside);
  return away ? shifted : offsetPolyline(points, -d);
}

/** A rectangle of `w`×`h` centred on `c`, rotated by `deg` (deterministic). */
export function rotatedRect(c: Point, w: number, h: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const corner = (dx: number, dy: number) =>
    pt(c.x + dx * cos - dy * sin, c.y + dx * sin + dy * cos);
  return polyline(
    [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)],
    true,
  );
}

const centreOf = (t: TrimTarget): Point =>
  t.anchors.centre ?? pt(t.bounds.x + t.bounds.width / 2, t.bounds.y + t.bounds.height / 2);

export function renderTrims(
  state: GarmentDesignState,
  view: View,
  targets: Map<string, TrimTarget>,
  options: RenderOptions,
): { elements: (SceneElement & { points: Point[] })[]; warnings: SceneWarning[] } {
  const elements: (SceneElement & { points: Point[] })[] = [];
  const warnings: SceneWarning[] = [];
  const rels = state.relationships
    .filter((r) => TRIM_RELATIONSHIPS.has(r.type) && r.target.entityType === 'design_component')
    .sort((a, b) => (a.relationshipId < b.relationshipId ? -1 : 1));
  for (const r of rels) {
    const target = targets.get(r.target.entityId);
    if (!target) continue;
    const info =
      r.source.entityType === 'artifact_revision' && options.artifact
        ? options.artifact(r.source.entityId)
        : null;
    if (
      options.artifact &&
      r.source.entityType === 'artifact_revision' &&
      !info &&
      view === 'front'
    )
      warnings.push({
        code: 'UNKNOWN_ARTIFACT',
        message: `The artifact used on ${target.component.displayName} could not be loaded; drawn generically.`,
        componentId: target.component.componentId,
      });
    const category = info?.category ?? defaultCategory(r);
    if (category === 'button') continue;
    const name =
      info?.name ??
      (category === 'embroidery' ? 'Embroidery' : category === 'artwork' ? 'Artwork' : 'Trim');
    const params = info?.shapeParams?.params ?? {};
    const num = (k: string, d: number) =>
      typeof params[k] === 'number' ? (params[k] as number) : d;
    const base = {
      componentId: target.component.componentId,
      relationshipId: r.relationshipId,
      view,
      fill: 'none',
      label: `${name} on ${target.component.displayName}`,
    };
    const region = r.placement?.region ?? null;
    if (category === 'lace' || category === 'trim' || r.type === 'decorative_trim_applied_to') {
      const boundary = pickBoundary(target.boundaries, region);
      if (
        boundary &&
        boundary.points.length >= 2 &&
        dist(boundary.points[0]!, boundary.points.at(-1)!) > 0
      ) {
        const inside = centreOf(target);
        const offset = offsetMm(r);
        const pts = offset ? shiftAway(boundary.points, offset, inside) : boundary.points;
        const { path: p } = scallopPath(pts, num('widthMm', 18) * scaleOf(r), inside);
        elements.push({
          ...base,
          id: `${r.relationshipId}:${view}:trim`,
          layer: 'trims',
          role: 'trim',
          d: p.toString(),
          text: null,
          points: p.points,
        });
      } else {
        elements.push(approximate(base, r, view, centreOf(target)));
        if (view === 'front')
          warnings.push({
            code: 'APPROXIMATE_TRIM',
            message: `${name} on ${target.component.displayName} has no edge to follow here; shown as an approximation.`,
            componentId: target.component.componentId,
          });
      }
      continue;
    }
    // Embroidery / artwork: a placeholder box at the region (or the centre, marked approximate).
    const at = (region && target.anchors[region]) || null;
    const w = num('widthMm', 70) * scaleOf(r);
    const h = num('heightMm', num('widthMm', 70)) * scaleOf(r);
    const base0 = at ?? centreOf(target);
    // Offset moves the placement down from its anchor (component_local y), rotation turns it.
    const c = pt(base0.x, base0.y + offsetMm(r));
    const p = rotatedRect(c, w, h, r.placement?.rotationDeg ?? 0);
    const approx = !at || r.placement?.approximate === true;
    elements.push({
      ...base,
      id: `${r.relationshipId}:${view}:artwork`,
      layer: 'artwork',
      role: approx ? 'approximate' : 'artwork',
      d: p.toString(),
      text: { x: c.x, y: c.y, value: approx ? 'approximate' : category },
      points: p.points,
    });
  }
  return { elements, warnings };
}

function defaultCategory(r: DesignRelationship): string {
  if (r.type === 'embroidery_placed_on') return 'embroidery';
  if (r.type === 'decorative_trim_applied_to') return 'trim';
  return 'artwork';
}

function approximate(
  base: Omit<SceneElement, 'id' | 'layer' | 'role' | 'd' | 'text'>,
  r: DesignRelationship,
  view: View,
  c: Point,
): SceneElement & { points: Point[] } {
  const p = rect(c.x - 45, c.y - 9, 90, 18);
  return {
    ...base,
    id: `${r.relationshipId}:${view}:approximate`,
    layer: 'trims',
    role: 'approximate',
    d: p.toString(),
    text: { x: c.x, y: c.y, value: 'approximate' },
    points: p.points,
  };
}
