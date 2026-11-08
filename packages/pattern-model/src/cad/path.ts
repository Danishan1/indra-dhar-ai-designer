import type { PathNode, PatternEdge, PatternPiece } from '@ai-designer/garment-model';

import {
  add,
  arcLength,
  bez,
  bezD,
  type Cubic,
  dist,
  dot,
  flattenCubic,
  lerp,
  mul,
  nearestT,
  norm,
  type Pt,
  split,
  sub,
} from './bezier.js';
import { fitCurve } from './fit.js';

/**
 * The editable vector outline of a pattern piece (ADR-059): a closed Bézier path whose segments
 * carry the seam-edge name. `outline`/`edges` are always derived from it, so checks, tech packs and
 * exports keep working on polylines. All editing tools are pure functions of a piece.
 */

type Node = PathNode;
type Piece = PatternPiece;

const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: Pt): Pt => ({ x: r2(p.x), y: r2(p.y) });

export function node(p: Pt, seg: string, extra: Partial<Node> = {}): Node {
  return { x: p.x, y: p.y, in: null, out: null, smooth: false, seg, ...extra };
}

/** Segment i as a cubic, or null when it is a straight line. */
export function segCubic(path: readonly Node[], i: number): Cubic | null {
  const a = path[i]!;
  const b = path[(i + 1) % path.length]!;
  if (!a.out && !b.in) return null;
  return [a, a.out ?? a, b.in ?? b, b];
}

export function segLength(path: readonly Node[], i: number): number {
  const c = segCubic(path, i);
  return c ? arcLength(c) : dist(path[i]!, path[(i + 1) % path.length]!);
}

export function segPoint(path: readonly Node[], i: number, t: number): Pt {
  const c = segCubic(path, i);
  return c ? bez(c, t) : lerp(path[i]!, path[(i + 1) % path.length]!, t);
}

// ── polyline ↔ path ─────────────────────────────────────────────────────────

function turn(a: Pt, b: Pt, c: Pt): number {
  const t1 = Math.atan2(b.y - a.y, b.x - a.x);
  const t2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(t2 - t1);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

function maxChordDeviation(pts: readonly Pt[]): number {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const L = dist(a, b);
  let m = 0;
  for (const p of pts) {
    const d =
      L < 1e-9
        ? dist(p, a)
        : Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x) / L;
    if (d > m) m = d;
  }
  return m;
}

/**
 * Converts a drafted (sampled) outline into a few editable nodes: one run per named edge, split at
 * sharp corners; straight runs stay lines, curved runs are fitted within `tolerance` mm.
 */
export function pathFromOutline(
  outline: readonly Pt[],
  edges: readonly PatternEdge[] | undefined,
  tolerance = 0.3,
): Node[] {
  const n = outline.length;
  if (n < 3) return outline.map((p) => node(p, ''));
  // Breakpoints: edge boundaries + sharp corners.
  const names: string[] = new Array(n).fill('');
  const bounds = new Set<number>();
  const valid = (edges ?? []).filter((e) => e.from < n && e.to < n);
  for (const e of valid) {
    bounds.add(e.from);
    bounds.add(e.to);
    let i = e.from;
    for (let g = 0; g < n && i !== e.to; g++) {
      names[i] = e.name;
      i = (i + 1) % n;
    }
  }
  for (let i = 0; i < n; i++) {
    if (turn(outline[(i - 1 + n) % n]!, outline[i]!, outline[(i + 1) % n]!) > (32 * Math.PI) / 180)
      bounds.add(i);
  }
  if (!bounds.size) bounds.add(0);
  const marks = [...bounds].sort((a, b) => a - b);
  const nodes: Node[] = [];
  const pendingIn = new Map<number, Pt>();
  for (let k = 0; k < marks.length; k++) {
    const from = marks[k]!;
    const to = marks[(k + 1) % marks.length]!;
    const run: Pt[] = [outline[from]!];
    let i = from;
    for (let g = 0; g < n; g++) {
      i = (i + 1) % n;
      run.push(outline[i]!);
      if (i === to) break;
    }
    const seg = names[from] ?? '';
    const start = node(rp(outline[from]!), seg);
    if (nodes.length && dist(nodes[nodes.length - 1]!, start) < 1e-6) {
      nodes[nodes.length - 1]!.seg = seg;
    } else nodes.push(start);
    if (run.length <= 2 || maxChordDeviation(run) <= tolerance) continue; // straight
    const curves = fitCurve(run, tolerance);
    let cur = nodes[nodes.length - 1]!;
    curves.forEach((c, ci) => {
      cur.out = rp(c[1]);
      const last = ci === curves.length - 1;
      if (last) {
        // The end node is the next run's start; remember its in-handle.
        pendingIn.set(to, rp(c[2]));
      } else {
        const nn = node(rp(c[3]), seg, { in: rp(c[2]), smooth: true });
        nodes.push(nn);
        cur = nn;
      }
    });
  }
  // Attach pending in-handles to the run-start nodes.
  const startIdx = new Map<number, number>();
  {
    let j = 0;
    for (const m of marks) {
      while (j < nodes.length && dist(nodes[j]!, outline[m]!) > 0.02) j++;
      if (j < nodes.length) startIdx.set(m, j);
    }
  }
  for (const [m, h] of pendingIn) {
    const j = startIdx.get(m);
    if (j !== undefined) nodes[j]!.in = h;
  }
  return nodes;
}

