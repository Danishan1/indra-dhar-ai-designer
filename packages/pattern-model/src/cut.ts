import type { PatternPiece, PatternPoint } from '@ai-designer/garment-model';

/**
 * Cutting line of a piece with a seam allowance per edge (ADR-060): each outline segment is
 * offset by its own allowance — `allowances[edgeName]`, else `seamAllowanceMm` — and segments
 * lying on the fold line get none (the fold is cut on the fabric fold, never with allowance).
 * Neighbouring offset lines meet at their intersection (mitre, limited); where it would spike or
 * the allowance steps between collinear segments, the corner is squared off with two points.
 */

type Pt = PatternPoint;
type CutPiece = {
  outline: readonly Pt[];
  seamAllowanceMm: number | null;
  foldLine: PatternPiece['foldLine'];
  edges?: PatternPiece['edges'];
  allowances?: Record<string, number> | undefined;
};

function signedArea(points: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Distance of `p` from the segment a–b (mm). */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Name of the edge each outline segment i → i+1 belongs to (null when not named). */
export function segmentEdgeNames(piece: {
  outline: readonly Pt[];
  edges?: PatternPiece['edges'];
}): (string | null)[] {
  const n = piece.outline.length;
  const names: (string | null)[] = Array.from({ length: n }, () => null);
  for (const e of piece.edges ?? []) {
    if (e.from >= n || e.to >= n) continue;
    let i = e.from;
    for (let guard = 0; guard < n && i !== e.to; guard++) {
      names[i] = e.name;
      i = (i + 1) % n;
    }
  }
  return names;
}

/** Whether outline segment i → i+1 lies on the piece's fold line. */
export function segmentOnFold(
  piece: { outline: readonly Pt[]; foldLine: PatternPiece['foldLine'] },
  i: number,
): boolean {
  const f = piece.foldLine;
  if (!f) return false;
  const a = piece.outline[i]!;
  const b = piece.outline[(i + 1) % piece.outline.length]!;
  const len = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y);
  // The fold line may be drawn slightly inside the cut ends: test against the infinite line too.
  const ext = Math.max(len, 1);
  const ux = (f.to.x - f.from.x) / ext;
  const uy = (f.to.y - f.from.y) / ext;
  const off = (p: Pt) => Math.abs((p.x - f.from.x) * uy - (p.y - f.from.y) * ux);
  return (
    (off(a) < 0.6 && off(b) < 0.6) ||
    (distToSegment(a, f.from, f.to) < 0.6 && distToSegment(b, f.from, f.to) < 0.6)
  );
}

/** Allowance (mm) of every outline segment. */
export function segmentAllowances(piece: CutPiece): number[] {
  const base = piece.seamAllowanceMm ?? 0;
  const names = segmentEdgeNames(piece);
  return piece.outline.map((_, i) => {
    if (segmentOnFold(piece, i)) return 0;
    const name = names[i];
    const v = name ? piece.allowances?.[name] : undefined;
    return v ?? base;
  });
}

/** Allowance of a named edge (fold edges report 0). */
export function edgeAllowance(piece: CutPiece, name: string): number {
  const names = segmentEdgeNames(piece);
  const allow = segmentAllowances(piece);
  const idx = names.findIndex((x) => x === name);
  return idx >= 0 ? allow[idx]! : (piece.allowances?.[name] ?? piece.seamAllowanceMm ?? 0);
}

/** Whether a named edge lies on the fold. */
export function edgeOnFold(piece: CutPiece, name: string): boolean {
  const names = segmentEdgeNames(piece);
  const idx = names.findIndex((x) => x === name);
  return idx >= 0 && segmentOnFold(piece, idx);
}

/** The cutting line (closed polygon, mm). */
export function cutOutline(piece: CutPiece): Pt[] {
  const pts = dedupeClosed(piece.outline);
  if (pts.length < 3) return [...piece.outline];
  // Allowances are per original segment; map onto the de-duplicated points.
  const source =
    pts === piece.outline ? piece : { ...piece, outline: pts, edges: remapEdges(piece, pts) };
  const d = segmentAllowances(source);
  if (d.every((x) => x <= 0)) return [...pts];
  const sign = signedArea(pts) > 0 ? 1 : -1;
  const n = pts.length;
  const normals = pts.map((a, i) => {
    const b = pts[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (sign * (b.y - a.y)) / len, y: (-sign * (b.x - a.x)) / len };
  });
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const ip = (i - 1 + n) % n;
    const cur = pts[i]!;
    const n1 = normals[ip]!;
    const n2 = normals[i]!;
    const d1 = d[ip]!;
    const d2 = d[i]!;
    const p1 = { x: cur.x + n1.x * d1, y: cur.y + n1.y * d1 };
    const p2 = { x: cur.x + n2.x * d2, y: cur.y + n2.y * d2 };
    // Line 1 through p1 along the previous segment, line 2 through p2 along the next.
    const t1 = { x: -n1.y, y: n1.x };
    const t2 = { x: -n2.y, y: n2.x };
    const den = t1.x * t2.y - t1.y * t2.x;
    if (Math.abs(den) < 1e-3) {
      // Collinear: same allowance → one point; a step → square it off.
      if (Math.abs(d1 - d2) < 0.05) out.push(p2);
      else out.push(p1, p2);
      continue;
    }
    const s = ((p2.x - p1.x) * t2.y - (p2.y - p1.y) * t2.x) / den;
    const x = { x: p1.x + t1.x * s, y: p1.y + t1.y * s };
    const limit = Math.max(d1, d2) * 2.5 + 0.5;
    if (Math.hypot(x.x - cur.x, x.y - cur.y) > limit) out.push(p1, p2);
    else out.push(x);
  }
  return out.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
}

