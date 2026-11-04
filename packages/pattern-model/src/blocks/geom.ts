import type { PatternEdge, PatternMarking, PatternPoint } from '@ai-designer/garment-model';

/** Geometry helpers for the pattern blocks (ADR-058). Millimetres, x right, y down. */

export type P = PatternPoint;

export const P = (x: number, y: number): P => ({ x, y });
export const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a: P, b: P, t: number): P => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function quadPts(a: P, c: P, b: P, steps = 10): P[] {
  const out: P[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      P(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y),
    );
  }
  return out;
}

export function cubicPts(a: P, c1: P, c2: P, b: P, steps = 14): P[] {
  const out: P[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      P(
        u ** 3 * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
        u ** 3 * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y,
      ),
    );
  }
  return out;
}

export function polyLength(pts: readonly P[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** Length of a named edge walking the outline forward (wrapping). */
export function edgeLength(outline: readonly P[], edge: Pick<PatternEdge, 'from' | 'to'>): number {
  const n = outline.length;
  if (!n) return 0;
  let s = 0;
  let i = edge.from % n;
  for (let guard = 0; i !== edge.to % n && guard < n; guard++) {
    const j = (i + 1) % n;
    s += dist(outline[i]!, outline[j]!);
    i = j;
  }
  return s;
}

/** Points of a named edge (inclusive). */
export function edgePoints(outline: readonly P[], edge: Pick<PatternEdge, 'from' | 'to'>): P[] {
  const n = outline.length;
  const out: P[] = [outline[edge.from % n]!];
  let i = edge.from % n;
  for (let guard = 0; i !== edge.to % n && guard < n; guard++) {
    i = (i + 1) % n;
    out.push(outline[i]!);
  }
  return out;
}

/** A closed outline built segment by segment, recording named edges as index ranges. */
export class Outline {
  pts: P[] = [];
  edges: PatternEdge[] = [];

  constructor(start: P) {
    this.pts.push(start);
  }

  get last(): P {
    return this.pts[this.pts.length - 1]!;
  }

  private add(name: string, pts: readonly P[], intakeMm = 0): this {
    const from = this.pts.length - 1;
    for (const p of pts) if (dist(p, this.last) > 0.01) this.pts.push(p);
    const to = this.pts.length - 1;
    if (to === from) return this;
    const prev = this.edges[this.edges.length - 1];
    if (prev && prev.name === name && prev.to === from) {
      prev.to = to;
      prev.intakeMm += intakeMm;
    } else this.edges.push({ name, from, to, intakeMm });
    return this;
  }

  line(name: string, p: P, intakeMm = 0): this {
    return this.add(name, [p], intakeMm);
  }

  quad(name: string, c: P, p: P, steps = 10): this {
    return this.add(name, quadPts(this.last, c, p, steps));
  }

  cubic(name: string, c1: P, c2: P, p: P, steps = 14): this {
    return this.add(name, cubicPts(this.last, c1, c2, p, steps));
  }

  poly(name: string, pts: readonly P[], intakeMm = 0): this {
    return this.add(name, pts, intakeMm);
  }

  /** Closes back to the start; the closing segment is edge `name`. */
  close(name: string): { outline: P[]; edges: PatternEdge[] } {
    const first = this.pts[0]!;
    if (dist(this.last, first) < 0.01) this.pts.pop();
    const from = this.pts.length - 1;
    const prev = this.edges[this.edges.length - 1];
    if (prev && prev.name === name && prev.to === from) prev.to = 0;
    else this.edges.push({ name, from, to: 0, intakeMm: 0 });
    return { outline: this.pts, edges: this.edges };
  }

  /** Adds intake to an existing edge (darts sewn into it). */
  intake(name: string, mm: number): this {
    const e = this.edges.find((x) => x.name === name);
    if (e) e.intakeMm += mm;
    return this;
  }
}

export interface DraftPiece {
  /** Stable key (redrafts keep the piece id), e.g. `bodice_front`. */
  template: string;
  name: string;
  outline: P[];
  edges: PatternEdge[];
  markings: PatternMarking[];
  grainline: { from: P; to: P } | null;
  foldLine: { from: P; to: P } | null;
  notches: P[];
  cutQuantity: number;
  mirrored: boolean;
  fabricRole: string;
  notes: string[];
  /** Drafting inputs worth keeping on the piece (mm). */
  inputs: Record<string, number>;
}

export function piece(
  template: string,
  name: string,
  shape: { outline: P[]; edges: PatternEdge[] },
  extra: Partial<Omit<DraftPiece, 'template' | 'name' | 'outline' | 'edges'>> = {},
): DraftPiece {
  return {
    template,
    name,
    outline: shape.outline,
    edges: shape.edges,
    markings: extra.markings ?? [],
    grainline: extra.grainline ?? null,
    foldLine: extra.foldLine ?? null,
    notches: extra.notches ?? [],
    cutQuantity: extra.cutQuantity ?? 1,
    mirrored: extra.mirrored ?? false,
    fabricRole: extra.fabricRole ?? 'main',
    notes: extra.notes ?? [],
    inputs: extra.inputs ?? {},
  };
}

export const mark = (
  kind: PatternMarking['kind'],
  points: P[],
  label: string | null = null,
): PatternMarking => ({ kind, points, label });

/** A dart drawn as a marking: two legs from the edge to the apex. */
export const dart = (a: P, apex: P, b: P, label = 'dart'): PatternMarking =>
  mark('dart', [a, apex, b], label);

/** Rounds every coordinate to 0.1 mm (stable hashes, readable numbers). */
export function roundPiece(p: DraftPiece): DraftPiece {
  const r = (q: P) => P(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10);
  return {
    ...p,
    outline: p.outline.map(r),
    markings: p.markings.map((m) => ({ ...m, points: m.points.map(r) })),
    grainline: p.grainline ? { from: r(p.grainline.from), to: r(p.grainline.to) } : null,
    foldLine: p.foldLine ? { from: r(p.foldLine.from), to: r(p.foldLine.to) } : null,
    notches: p.notches.map(r),
    edges: p.edges.map((e) => ({ ...e, intakeMm: Math.round(e.intakeMm * 10) / 10 })),
    inputs: Object.fromEntries(
      Object.entries(p.inputs).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ),
  };
}

/** A point along a polyline at a distance from its start. */
export function pointAlong(pts: readonly P[], d: number): P {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1]!, pts[i]!);
    if (left <= seg) return lerp(pts[i - 1]!, pts[i]!, seg ? left / seg : 0);
    left -= seg;
  }
  return pts[pts.length - 1]!;
}

/** Bisection on a monotonic function f(x) = target. */
export function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  const inc = f(hi) > f(lo);
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const v = f(m);
    if (v < target === inc) a = m;
    else b = m;
  }
  return (a + b) / 2;
}
