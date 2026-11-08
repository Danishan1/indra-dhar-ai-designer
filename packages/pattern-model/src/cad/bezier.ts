import type { PatternPoint } from '@ai-designer/garment-model';

/** Cubic Bézier helpers (ADR-059). Millimetres. */

export type Pt = PatternPoint;
export type Cubic = readonly [Pt, Pt, Pt, Pt];

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Pt): Pt => {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function bez(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
    y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
  };
}

/** First derivative. */
export function bezD(c: Cubic, t: number): Pt {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (c[1].x - c[0].x) + 6 * u * t * (c[2].x - c[1].x) + 3 * t * t * (c[3].x - c[2].x),
    y:
      3 * u * u * (c[1].y - c[0].y) + 6 * u * t * (c[2].y - c[1].y) + 3 * t * t * (c[3].y - c[2].y),
  };
}

/** Second derivative. */
export function bezDD(c: Cubic, t: number): Pt {
  const u = 1 - t;
  return {
    x: 6 * u * (c[2].x - 2 * c[1].x + c[0].x) + 6 * t * (c[3].x - 2 * c[2].x + c[1].x),
    y: 6 * u * (c[2].y - 2 * c[1].y + c[0].y) + 6 * t * (c[3].y - 2 * c[2].y + c[1].y),
  };
}

/** de Casteljau split at t. */
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const p01 = lerp(c[0], c[1], t);
  const p12 = lerp(c[1], c[2], t);
  const p23 = lerp(c[2], c[3], t);
  const a = lerp(p01, p12, t);
  const b = lerp(p12, p23, t);
  const m = lerp(a, b, t);
  return [
    [c[0], p01, a, m],
    [m, b, p23, c[3]],
  ];
}

/** Arc length (Gauss–Legendre 16 points per half; accurate to well under 0.01 mm here). */
const GX = [
  -0.9894009349916499, -0.9445750230732326, -0.8656312023878318, -0.755404408355003,
  -0.6178762444026438, -0.4580167776572274, -0.2816035507792589, -0.0950125098376374,
  0.0950125098376374, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438, 0.755404408355003,
  0.8656312023878318, 0.9445750230732326, 0.9894009349916499,
];
const GW = [
  0.0271524594117541, 0.0622535239386479, 0.0951585116824928, 0.1246289712555339,
  0.1495959888165767, 0.1691565193950025, 0.1826034150449236, 0.1894506104550685,
  0.1894506104550685, 0.1826034150449236, 0.1691565193950025, 0.1495959888165767,
  0.1246289712555339, 0.0951585116824928, 0.0622535239386479, 0.0271524594117541,
];
export function arcLength(c: Cubic, t0 = 0, t1 = 1): number {
  const h = (t1 - t0) / 2;
  const m = (t1 + t0) / 2;
  let s = 0;
  for (let i = 0; i < GX.length; i++) s += GW[i]! * len(bezD(c, m + h * GX[i]!));
  return s * h;
}

export function flattenCubic(c: Cubic, maxSegMm = 4): Pt[] {
  const L = arcLength(c);
  const n = Math.max(4, Math.min(48, Math.ceil(L / maxSegMm)));
  const out: Pt[] = [];
  for (let i = 1; i <= n; i++) out.push(bez(c, i / n));
  return out;
}

/** Closest t on the curve to p (coarse sampling + Newton). */
export function nearestT(c: Cubic, p: Pt): { t: number; d: number } {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 40; i++) {
    const d = dist(bez(c, i / 40), p);
    if (d < bestD) {
      bestD = d;
      best = i / 40;
    }
  }
  let t = best;
  for (let k = 0; k < 6; k++) {
    const q = sub(bez(c, t), p);
    const d1 = bezD(c, t);
    const d2 = bezDD(c, t);
    const den = dot(d1, d1) + dot(q, d2);
    if (Math.abs(den) < 1e-9) break;
    t = Math.min(1, Math.max(0, t - dot(q, d1) / den));
  }
  return { t, d: dist(bez(c, t), p) };
}

/** Quadratic → cubic. */
export function quadToCubic(a: Pt, c: Pt, b: Pt): Cubic {
  return [a, lerp(a, c, 2 / 3), lerp(b, c, 2 / 3), b];
}
