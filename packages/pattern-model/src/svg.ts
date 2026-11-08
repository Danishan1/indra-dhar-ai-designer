import { outlineBounds, type PatternPiece, type PatternPoint } from '@ai-designer/garment-model';

import { cutOutline } from './cut.js';

/** Pure SVG helpers for pattern pieces (editor pattern view, tech pack). Units: mm. */

const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function pathD(points: readonly PatternPoint[], closed = true): string {
  if (!points.length) return '';
  return `${points.map((p, i) => `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`).join(' ')}${closed ? ' Z' : ''}`;
}

function signedArea(points: readonly PatternPoint[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Outline offset outwards by `d` mm (miter joins, limited) — the cutting line. */
export function offsetOutline(points: readonly PatternPoint[], d: number): PatternPoint[] {
  if (points.length < 3 || d <= 0) return [...points];
  const sign = signedArea(points) > 0 ? 1 : -1;
  const n = points.length;
  const out: PatternPoint[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const n1 = normal(prev, cur, sign);
    const n2 = normal(cur, next, sign);
    let mx = n1.x + n2.x;
    let my = n1.y + n2.y;
    const len = Math.hypot(mx, my) || 1;
    mx /= len;
    my /= len;
    const cos = mx * n1.x + my * n1.y;
    const scale = Math.min(d / Math.max(cos, 0.35), d * 2.5);
    out.push({ x: cur.x + mx * scale, y: cur.y + my * scale });
  }
  return out;
}

function normal(a: PatternPoint, b: PatternPoint, sign: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: (sign * dy) / len, y: (-sign * dx) / len };
}

export interface PlacedPiece {
  piece: PatternPiece;
  /** Translation applied to the piece (mm). */
  dx: number;
  dy: number;
  bounds: { x: number; y: number; width: number; height: number };
}

/** Shelf layout of pieces (cutting lines included), row width `maxWidth` mm. */
export function layoutPieces(
  pieces: readonly PatternPiece[],
  opts: { maxWidth?: number; gap?: number } = {},
): { placed: PlacedPiece[]; width: number; height: number } {
  const gap = opts.gap ?? 60;
  const maxWidth = opts.maxWidth ?? 1600;
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 0;
  const placed: PlacedPiece[] = [];
  for (const piece of pieces) {
    const cut = cutOutline(piece);
    const b = outlineBounds(cut);
    if (x > 0 && x + b.width > maxWidth) {
      x = 0;
      y += rowH + gap + 40;
      rowH = 0;
    }
    placed.push({
      piece,
      dx: x - b.x,
      dy: y - b.y + 30,
      bounds: { x, y: y + 30, width: b.width, height: b.height },
    });
    x += b.width + gap;
    rowH = Math.max(rowH, b.height);
    width = Math.max(width, x - gap);
  }
  return { placed, width: Math.max(width, 1), height: Math.max(y + rowH + 40, 1) };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** One piece as SVG markup (seam line, cutting line, grainline, fold, notches, label). */
export function pieceMarkup(piece: PatternPiece, opts: { highlight?: boolean } = {}): string {
  const cut = cutOutline(piece);
  const b = outlineBounds(piece.outline);
  const parts = [
    `<path d="${pathD(cut)}" fill="${opts.highlight ? '#fef3c7' : '#ffffff'}" stroke="#111827" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`,
    `<path d="${pathD(piece.outline)}" fill="none" stroke="#6b7280" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`,
  ];
  if (piece.grainline) {
    const g = piece.grainline;
    parts.push(
      `<line x1="${f(g.from.x)}" y1="${f(g.from.y)}" x2="${f(g.to.x)}" y2="${f(g.to.y)}" stroke="#111827" stroke-width="1.2" marker-start="url(#pm-arrow)" marker-end="url(#pm-arrow)" vector-effect="non-scaling-stroke"/>`,
    );
  }
  if (piece.foldLine) {
    const l = piece.foldLine;
    parts.push(
      `<line x1="${f(l.from.x)}" y1="${f(l.from.y)}" x2="${f(l.to.x)}" y2="${f(l.to.y)}" stroke="#2563eb" stroke-width="1.6" stroke-dasharray="14 4 2 4" vector-effect="non-scaling-stroke"/>`,
    );
  }
  for (const n of piece.notches)
    parts.push(`<circle cx="${f(n.x)}" cy="${f(n.y)}" r="4" fill="#111827"/>`);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const size = Math.max(10, Math.min(28, b.width / 9));
  parts.push(
    `<text x="${f(cx)}" y="${f(cy)}" font-size="${f(size)}" text-anchor="middle" font-family="sans-serif" fill="#111827">${esc(piece.name)}</text>`,
    `<text x="${f(cx)}" y="${f(cy + size * 1.3)}" font-size="${f(size * 0.7)}" text-anchor="middle" font-family="sans-serif" fill="#4b5563">Cut ${piece.cutQuantity}${piece.foldLine ? ' on fold' : ''}${piece.mirrored ? ' (pair)' : ''} · ${Math.round(b.width)}×${Math.round(b.height)} mm</text>`,
  );
  return parts.join('');
}

export const PATTERN_DEFS =
  '<defs><marker id="pm-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#111827"/></marker></defs>';

/** A full pattern sheet as a standalone SVG (mm units, white background). */
export function patternSheetSvg(
  pieces: readonly PatternPiece[],
  opts: { maxWidth?: number; highlight?: ReadonlySet<string>; title?: string } = {},
): string {
  const { placed, width, height } = layoutPieces(
    pieces,
    opts.maxWidth ? { maxWidth: opts.maxWidth } : {},
  );
  const pad = 40;
  const W = width + pad * 2;
  const H = height + pad * 2 + (opts.title ? 40 : 0);
  const top = opts.title ? 40 : 0;
  const body = placed
    .map(
      (p) =>
        `<g transform="translate(${f(p.dx + pad)} ${f(p.dy + pad + top)})" data-piece-id="${p.piece.pieceId}">${pieceMarkup(p.piece, { highlight: opts.highlight?.has(p.piece.componentId) ?? false })}</g>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}">${PATTERN_DEFS}<rect width="100%" height="100%" fill="#ffffff"/>${opts.title ? `<text x="${pad}" y="40" font-size="24" font-family="sans-serif" fill="#111827">${esc(opts.title)}</text>` : ''}${body}</svg>`;
}
