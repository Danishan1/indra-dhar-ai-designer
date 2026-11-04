import {
  type ComponentShape,
  type DesignComponent,
  type GarmentDesignState,
  outlineBounds,
  type PatternMarking,
  type PatternPiece,
  shapePathD,
} from '@ai-designer/garment-model';
import { offsetOutline, pieceDimensions } from '@ai-designer/pattern-model';

/**
 * Vector drawings for the tech pack (ADR-057), drawn from the final editable geometry — the source
 * of truth — so the document always matches what the user finalized in the editor.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const f = (v: number) => (Math.round(v * 100) / 100).toString();

function fillOf(c: DesignComponent, s: ComponentShape): string {
  if (s.style.fill) return s.style.fill;
  const v = c.properties['appearance.color']?.value;
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#f3f4f6';
}

function shapeMarkup(c: DesignComponent, s: ComponentShape, stroke = 1.6): string {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const details = s.details
    .map((d) =>
      d.kind === 'button'
        ? d.points
            .map(
              (p) =>
                `<circle cx="${f(s.x + p.x * s.width)}" cy="${f(s.y + p.y * s.height)}" r="4" fill="#fff" stroke="#374151" stroke-width="1"/>`,
            )
            .join('')
        : `<polyline points="${d.points.map((p) => `${f(s.x + p.x * s.width)},${f(s.y + p.y * s.height)}`).join(' ')}" fill="none" stroke="#374151" stroke-width="1"${d.kind === 'stitch' ? ' stroke-dasharray="4 3"' : d.kind === 'fold' ? ' stroke-dasharray="10 4"' : ''}/>`,
    )
    .join('');
  return `<g transform="rotate(${f(s.rotation)} ${f(cx)} ${f(cy)})"><path d="${shapePathD(s)}" fill="${fillOf(c, s)}" fill-opacity="${f(s.style.opacity)}" stroke="${s.style.stroke}" stroke-width="${stroke}" stroke-linejoin="round"><title>${esc(c.displayName)}</title></path>${details}</g>`;
}

function boundsOf(shapes: readonly ComponentShape[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of shapes) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x + s.width);
    y1 = Math.max(y1, s.y + s.height);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Front or back of the reconstructed garment (null when no shape exists for that view). */
export function reconstructionSvg(
  state: GarmentDesignState,
  view: 'front' | 'back',
): string | null {
  const placed = state.components
    .filter((c) => c.visible !== false)
    .flatMap((c) => (c.shapes ?? []).filter((s) => s.view === view).map((s) => ({ c, s })))
    .sort((a, b) => a.s.layer - b.s.layer);
  if (!placed.length) return null;
  const b = boundsOf(placed.map((p) => p.s));
  const pad = 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.x - pad)} ${f(b.y - pad)} ${f(b.w + pad * 2)} ${f(b.h + pad * 2)}"><rect x="${f(b.x - pad)}" y="${f(b.y - pad)}" width="${f(b.w + pad * 2)}" height="${f(b.h + pad * 2)}" fill="#ffffff"/>${placed.map((p) => shapeMarkup(p.c, p.s)).join('')}</svg>`;
}

/** One component on its own (detail view). */
export function componentShapeSvg(c: DesignComponent): string | null {
  const s = c.shapes?.find((x) => x.view === 'front') ?? c.shapes?.[0];
  if (!s) return null;
  const pad = Math.max(s.width, s.height) * 0.08 + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(s.x - pad)} ${f(s.y - pad)} ${f(s.width + pad * 2)} ${f(s.height + pad * 2)}"><rect x="${f(s.x - pad)}" y="${f(s.y - pad)}" width="${f(s.width + pad * 2)}" height="${f(s.height + pad * 2)}" fill="#ffffff"/>${shapeMarkup(c, s, Math.max(1, Math.max(s.width, s.height) / 150))}</svg>`;
}

/**
 * A pattern piece with its dimensions, seam allowance, grainline, fold, notches and a 10 cm
 * scale bar — vector, mm units, so it stays readable and measurable when printed.
 */
