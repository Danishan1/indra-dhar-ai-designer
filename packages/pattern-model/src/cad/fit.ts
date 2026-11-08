import { add, bez, bezD, bezDD, type Cubic, dist, dot, mul, norm, type Pt, sub } from './bezier.js';

/**
 * Fits cubic Béziers to a polyline (Schneider, "An Algorithm for Automatically Fitting Digitized
 * Curves", Graphics Gems 1990). Used to turn the drafted (sampled) seam lines into a few editable
 * nodes with handles, within `tolerance` mm of the original.
 */
export function fitCurve(
  points: readonly Pt[],
  tolerance: number,
  tanStart?: Pt,
  tanEnd?: Pt,
): Cubic[] {
  const pts = dedupe(points);
  if (pts.length < 2) return [];
  if (pts.length === 2) {
    const d = dist(pts[0]!, pts[1]!) / 3;
    const t1 = tanStart ?? norm(sub(pts[1]!, pts[0]!));
    const t2 = tanEnd ?? norm(sub(pts[0]!, pts[1]!));
    return [[pts[0]!, add(pts[0]!, mul(t1, d)), add(pts[1]!, mul(t2, d)), pts[1]!]];
  }
  const t1 = tanStart ?? norm(sub(pts[1]!, pts[0]!));
  const t2 = tanEnd ?? norm(sub(pts[pts.length - 2]!, pts[pts.length - 1]!));
  return fitCubic(pts, t1, t2, tolerance, 0);
}

function dedupe(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || dist(out[out.length - 1]!, p) > 1e-6) out.push(p);
  return out;
}

function fitCubic(pts: Pt[], tHat1: Pt, tHat2: Pt, error: number, depth: number): Cubic[] {
  if (pts.length === 2) {
    const d = dist(pts[0]!, pts[1]!) / 3;
    return [[pts[0]!, add(pts[0]!, mul(tHat1, d)), add(pts[1]!, mul(tHat2, d)), pts[1]!]];
  }
  let u = chordLength(pts);
  let curve = generate(pts, u, tHat1, tHat2);
  let { maxError, splitAt } = maxErr(pts, curve, u);
  if (maxError < error) return [curve];
  if (maxError < error * 4) {
    for (let i = 0; i < 6; i++) {
      u = reparameterize(pts, u, curve);
      curve = generate(pts, u, tHat1, tHat2);
      ({ maxError, splitAt } = maxErr(pts, curve, u));
      if (maxError < error) return [curve];
    }
  }
  if (depth > 12) return [curve];
  const center = norm(sub(pts[splitAt - 1]!, pts[splitAt + 1]!));
  return [
    ...fitCubic(pts.slice(0, splitAt + 1), tHat1, center, error, depth + 1),
    ...fitCubic(pts.slice(splitAt), mul(center, -1), tHat2, error, depth + 1),
  ];
}

function chordLength(pts: Pt[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + dist(pts[i]!, pts[i - 1]!));
  const total = u[u.length - 1]! || 1;
  return u.map((x) => x / total);
}

function generate(pts: Pt[], u: number[], tHat1: Pt, tHat2: Pt): Cubic {
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]!;
    const b1 = 3 * t * (1 - t) ** 2;
    const b2 = 3 * t * t * (1 - t);
    const A1 = mul(tHat1, b1);
    const A2 = mul(tHat2, b2);
    C[0]![0]! += dot(A1, A1);
    C[0]![1]! += dot(A1, A2);
    C[1]![1]! += dot(A2, A2);
    const b0 = (1 - t) ** 3;
    const b3 = t ** 3;
    const tmp = sub(
      pts[i]!,
      add(add(mul(first, b0), mul(first, b1)), add(mul(last, b2), mul(last, b3))),
    );
    X[0]! += dot(A1, tmp);
    X[1]! += dot(A2, tmp);
  }
  C[1]![0] = C[0]![1]!;
  const det = C[0]![0]! * C[1]![1]! - C[1]![0]! * C[0]![1]!;
  let a1 = det !== 0 ? (X[0]! * C[1]![1]! - X[1]! * C[0]![1]!) / det : 0;
  let a2 = det !== 0 ? (C[0]![0]! * X[1]! - C[1]![0]! * X[0]!) / det : 0;
  const segLen = dist(first, last);
  const eps = 1e-6 * segLen;
  if (a1 < eps || a2 < eps) a1 = a2 = segLen / 3;
  return [first, add(first, mul(tHat1, a1)), add(last, mul(tHat2, a2)), last];
}

function maxErr(pts: Pt[], c: Cubic, u: number[]): { maxError: number; splitAt: number } {
  let maxError = 0;
  let splitAt = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(bez(c, u[i]!), pts[i]!);
    if (d > maxError) {
      maxError = d;
      splitAt = i;
    }
  }
  return { maxError, splitAt };
}

function reparameterize(pts: Pt[], u: number[], c: Cubic): number[] {
  return u.map((t, i) => {
    const q = sub(bez(c, t), pts[i]!);
    const d1 = bezD(c, t);
    const d2 = bezDD(c, t);
    const den = dot(d1, d1) + dot(q, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - dot(q, d1) / den));
  });
}
