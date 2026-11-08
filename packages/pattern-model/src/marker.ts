import type { PatternPiece, PatternPoint } from '@ai-designer/garment-model';

import { cutOutline } from './cut.js';

/**
 * Cutting marker (ADR-060): every piece the garment needs — cut quantity, mirrored pairs, fold
 * pieces opened out — packed on a fabric of a given width with the grain along the length.
 * Pieces are drafted with the grain vertical (y), so on the marker the piece's y runs along the
 * fabric length (marker x) and its x across the width (marker y). Packing is a deterministic
 * skyline (bottom-left) fill on the cut-line bounding boxes, allowing a 180° turn — a planning
 * estimate for yardage and costing, not a production marker (no nesting, no one-way nap rules).
 */

type Pt = PatternPoint;

export interface MarkerPlacement {
  pieceId: string;
  name: string;
  /** 1-based copy number of this piece. */
  copy: number;
  /** Cut-line polygons in marker coordinates (mm); two for a fold piece opened out. */
  polygons: Pt[][];
  /** Seam lines (dashed) in marker coordinates. */
  seams: Pt[][];
  box: { x: number; y: number; w: number; h: number };
  mirrored: boolean;
  rotated: boolean;
}

export interface Marker {
  fabricRole: string;
  fabricWidthMm: number;
  /** Used length along the fabric (mm). */
  lengthMm: number;
  /** Piece area ÷ used fabric area (0–1). */
  efficiency: number;
  pieceCount: number;
  placements: MarkerPlacement[];
}

type MarkerPiece = Pick<
  PatternPiece,
  'pieceId' | 'name' | 'outline' | 'seamAllowanceMm' | 'foldLine' | 'cutQuantity' | 'mirrored'
> &
  Partial<Pick<PatternPiece, 'edges' | 'allowances' | 'fabricRole'>>;

const reflect = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const fx = a.x + t * dx;
  const fy = a.y + t * dy;
  return { x: 2 * fx - p.x, y: 2 * fy - p.y };
};

function area(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

interface Shape {
  piece: MarkerPiece;
  copy: number;
  mirrored: boolean;
  cut: Pt[][];
  seam: Pt[][];
  area: number;
}

/** The pieces to cut for one garment, as shapes in piece coordinates. */
function shapesFor(pieces: readonly MarkerPiece[]): Shape[] {
  const out: Shape[] = [];
  for (const piece of pieces) {
    const cut = cutOutline(piece);
    const seam = [...piece.outline];
    const f = piece.foldLine;
    const cutPolys = f ? [cut, cut.map((p) => reflect(p, f.from, f.to))] : [cut];
    const seamPolys = f ? [seam, seam.map((p) => reflect(p, f.from, f.to))] : [seam];
    const a = cutPolys.reduce((s, p) => s + area(p), 0);
    for (let c = 1; c <= piece.cutQuantity; c++) {
      const mirror = piece.mirrored && c % 2 === 0;
      const flip = (pts: Pt[]) => (mirror ? pts.map((p) => ({ x: -p.x, y: p.y })) : pts);
      out.push({
        piece,
        copy: c,
        mirrored: mirror,
        cut: cutPolys.map(flip),
        seam: seamPolys.map(flip),
        area: a,
      });
    }
  }
  return out;
}

function boundsOf(polys: readonly Pt[][]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys)
    for (const p of poly) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0, y0, x1, y1 };
}