/** The path of a piece (fitted from its outline when it has none yet). */
export function ensurePath(piece: Pick<Piece, 'outline' | 'edges' | 'path'>): Node[] {
  return piece.path?.length
    ? piece.path.map((n) => ({ ...n }))
    : pathFromOutline(piece.outline, piece.edges);
}

/** Path → flattened outline + edges (intake kept by edge name). */
export function flattenPath(
  path: readonly Node[],
  prevEdges?: readonly PatternEdge[],
): { outline: Pt[]; edges: PatternEdge[] } {
  const n = path.length;
  const outline: Pt[] = [];
  const at: number[] = [];
  for (let i = 0; i < n; i++) {
    at[i] = outline.length;
    outline.push({ x: path[i]!.x, y: path[i]!.y });
    const c = segCubic(path, i);
    if (c) outline.push(...flattenCubic(c).slice(0, -1));
  }
  const intake = new Map((prevEdges ?? []).map((e) => [e.name, e.intakeMm]));
  // Group consecutive segments by name (wrapping).
  const edges: PatternEdge[] = [];
  let start = -1;
  for (let i = 0; i < n; i++)
    if (path[i]!.seg !== path[(i - 1 + n) % n]!.seg) {
      start = i;
      break;
    }
  if (start < 0) {
    if (path[0]!.seg)
      edges.push({
        name: path[0]!.seg,
        from: 0,
        to: outline.length - 1,
        intakeMm: intake.get(path[0]!.seg) ?? 0,
      });
  } else {
    let i = start;
    for (let g = 0; g < n;) {
      const name = path[i]!.seg;
      let j = i;
      let count = 0;
      while (count < n - g && path[j]!.seg === name) {
        j = (j + 1) % n;
        count++;
      }
      if (name) edges.push({ name, from: at[i]!, to: at[j]!, intakeMm: intake.get(name) ?? 0 });
      g += count;
      i = j;
    }
  }
  return {
    outline: outline.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })),
    edges,
  };
}

/** Puts an edited path on the piece (outline/edges derived); marks it edited by hand. */
export function withPath(piece: Piece, path: Node[], opts: { edited?: boolean } = {}): Piece {
  const { outline, edges } = flattenPath(path, piece.edges);
  return {
    ...piece,
    path,
    outline,
    edges,
    ...(opts.edited === false ? {} : { source: 'user' as const, status: 'needs_review' as const }),
  };
}

/** Adds the fitted path to a drafted piece without marking it edited. */
export function attachPath(piece: Piece): Piece {
  if (piece.path?.length) return piece;
  const path = pathFromOutline(piece.outline, piece.edges);
  return { ...piece, path };
}

// ── measurement ─────────────────────────────────────────────────────────────

