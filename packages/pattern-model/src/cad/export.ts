import type { PatternPiece } from '@ai-designer/garment-model';

import { offsetOutline } from '../svg.js';

import { pieceBounds } from './path.js';

/**
 * True-size output (ADR-059): DXF (R12, millimetres — readable by pattern CAD software and cutting
 * plotters) and a printable 1:1 tiled sheet (A4 / Letter, with a 10 cm test square).
 */

type Piece = Pick<
  PatternPiece,
  | 'name'
  | 'outline'
  | 'seamAllowanceMm'
  | 'grainline'
  | 'foldLine'
  | 'notches'
  | 'cutQuantity'
  | 'mirrored'
> &
  Partial<Pick<PatternPiece, 'markings'>>;

interface Placed {
  piece: Piece;
  dx: number;
  dy: number;
  w: number;
  h: number;
}

/** Shelf layout including seam allowance; offsets put every piece in positive space. */
export function layoutForOutput(
  pieces: readonly Piece[],
  width = 1400,
  gap = 30,
): { placed: Placed[]; width: number; height: number } {
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let row = 0;
  let maxX = 0;
  for (const p of pieces) {
    const cut = offsetOutline(p.outline, p.seamAllowanceMm ?? 0);
    const b = pieceBounds({ outline: cut });
    if (x > 0 && x + b.width > width) {
      x = 0;
      y += row + gap;
      row = 0;
    }
    placed.push({ piece: p, dx: x - b.x, dy: y - b.y, w: b.width, h: b.height });
    x += b.width + gap;
    row = Math.max(row, b.height);
    maxX = Math.max(maxX, x);
  }
  return { placed, width: Math.max(1, maxX - gap), height: Math.max(1, y + row) };
}

