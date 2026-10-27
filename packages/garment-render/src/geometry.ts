/** Small, deterministic 2D helpers. Numbers in path data are rounded to 0.01 mm. */
import type { Bounds, Point } from './types.js';

export const pt = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => pt(a.x + b.x, a.y + b.y);
export const sub = (a: Point, b: Point): Point => pt(a.x - b.x, a.y - b.y);
export const scale = (a: Point, k: number): Point => pt(a.x * k, a.y * k);
export const len = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => len(sub(a, b));
export const lerp = (a: Point, b: Point, t: number): Point =>
  pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const unit = (a: Point): Point => {
  const l = len(a);
  return l === 0 ? pt(0, 0) : scale(a, 1 / l);
};
/** Perpendicular (rotated 90° clockwise in y-down screen space). */
export const perp = (a: Point): Point => pt(-a.y, a.x);
/** Mirror across the centre line (x = 0). */
export const mirror = (a: Point): Point => pt(-a.x, a.y);

/** Formats a number for path data: 2 decimals, no "-0", no trailing zeros. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('Non-finite coordinate in garment geometry');
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
}

/** Builds SVG path data and remembers every point for bounds. */
export class PathBuilder {
  private readonly parts: string[] = [];
  readonly points: Point[] = [];

  private p(...ps: Point[]): string {
    this.points.push(...ps);
    return ps.map((q) => `${fmt(q.x)} ${fmt(q.y)}`).join(' ');
  }
  move(a: Point): this {
    this.parts.push(`M${this.p(a)}`);
    return this;
  }
  line(a: Point): this {
    this.parts.push(`L${this.p(a)}`);
    return this;
  }
  quad(c: Point, a: Point): this {
    this.parts.push(`Q${this.p(c, a)}`);
    return this;
  }
  cubic(c1: Point, c2: Point, a: Point): this {
    this.parts.push(`C${this.p(c1, c2, a)}`);
    return this;
  }
  close(): this {
    this.parts.push('Z');
    return this;
  }
  toString(): string {
    return this.parts.join(' ');
  }
}

export const path = () => new PathBuilder();

export function polyline(points: readonly Point[], closed = false): PathBuilder {
  const b = path();
  points.forEach((q, i) => (i === 0 ? b.move(q) : b.line(q)));
  if (closed) b.close();
  return b;
}

/** Circle as two arcs written with cubic curves (keeps everything in M/L/Q/C/Z). */
export function circle(c: Point, r: number): PathBuilder {
  const k = 0.5523 * r;
  return path()
    .move(pt(c.x + r, c.y))
    .cubic(pt(c.x + r, c.y + k), pt(c.x + k, c.y + r), pt(c.x, c.y + r))
    .cubic(pt(c.x - k, c.y + r), pt(c.x - r, c.y + k), pt(c.x - r, c.y))
    .cubic(pt(c.x - r, c.y - k), pt(c.x - k, c.y - r), pt(c.x, c.y - r))
    .cubic(pt(c.x + k, c.y - r), pt(c.x + r, c.y - k), pt(c.x + r, c.y))
    .close();
}

export function rect(x: number, y: number, w: number, h: number): PathBuilder {
  return polyline([pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)], true);
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const q of points) {
    minX = Math.min(minX, q.x);
    minY = Math.min(minY, q.y);
    maxX = Math.max(maxX, q.x);
    maxY = Math.max(maxY, q.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionBounds(list: readonly Bounds[]): Bounds {
  const pts = list.flatMap((b) => [pt(b.x, b.y), pt(b.x + b.width, b.y + b.height)]);
  return boundsOf(pts);
}

export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!);
  return total;
}

/** Point and unit tangent at distance `s` along a polyline. */
export function pointAt(points: readonly Point[], s: number): { p: Point; tangent: Point } {
  let remaining = Math.max(0, s);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const l = dist(a, b);
    if (remaining <= l || i === points.length - 1) {
      const t = l === 0 ? 0 : Math.min(1, remaining / l);
      return { p: lerp(a, b, t), tangent: unit(sub(b, a)) };
    }
    remaining -= l;
  }
  const only = points[0] ?? pt(0, 0);
  return { p: only, tangent: pt(1, 0) };
}

/** Samples a quadratic Bézier into `n` segments (for boundaries that trims follow). */
export function sampleQuad(a: Point, c: Point, b: Point, n = 16): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(
      pt(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y),
    );
  }
  return out;
}

/** Offsets a polyline by `d` along its left-hand normal (approximate, fine for short edges). */
export function offsetPolyline(points: readonly Point[], d: number): Point[] {
  return points.map((q, i) => {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(points.length - 1, i + 1)]!;
    return add(q, scale(perp(unit(sub(b, a))), d));
  });
}