/** Segment indices of a named edge, in order (wrapping). */
export function edgeSegments(path: readonly Node[], name: string): number[] {
  const n = path.length;
  const idx = path.map((p, i) => (p.seg === name ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  let start = idx[0]!;
  if (idx.length < n && path[(start - 1 + n) % n]!.seg === name) {
    // wraps: start after the first gap
    for (let i = 0; i < n; i++) {
      if (path[i]!.seg === name && path[(i - 1 + n) % n]!.seg !== name) {
        start = i;
        break;
      }
    }
  }
  const out: number[] = [];
  for (let i = start, g = 0; g < n && path[i]!.seg === name; g++, i = (i + 1) % n) out.push(i);
  return out;
}

export function pathEdgeLength(path: readonly Node[], name: string): number {
  return edgeSegments(path, name).reduce((s, i) => s + segLength(path, i), 0);
}

/** Nearest point on the path to p: segment, t and distance. */
export function nearestOnPath(
  path: readonly Node[],
  p: Pt,
): { seg: number; t: number; d: number; point: Pt } {
  let best = { seg: 0, t: 0, d: Infinity, point: path[0] as Pt };
  for (let i = 0; i < path.length; i++) {
    const c = segCubic(path, i);
    let t: number;
    let d: number;
    if (c) ({ t, d } = nearestT(c, p));
    else {
      const a = path[i]!;
      const b = path[(i + 1) % path.length]!;
      const ab = sub(b, a);
      const L2 = dot(ab, ab) || 1;
      t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / L2));
      d = dist(lerp(a, b, t), p);
    }
    if (d < best.d) best = { seg: i, t, d, point: segPoint(path, i, t) };
  }
  return best;
}

// ── node editing ────────────────────────────────────────────────────────────

const moveP = (p: Pt | null, dx: number, dy: number) =>
  p ? { x: r2(p.x + dx), y: r2(p.y + dy) } : null;

export function moveNodes(
  path: readonly Node[],
  indices: readonly number[],
  dx: number,
  dy: number,
): Node[] {
  const set = new Set(indices);
  return path.map((n, i) =>
    set.has(i)
      ? {
          ...n,
          x: r2(n.x + dx),
          y: r2(n.y + dy),
          in: moveP(n.in, dx, dy),
          out: moveP(n.out, dx, dy),
        }
      : n,
  );
}

export function setNodePosition(path: readonly Node[], i: number, p: Pt): Node[] {
  const n = path[i]!;
  return moveNodes(path, [i], p.x - n.x, p.y - n.y);
}

/** Drags a handle; smooth nodes keep the opposite handle in line (its own length). */
export function moveHandle(path: readonly Node[], i: number, which: 'in' | 'out', p: Pt): Node[] {
  return path.map((n, k) => {
    if (k !== i) return n;
    const next: Node = { ...n, [which]: rp(p) };
    const other = which === 'in' ? 'out' : 'in';
    const o = n[other];
    if (n.smooth && o) {
      const dir = norm(sub(n, p));
      const l = dist(n, o);
      next[other] = rp(add(n, mul(dir, l)));
    }
    return next;
  });
}

/** Corner ↔ smooth. Making a node smooth gives it aligned handles (Catmull-Rom tangent). */
export function setSmooth(path: readonly Node[], i: number, smooth: boolean): Node[] {
  const n = path.length;
  const prev = path[(i - 1 + n) % n]!;
  const next = path[(i + 1) % n]!;
  return path.map((p, k) => {
    if (k !== i) return p;
    if (!smooth) return { ...p, smooth: false };
    const tan = norm(sub(next, prev));
    const li = (p.in ? dist(p, p.in) : dist(p, prev) / 3) || dist(p, prev) / 3;
    const lo = (p.out ? dist(p, p.out) : dist(p, next) / 3) || dist(p, next) / 3;
    return { ...p, smooth: true, in: rp(sub(p, mul(tan, li))), out: rp(add(p, mul(tan, lo))) };
  });
}

/** Straight ↔ curved segment. */
export function setSegmentCurved(path: readonly Node[], i: number, curved: boolean): Node[] {
  const n = path.length;
  const j = (i + 1) % n;
  const a = path[i]!;
  const b = path[j]!;
  return path.map((p, k) => {
    if (k === i)
      return {
        ...p,
        out: curved ? rp(lerp(a, b, 1 / 3)) : null,
        smooth: curved ? p.smooth : false,
      };
    if (k === j)
      return { ...p, in: curved ? rp(lerp(a, b, 2 / 3)) : null, smooth: curved ? p.smooth : false };
    return p;
  });
}

/** Inserts a node on segment i at t (the curve shape is unchanged). */
export function insertNode(path: readonly Node[], i: number, t: number): Node[] {
  const n = path.length;
  const j = (i + 1) % n;
  const a = path[i]!;
  const b = path[j]!;
  const c = segCubic(path, i);
  const out = path.map((p) => ({ ...p }));
  if (!c) {
    const m = node(rp(lerp(a, b, t)), a.seg);
    out.splice(i + 1, 0, m);
    return out;
  }
  const [l, r] = split(c, t);
  out[i] = { ...out[i]!, out: rp(l[1]) };
  out[j] = { ...out[j]!, in: rp(r[2]) };
  const m = node(rp(l[3]), a.seg, { in: rp(l[2]), out: rp(r[1]), smooth: true });
  out.splice(i + 1, 0, m);
  return out;
}