const n4 = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** DXF R12 (ASCII). Y is flipped (DXF y up). Layers: CUT, SEAM, GRAIN, FOLD, NOTCH, MARK, TEXT. */
export function piecesToDxf(pieces: readonly Piece[]): string {
  const { placed, height } = layoutForOutput(pieces);
  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), String(value));
  const Y = (y: number) => height - y;
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 4);
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, 7);
  for (const [name, color] of [
    ['CUT', 7],
    ['SEAM', 5],
    ['GRAIN', 3],
    ['FOLD', 6],
    ['NOTCH', 1],
    ['MARK', 4],
    ['TEXT', 7],
  ] as const) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, color);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION');
  g(2, 'ENTITIES');
  const poly = (
    layer: string,
    pts: readonly { x: number; y: number }[],
    closed: boolean,
    dx: number,
    dy: number,
  ) => {
    g(0, 'POLYLINE');
    g(8, layer);
    g(66, 1);
    g(70, closed ? 1 : 0);
    for (const p of pts) {
      g(0, 'VERTEX');
      g(8, layer);
      g(10, n4(p.x + dx));
      g(20, n4(Y(p.y + dy)));
    }
    g(0, 'SEQEND');
    g(8, layer);
  };
  const line = (
    layer: string,
    a: { x: number; y: number },
    b: { x: number; y: number },
    dx: number,
    dy: number,
  ) => {
    g(0, 'LINE');
    g(8, layer);
    g(10, n4(a.x + dx));
    g(20, n4(Y(a.y + dy)));
    g(11, n4(b.x + dx));
    g(21, n4(Y(b.y + dy)));
  };
  for (const { piece: p, dx, dy } of placed) {
    poly('SEAM', p.outline, true, dx, dy);
    if ((p.seamAllowanceMm ?? 0) > 0)
      poly('CUT', offsetOutline(p.outline, p.seamAllowanceMm ?? 0), true, dx, dy);
    if (p.grainline) line('GRAIN', p.grainline.from, p.grainline.to, dx, dy);
    if (p.foldLine) line('FOLD', p.foldLine.from, p.foldLine.to, dx, dy);
    for (const nt of p.notches)
      line('NOTCH', { x: nt.x, y: nt.y - 3 }, { x: nt.x, y: nt.y + 3 }, dx, dy);
    for (const m of p.markings ?? [])
      if (m.points.length > 1) poly('MARK', m.points, false, dx, dy);
    const b = pieceBounds(p);
    g(0, 'TEXT');
    g(8, 'TEXT');
    g(10, n4(b.cx + dx - 40));
    g(20, n4(Y(b.cy + dy)));
    g(40, 8);
    g(
      1,
      `${p.name} - cut ${p.cutQuantity}${p.foldLine ? ' on fold' : ''}`.replace(
        /[^\x20-\x7e]/g,
        '-',
      ),
    );
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PAPER = { a4: { w: 210, h: 297 }, letter: { w: 215.9, h: 279.4 } } as const;

/**
 * A printable HTML document at 1:1: the pattern laid out and cut into pages (CSS millimetres,
 * print at 100 % / "actual size"). Page 1 carries a 10 cm test square; every page has its
 * row/column and overlap marks for taping.
 */
export function tiledPrintHtml(
  pieces: readonly Piece[],
  opts: { paper?: 'a4' | 'letter'; title?: string } = {},
): string {
  const paper = PAPER[opts.paper ?? 'a4'];
  const margin = 10;
  const cw = paper.w - margin * 2;
  const ch = paper.h - margin * 2;
  const { placed, width, height } = layoutForOutput(pieces, 1000, 25);
  const cols = Math.max(1, Math.ceil(width / cw));
  const rows = Math.max(1, Math.ceil(height / ch));
  const shapes = placed
    .map(({ piece: p, dx, dy }) => {
      const pts = (a: readonly { x: number; y: number }[]) =>
        a.map((q) => `${(q.x + dx).toFixed(2)},${(q.y + dy).toFixed(2)}`).join(' ');
      const b = pieceBounds(p);
      const sa = p.seamAllowanceMm ?? 0;
      return [
        sa > 0
          ? `<polygon points="${pts(offsetOutline(p.outline, sa))}" fill="none" stroke="#000" stroke-width="0.4"/>`
          : '',
        `<polygon points="${pts(p.outline)}" fill="none" stroke="#000" stroke-width="0.25" stroke-dasharray="2 1.2"/>`,
        p.grainline
          ? `<line x1="${p.grainline.from.x + dx}" y1="${p.grainline.from.y + dy}" x2="${p.grainline.to.x + dx}" y2="${p.grainline.to.y + dy}" stroke="#000" stroke-width="0.35"/>`
          : '',
        p.foldLine
          ? `<line x1="${p.foldLine.from.x + dx}" y1="${p.foldLine.from.y + dy}" x2="${p.foldLine.to.x + dx}" y2="${p.foldLine.to.y + dy}" stroke="#000" stroke-width="0.5" stroke-dasharray="6 2"/>`
          : '',
        ...p.notches.map(
          (n) =>
            `<line x1="${n.x + dx}" y1="${n.y + dy - 3}" x2="${n.x + dx}" y2="${n.y + dy + 3}" stroke="#000" stroke-width="0.5"/>`,
        ),
        ...(p.markings ?? [])
          .filter((m) => m.points.length > 1)
          .map(
            (m) =>
              `<polyline points="${pts(m.points)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
          ),
        `<text x="${b.cx + dx}" y="${b.cy + dy}" font-size="6" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(p.name)}</text>`,
        `<text x="${b.cx + dx}" y="${b.cy + dy + 8}" font-size="4" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">Cut ${p.cutQuantity}${p.foldLine ? ' on fold' : ''} · SA ${sa} mm</text>`,
      ].join('');
    })
    .join('');
  const pages: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * ch;
      const test =
        r === 0 && c === 0
          ? `<g><rect x="${x + 5}" y="${y + 5}" width="100" height="100" fill="none" stroke="#000" stroke-width="0.5"/><text x="${x + 55}" y="${y + 58}" font-size="5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">10 cm test square</text></g>`
          : '';
      pages.push(
        `<section class="page"><svg xmlns="http://www.w3.org/2000/svg" width="${cw}mm" height="${ch}mm" viewBox="${x} ${y} ${cw} ${ch}">${test}${shapes}<rect x="${x}" y="${y}" width="${cw}" height="${ch}" fill="none" stroke="#999" stroke-width="0.2"/></svg><div class="label">${esc(opts.title ?? 'Pattern')} · row ${r + 1} col ${c + 1} of ${rows}×${cols} · print at 100 % (actual size)</div></section>`,
      );
    }
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title ?? 'Pattern')} — 1:1</title><style>@page{size:${paper.w}mm ${paper.h}mm;margin:${margin}mm}body{margin:0;font-family:Helvetica,Arial,sans-serif}.page{width:${cw}mm;height:${ch}mm;position:relative;page-break-after:always;overflow:hidden}.page svg{display:block}.label{position:absolute;bottom:1mm;right:2mm;font-size:8pt;color:#555}</style></head><body>${pages.join('')}</body></html>`;
}