function dedupeClosed(points: readonly Pt[]): readonly Pt[] {
  let dup = false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) dup = true;
  }
  if (!dup) return points;
  return points.filter((a, i) => {
    const b = points[(i + 1) % points.length]!;
    return Math.hypot(a.x - b.x, a.y - b.y) >= 1e-6;
  });
}

/** Re-indexes edges onto a de-duplicated outline (by nearest kept point). */
function remapEdges(piece: CutPiece, pts: readonly Pt[]): CutPiece['edges'] {
  if (!piece.edges) return piece.edges;
  const idx = (k: number) => {
    const p = piece.outline[k];
    if (!p) return 0;
    let best = 0;
    let bd = Infinity;
    pts.forEach((q, j) => {
      const dd = Math.hypot(p.x - q.x, p.y - q.y);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    });
    return best;
  };
  return piece.edges.map((e) => ({ ...e, from: idx(e.from), to: idx(e.to) }));
}

/** Bounds of the cutting line. */
export function cutBounds(piece: CutPiece): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const c = cutOutline(piece);
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Initial editor layout (canvas offsets, mm): pieces in rows by garment part, in draft order,
 * spaced for the allowance, labels and dimension callouts. Pieces with a position keep it; new
 * pieces go below everything already placed.
 */
export function layoutCanvas(
  pieces: readonly (CutPiece & Pick<PatternPiece, 'pieceId' | 'componentId' | 'canvas'>)[],
  opts: { maxWidth?: number; gap?: number } = {},
): Map<string, { x: number; y: number }> {
  const gap = opts.gap ?? 140;
  const maxWidth = opts.maxWidth ?? 2600;
  const out = new Map<string, { x: number; y: number }>();
  let top = 0;
  for (const p of pieces) {
    if (!p.canvas) continue;
    out.set(p.pieceId, p.canvas);
    const b = cutBounds(p);
    top = Math.max(top, p.canvas.y + b.y + b.height + gap + 60);
  }
  const rows: (typeof pieces)[number][][] = [];
  for (const p of pieces) {
    if (p.canvas) continue;
    const last = rows[rows.length - 1];
    if (last && last[0]!.componentId === p.componentId) last.push(p);
    else rows.push([p]);
  }
  let x = 0;
  let y = top;
  let rowH = 0;
  for (const row of rows) {
    // Small parts (collars, cuffs, bands) share a row; big parts start their own.
    const big = row.some((p) => cutBounds(p).height > 300);
    if (big && x > 0) {
      x = 0;
      y += rowH + gap + 60;
      rowH = 0;
    }
    for (const p of row) {
      const b = cutBounds(p);
      if (x > 0 && x + b.width > maxWidth) {
        x = 0;
        y += rowH + gap + 60;
        rowH = 0;
      }
      out.set(p.pieceId, { x: Math.round(x - b.x), y: Math.round(y - b.y) });
      x += b.width + gap;
      rowH = Math.max(rowH, b.height);
    }
  }
  return out;
}

/** Orientation of a closed outline: 1 counter-clockwise (y down: clockwise on screen), −1 otherwise. */
export function outlineOrientation(points: readonly Pt[]): number {
  return signedArea(points) > 0 ? 1 : -1;
}

/** Outward unit normal of segment a→b for an outline of the given orientation. */
export function outwardNormal(a: Pt, b: Pt, sign: number): Pt {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (sign * (b.y - a.y)) / len, y: (-sign * (b.x - a.x)) / len };
}

/**
 * Where to label an edge: the point halfway along it, the direction there (degrees), the outward
 * normal and the outline segment it lies on (for its allowance / fold state).
 */
export function edgeMidFrame(
  outline: readonly Pt[],
  e: { from: number; to: number },
  sign = outlineOrientation(outline),
): { p: Pt; angle: number; normal: Pt; segment: number } {
  const n = outline.length;
  const idx: number[] = [e.from];
  for (let i = e.from, guard = 0; i !== e.to && guard < n; guard++) {
    i = (i + 1) % n;
    idx.push(i);
  }
  let total = 0;
  for (let k = 1; k < idx.length; k++) {
    const a = outline[idx[k - 1]!]!;
    const b = outline[idx[k]!]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let acc = 0;
  for (let k = 1; k < idx.length; k++) {
    const a = outline[idx[k - 1]!]!;
    const b = outline[idx[k]!]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + l >= total / 2 || k === idx.length - 1) {
      const t = l ? (total / 2 - acc) / l : 0;
      return {
        p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        normal: outwardNormal(a, b, sign),
        segment: idx[k - 1]!,
      };
    }
    acc += l;
  }
  return { p: outline[e.from]!, angle: 0, normal: { x: 0, y: -1 }, segment: e.from };
}