/** Removes nodes (a path keeps at least 3). */
export function deleteNodes(path: readonly Node[], indices: readonly number[]): Node[] {
  const set = new Set(indices);
  const out = path.filter((_, i) => !set.has(i));
  return out.length >= 3 ? out.map((p) => ({ ...p })) : path.map((p) => ({ ...p }));
}

// ── pattern-maker tools ─────────────────────────────────────────────────────

/** A cut line: a point and a direction (lengthen = horizontal, widen = vertical). */
export interface CutLine {
  point: Pt;
  dir: Pt;
}

/**
 * Lengthen (amount > 0) or shorten (< 0) a piece across a cut line, the way a pattern maker slashes
 * and spreads: everything on the positive side moves by `amount` along the normal; crossing seams
 * are split at the line and joined by a straight insert, so curves keep their shape. Shortening is
 * the same with a negative amount (an overlap).
 */
export function spreadPiece(piece: Piece, line: CutLine, amount: number): Piece {
  const path = ensurePath(piece);
  const dir = norm(line.dir);
  const nrm = { x: -dir.y, y: dir.x };
  const s = (p: Pt) => dot(sub(p, line.point), nrm);
  const shift = mul(nrm, amount);
  const mv = (p: Pt | null): Pt | null => (p ? rp(add(p, shift)) : null);
  const n = path.length;
  const out: Node[] = [];
  const inOverride = new Map<number, Pt>();
  for (let i = 0; i < n; i++) {
    const a: Node = { ...path[i]! };
    if (inOverride.has(i)) a.in = inOverride.get(i)!;
    const b = path[(i + 1) % n]!;
    const posA = s(a) > 1e-9;
    // crossing?
    const cubic: Cubic = [a, path[i]!.out ?? a, b.in ?? b, b];
    const isLine = !path[i]!.out && !b.in;
    let crossT: number | null = null;
    let prev = s(a);
    for (let k = 1; k <= 64; k++) {
      const t = k / 64;
      const q = isLine ? lerp(a, b, t) : bez(cubic, t);
      const v = s(q);
      if (prev > 1e-9 !== v > 1e-9) {
        let lo = (k - 1) / 64;
        let hi = t;
        for (let it = 0; it < 40; it++) {
          const mid = (lo + hi) / 2;
          const mq = isLine ? lerp(a, b, mid) : bez(cubic, mid);
          if (s(mq) > 1e-9 === prev > 1e-9) lo = mid;
          else hi = mid;
        }
        crossT = (lo + hi) / 2;
        break;
      }
      prev = v;
    }
    const place = (nd: Node, positive: boolean): Node =>
      positive
        ? { ...nd, x: r2(nd.x + shift.x), y: r2(nd.y + shift.y), in: mv(nd.in), out: mv(nd.out) }
        : nd;
    if (crossT === null) {
      out.push(place(a, posA));
      continue;
    }
    if (isLine) {
      const m = rp(lerp(a, b, crossT));
      out.push(place({ ...a, out: null }, posA));
      out.push(place(node(m, a.seg), posA));
      out.push(place(node(m, a.seg), !posA));
    } else {
      const [l, r] = split(cubic, crossT);
      out.push(place({ ...a, out: rp(l[1]) }, posA));
      out.push(place(node(rp(l[3]), a.seg, { in: rp(l[2]) }), posA));
      out.push(place(node(rp(r[0]), a.seg, { out: rp(r[1]) }), !posA));
      inOverride.set((i + 1) % n, rp(r[2]));
    }
  }
  // The closing segment's split updates node 0's in-handle.
  if (inOverride.has(0)) {
    const first = path[0]!;
    const h = inOverride.get(0)!;
    out[0] = { ...out[0]!, in: s(first) > 1e-9 ? rp(add(h, shift)) : h };
  }
  // Drop zero-length inserts (amount 0 or line through a node).
  const cleaned = out.filter((p, k) => k === 0 || dist(p, out[k - 1]!) > 0.01 || p.in || p.out);
  const movePt = (p: Pt) => (s(p) > 1e-9 ? rp(add(p, shift)) : p);
  const moved = withPath(piece, cleaned);
  return {
    ...moved,
    notches: piece.notches.map(movePt),
    grainline: piece.grainline
      ? { from: movePt(piece.grainline.from), to: movePt(piece.grainline.to) }
      : null,
    foldLine: piece.foldLine
      ? { from: movePt(piece.foldLine.from), to: movePt(piece.foldLine.to) }
      : null,
    ...(piece.markings
      ? { markings: piece.markings.map((m) => ({ ...m, points: m.points.map(movePt) })) }
      : {}),
  };
}