/** Packs one fabric role's pieces on a fabric `fabricWidthMm` wide (default 1500). */
export function buildMarker(
  pieces: readonly MarkerPiece[],
  opts: { fabricWidthMm?: number; gapMm?: number; fabricRole?: string } = {},
): Marker {
  const W = opts.fabricWidthMm ?? 1500;
  const gap = opts.gapMm ?? 6;
  const shapes = shapesFor(pieces)
    .map((s) => {
      const b = boundsOf(s.cut);
      // Marker coords: along = piece y, across = piece x.
      return { s, along: b.y1 - b.y0, across: b.x1 - b.x0, b };
    })
    .sort(
      (a, b) =>
        b.along * b.across - a.along * a.across || a.s.piece.name.localeCompare(b.s.piece.name),
    );

  // Skyline over the width: segments [y, y+w) with their used length x.
  let sky: { y: number; w: number; x: number }[] = [{ y: 0, w: W, x: 0 }];
  const placements: MarkerPlacement[] = [];
  let totalArea = 0;
  for (const { s, along, across, b } of shapes) {
    const need = Math.min(across + gap, W);
    let best: { i: number; x: number; y: number } | null = null;
    for (let i = 0; i < sky.length; i++) {
      let w = 0;
      let x = 0;
      let j = i;
      while (j < sky.length && w < need) {
        x = Math.max(x, sky[j]!.x);
        w += sky[j]!.w;
        j++;
      }
      if (w + 1e-6 < need) break;
      if (!best || x < best.x - 1e-6) best = { i, x, y: sky[i]!.y };
    }
    const at = best ?? { i: 0, x: Math.max(...sky.map((k) => k.x)), y: 0 };
    // Rotate 180° when the piece is placed on the far half (keeps straight edges on the selvedge).
    const rotated = at.y + across / 2 > W / 2 && across < W * 0.9;
    const map = (p: Pt): Pt => {
      const u = p.y - b.y0; // along
      const v = p.x - b.x0; // across
      return rotated
        ? {
            x: Math.round((at.x + along - u) * 10) / 10,
            y: Math.round((at.y + across - v) * 10) / 10,
          }
        : { x: Math.round((at.x + u) * 10) / 10, y: Math.round((at.y + v) * 10) / 10 };
    };
    placements.push({
      pieceId: s.piece.pieceId,
      name: s.piece.name,
      copy: s.copy,
      polygons: s.cut.map((poly) => poly.map(map)),
      seams: s.seam.map((poly) => poly.map(map)),
      box: { x: at.x, y: at.y, w: along, h: across },
      mirrored: s.mirrored,
      rotated,
    });
    totalArea += s.area;
    // Update the skyline.
    const top = at.x + along + gap;
    const y0 = at.y;
    const y1 = Math.min(W, at.y + need);
    const next: typeof sky = [];
    for (const seg of sky) {
      const a = seg.y;
      const z = seg.y + seg.w;
      if (z <= y0 || a >= y1) {
        next.push(seg);
        continue;
      }
      if (a < y0) next.push({ y: a, w: y0 - a, x: seg.x });
      if (z > y1) next.push({ y: y1, w: z - y1, x: seg.x });
    }
    next.push({ y: y0, w: y1 - y0, x: top });
    next.sort((p, q) => p.y - q.y);
    // Merge neighbours at the same length.
    sky = next.reduce<typeof sky>((acc, seg) => {
      const last = acc[acc.length - 1];
      if (last && Math.abs(last.x - seg.x) < 1e-6) last.w += seg.w;
      else acc.push({ ...seg });
      return acc;
    }, []);
  }
  const length = placements.length ? Math.max(...placements.map((p) => p.box.x + p.box.w)) : 0;
  return {
    fabricRole: opts.fabricRole ?? 'main',
    fabricWidthMm: W,
    lengthMm: Math.round(length),
    efficiency: length > 0 ? Math.round((totalArea / (length * W)) * 1000) / 1000 : 0,
    pieceCount: placements.length,
    placements,
  };
}

/** One marker per fabric role (main first). */
export function buildMarkers(
  pieces: readonly MarkerPiece[],
  opts: { fabricWidthMm?: number } = {},
): Marker[] {
  const roles = new Map<string, MarkerPiece[]>();
  for (const p of pieces) {
    const role = p.fabricRole ?? 'main';
    roles.set(role, [...(roles.get(role) ?? []), p]);
  }
  const order = [...roles.keys()].sort((a, b) =>
    a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b),
  );
  return order.map((role) =>
    buildMarker(roles.get(role)!, {
      fabricRole: role,
      fabricWidthMm: role === 'interfacing' ? 900 : opts.fabricWidthMm,
    }),
  );
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Marker as SVG (mm units): fabric, selvedges, pieces with names and a 10 cm scale. */
export function markerSvg(m: Marker): string {
  const L = Math.max(m.lengthMm, 100);
  const W = m.fabricWidthMm;
  const pad = 40;
  const poly = (pts: readonly Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
  const fs = Math.max(18, Math.min(34, W / 40));
  const parts: string[] = [
    `<rect x="0" y="0" width="${L}" height="${W}" fill="#fafaf9" stroke="#78716c" stroke-width="2"/>`,
    `<text x="4" y="-10" font-size="${fs}" font-family="Helvetica, Arial, sans-serif" fill="#57534e">Selvedge · ${W / 10} cm wide · grain ⟷</text>`,
  ];
  for (const p of m.placements) {
    for (const poly2 of p.polygons)
      parts.push(
        `<polygon points="${poly(poly2)}" fill="${p.mirrored ? '#dbeafe' : '#e0f2fe'}" stroke="#0f172a" stroke-width="1.6"/>`,
      );
    for (const s of p.seams)
      parts.push(
        `<polygon points="${poly(s)}" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="6 4"/>`,
      );
    const cx = p.box.x + p.box.w / 2;
    const cy = p.box.y + p.box.h / 2;
    const label = `${esc(p.name)}${p.copy > 1 ? ` (${p.copy})` : ''}`;
    // Narrow pieces get the label along their length.
    const turn = p.box.w < Math.min(p.box.h, label.length * fs * 0.6);
    const size = Math.min(fs, (Math.max(p.box.w, p.box.h) * 0.9) / Math.max(4, label.length * 0.6));
    parts.push(
      `<text x="${cx}" y="${cy}" font-size="${Math.round(size)}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" fill="#0f172a"${turn ? ` transform="rotate(-90 ${cx} ${cy})"` : ''}>${label}</text>`,
    );
  }
  parts.push(
    `<g transform="translate(0 ${W + 30})"><rect width="100" height="8" fill="#111"/><text x="110" y="8" font-size="${fs}" font-family="Helvetica, Arial, sans-serif">10 cm</text><text x="${L}" y="8" font-size="${fs}" text-anchor="end" font-family="Helvetica, Arial, sans-serif">${(m.lengthMm / 1000).toFixed(2)} m · ${Math.round(m.efficiency * 100)}% used</text></g>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad - 20} ${L + pad * 2} ${W + pad * 2 + 60}" data-width-mm="${L}" data-height-mm="${W}">${parts.join('')}</svg>`;
}