export function pieceDetailSvg(piece: PatternPiece): string {
  const b = outlineBounds(piece.outline);
  const sa = piece.seamAllowanceMm ?? 0;
  const pad = sa + 60;
  const W = b.width + pad * 2;
  const H = b.height + pad * 2 + 40;
  const x0 = b.x - pad;
  const y0 = b.y - pad;
  const sw = Math.max(1, Math.max(b.width, b.height) / 300);
  const fs = Math.max(10, Math.max(b.width, b.height) / 28);
  const poly = (pts: readonly { x: number; y: number }[]) =>
    pts.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
  const cut = offsetOutline(piece.outline, sa);
  const dimY = b.y + b.height + sa + 24;
  const dimX = b.x - sa - 24;
  const parts = [
    `<rect x="${f(x0)}" y="${f(y0)}" width="${f(W)}" height="${f(H)}" fill="#fff"/>`,
    `<defs><marker id="dm" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#111827"/></marker></defs>`,
    `<polygon points="${poly(cut)}" fill="none" stroke="#6b7280" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 6)} ${f(sw * 4)}"/>`,
    `<polygon points="${poly(piece.outline)}" fill="#f8fafc" stroke="#111827" stroke-width="${f(sw * 1.6)}"/>`,
    piece.foldLine
      ? `<line x1="${f(piece.foldLine.from.x)}" y1="${f(piece.foldLine.from.y)}" x2="${f(piece.foldLine.to.x)}" y2="${f(piece.foldLine.to.y)}" stroke="#2563eb" stroke-width="${f(sw * 1.4)}" stroke-dasharray="${f(sw * 12)} ${f(sw * 4)}"/>`
      : '',
    piece.grainline
      ? `<line x1="${f(piece.grainline.from.x)}" y1="${f(piece.grainline.from.y)}" x2="${f(piece.grainline.to.x)}" y2="${f(piece.grainline.to.y)}" stroke="#111827" stroke-width="${f(sw * 1.2)}" marker-start="url(#dm)" marker-end="url(#dm)"/>`
      : '',
    ...piece.notches.map(
      (n) => `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(sw * 3)}" fill="#111827"/>`,
    ),
    ...(piece.markings ?? []).map((m) => markingSvg(m, sw)),
    ...pieceDimensions({ outline: piece.outline, edges: piece.edges ?? [] })
      .edges.filter((e) => e.length > 25)
      .map(
        (e) =>
          `<text x="${f(e.mid.x)}" y="${f(e.mid.y - sw * 4)}" font-size="${f(fs * 0.62)}" text-anchor="middle" fill="#1e40af" font-family="Helvetica, Arial, sans-serif">${esc(e.label)} ${e.length} mm</text>`,
      ),
    // width dimension
    `<line x1="${f(b.x)}" y1="${f(dimY)}" x2="${f(b.x + b.width)}" y2="${f(dimY)}" stroke="#111827" stroke-width="${f(sw)}" marker-start="url(#dm)" marker-end="url(#dm)"/>`,
    `<text x="${f(b.x + b.width / 2)}" y="${f(dimY - 6)}" font-size="${f(fs)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${Math.round(b.width)} mm</text>`,
    // height dimension
    `<line x1="${f(dimX)}" y1="${f(b.y)}" x2="${f(dimX)}" y2="${f(b.y + b.height)}" stroke="#111827" stroke-width="${f(sw)}" marker-start="url(#dm)" marker-end="url(#dm)"/>`,
    `<text x="${f(dimX - 6)}" y="${f(b.y + b.height / 2)}" font-size="${f(fs)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" transform="rotate(-90 ${f(dimX - 6)} ${f(b.y + b.height / 2)})">${Math.round(b.height)} mm</text>`,
    // scale bar 100 mm
    `<g transform="translate(${f(x0 + 20)} ${f(y0 + H - 24)})"><rect width="100" height="${f(sw * 4)}" fill="#111827"/><rect width="50" height="${f(sw * 4)}" fill="#fff" stroke="#111827" stroke-width="${f(sw / 2)}"/><text x="105" y="${f(sw * 4)}" font-size="${f(fs * 0.8)}" font-family="Helvetica, Arial, sans-serif">100 mm</text></g>`,
    `<text x="${f(b.x + b.width / 2)}" y="${f(b.y + b.height / 2)}" font-size="${f(fs)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(piece.name)}</text>`,
    `<text x="${f(b.x + b.width / 2)}" y="${f(b.y + b.height / 2 + fs * 1.3)}" font-size="${f(fs * 0.75)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" fill="#374151">Cut ${piece.cutQuantity}${piece.foldLine ? ' on fold' : ''}${piece.mirrored ? ' (pair)' : ''} · SA ${sa} mm · ${esc(piece.pieceId)}</text>`,
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(W)} ${f(H)}" data-width-mm="${f(W)}" data-height-mm="${f(H)}">${parts.join('')}</svg>`;
}

function markingSvg(m: PatternMarking, sw: number): string {
  const pts = m.points.map((p) => `${f(p.x)},${f(p.y)}`).join(' ');
  const p0 = m.points[0]!;
  switch (m.kind) {
    case 'button':
      return `<circle cx="${f(p0.x)}" cy="${f(p0.y)}" r="${f(sw * 6)}" fill="none" stroke="#111827" stroke-width="${f(sw)}"/>`;
    case 'buttonhole':
      return `<line x1="${f(p0.x - sw * 9)}" y1="${f(p0.y)}" x2="${f(p0.x + sw * 9)}" y2="${f(p0.y)}" stroke="#111827" stroke-width="${f(sw * 2)}"/>`;
    case 'dart':
      return `<polyline points="${pts}" fill="none" stroke="#dc2626" stroke-width="${f(sw * 1.2)}"/>`;
    case 'zip':
      return `<polyline points="${pts}" fill="none" stroke="#0891b2" stroke-width="${f(sw * 3)}"/>`;
    case 'gather':
      return `<polyline points="${pts}" fill="none" stroke="#ea580c" stroke-width="${f(sw * 1.4)}" stroke-dasharray="${f(sw * 2)} ${f(sw * 3)}"/>`;
    default:
      return `<polyline points="${pts}" fill="none" stroke="#6b7280" stroke-width="${f(sw)}" stroke-dasharray="${f(sw * 5)} ${f(sw * 3)}"/>`;
  }
}