/** Sets a seam edge to an exact length by moving its end (or start) point along the seam direction. */
export function setEdgeLength(
  piece: Piece,
  name: string,
  target: number,
  end: 'end' | 'start' = 'end',
): Piece {
  const path = ensurePath(piece);
  const segs = edgeSegments(path, name);
  if (!segs.length || !(target > 0)) return piece;
  const n = path.length;
  const nodeIdx = end === 'end' ? (segs[segs.length - 1]! + 1) % n : segs[0]!;
  const segIdx = end === 'end' ? segs[segs.length - 1]! : segs[0]!;
  const c = segCubic(path, segIdx);
  const a = path[segIdx]!;
  const b = path[(segIdx + 1) % n]!;
  let dir = c ? norm(bezD(c, end === 'end' ? 1 : 0)) : norm(sub(b, a));
  if (end === 'start') dir = mul(dir, -1);
  const current = pathEdgeLength(path, name);
  const lenAfter = (d: number) =>
    pathEdgeLength(moveNodes(path, [nodeIdx], dir.x * d, dir.y * d), name);
  let lo = -current * 0.9;
  let hi = Math.max(current, target) * 2;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (lenAfter(mid) < target) lo = mid;
    else hi = mid;
  }
  const d = (lo + hi) / 2;
  return withPath(piece, moveNodes(path, [nodeIdx], dir.x * d, dir.y * d));
}

// ── whole-piece transforms ──────────────────────────────────────────────────

export function pieceBounds(piece: Pick<Piece, 'outline'>) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of piece.outline) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function mapPiece(piece: Piece, f: (p: Pt) => Pt, reverse: boolean, edited = true): Piece {
  const path = ensurePath(piece);
  let mapped = path.map((nd) => ({
    ...nd,
    ...rp(f(nd)),
    in: nd.in ? rp(f(nd.in)) : null,
    out: nd.out ? rp(f(nd.out)) : null,
  }));
  if (reverse) {
    const n = mapped.length;
    mapped = mapped.map((_, j) => {
      const o = mapped[(n - j) % n]!;
      const segFrom = mapped[(n - j - 1 + n) % n]!;
      return { ...o, in: o.out, out: o.in, seg: segFrom.seg };
    });
  }
  const next = withPath(piece, mapped, { edited });
  return {
    ...next,
    notches: piece.notches.map((p) => rp(f(p))),
    grainline: piece.grainline
      ? { from: rp(f(piece.grainline.from)), to: rp(f(piece.grainline.to)) }
      : null,
    foldLine: piece.foldLine
      ? { from: rp(f(piece.foldLine.from)), to: rp(f(piece.foldLine.to)) }
      : null,
    ...(piece.markings
      ? { markings: piece.markings.map((m) => ({ ...m, points: m.points.map((p) => rp(f(p))) })) }
      : {}),
  };
}

/** Rotates around the piece centre (degrees, clockwise on screen). Geometry is unchanged in size. */
export function rotatePiece(piece: Piece, degrees: number): Piece {
  const b = pieceBounds(piece);
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return mapPiece(
    piece,
    (p) => ({
      x: b.cx + (p.x - b.cx) * cos - (p.y - b.cy) * sin,
      y: b.cy + (p.x - b.cx) * sin + (p.y - b.cy) * cos,
    }),
    false,
    false,
  );
}

/** Mirrors across the vertical (horizontal flip) or horizontal axis through the centre. */
export function mirrorPiece(piece: Piece, axis: 'vertical' | 'horizontal'): Piece {
  const b = pieceBounds(piece);
  return mapPiece(
    piece,
    (p) => (axis === 'vertical' ? { x: 2 * b.cx - p.x, y: p.y } : { x: p.x, y: 2 * b.cy - p.y }),
    true,
    false,
  );
}

/** Scales from the top-left of the bounds (resize to a width and/or height). */
export function scalePiece(piece: Piece, sx: number, sy: number): Piece {
  const b = pieceBounds(piece);
  return mapPiece(
    piece,
    (p) => ({ x: b.x + (p.x - b.x) * sx, y: b.y + (p.y - b.y) * sy }),
    sx * sy < 0,
  );
}
