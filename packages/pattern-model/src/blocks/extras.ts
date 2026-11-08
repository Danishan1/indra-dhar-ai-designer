import type { PatternEdge } from '@ai-designer/garment-model';

import {
  clamp,
  type DraftPiece,
  edgeLength,
  mark,
  Outline,
  P,
  piece,
  rect,
  splitAtY,
} from './geom.js';
import type { Ctx } from './resolve.js';

/**
 * Dress and skirt variations (ADR-061): tiered and pleated skirts, ruffles, wrap fronts, frock
 * yokes (bodice yoke + gathered skirt).
 */

type Shape = { outline: P[]; edges: PatternEdge[] };

const edgeLen = (p: { outline: P[]; edges: PatternEdge[] }, name: string) =>
  p.edges.filter((e) => e.name === name).reduce((s, e) => s + edgeLength(p.outline, e), 0);

/**
 * Tiered skirt: `tiers` rectangles, each the previous one × the gather ratio (capped at 1.7), cut
 * front and back on the fold. `waistFull` is the seam the first tier is gathered onto.
 */
export function draftTiers(ctx: Ctx, waistFull: number, length: number): DraftPiece[] {
  const n = ctx.style.tiers;
  const ratio = clamp(ctx.style.gatherRatio, 1.2, 1.7);
  const h = Math.round(length / n);
  const out: DraftPiece[] = [];
  let w = waistFull * (ctx.style.waistband ? 1.35 : 1.5);
  for (let i = 0; i < n; i++) {
    const half = Math.round(w / 4); // quarter: front and back are cut on the fold
    out.push(
      piece(
        `tier_${i + 1}`,
        `Tier ${i + 1}`,
        rect(half, h, ['top', 'side', i === n - 1 ? 'hem' : 'bottom', 'cf']),
        {
          cutQuantity: 2,
          foldLine: { from: P(0, 0), to: P(0, h) },
          grainline: { from: P(half * 0.5, 15), to: P(half * 0.5, h - 15) },
          markings: [
            mark(
              'gather',
              [P(15, 8), P(half - 15, 8)],
              i === 0 ? 'gather to the waist' : 'gather to the tier above',
            ),
          ],
          notes: ['Cut 2 on the fold (front and back)'],
          inputs: { width: Math.round(w), height: h },
        },
      ),
    );
    w *= ratio;
  }
  return out;
}

/** Knife-pleated skirt panels: three times the waist, pleats every 40 mm (25 mm for kids). */
export function draftPleatedSkirt(ctx: Ctx, waistFull: number, length: number): DraftPiece[] {
  const q = waistFull / 4;
  const w = Math.round(q * 3);
  const step = ctx.kids ? 25 : 40;
  const intake = w - q;
  return (['front', 'back'] as const).map((side) => {
    const o = new Outline(P(0, 0));
    o.line('waist', P(w, 0), intake).line('side', P(w, length)).line('hem', P(0, length));
    const marks = [];
    for (let x = step; x < w - step / 2; x += step * 3)
      marks.push(mark('pleat', [P(x, 0), P(x + step * 2, 0)], x === step ? 'knife pleats' : null));
    return piece(
      `skirt_${side}`,
      side === 'front' ? 'Skirt front' : 'Skirt back',
      o.close(side === 'front' ? 'cf' : 'cb'),
      {
        cutQuantity: 1,
        foldLine: { from: P(0, 0), to: P(0, length) },
        grainline: { from: P(w * 0.5, 30), to: P(w * 0.5, length - 30) },
        markings: marks,
        notes: ['Cut 1 on the fold; fold the pleats towards the side and baste across the top'],
        inputs: { waist: q, width: w },
      },
    );
  });
}

/** Ruffle strips (hem, neckline, sleeve hems) at the gather ratio. */
export function draftRuffles(
  ctx: Ctx,
  edges: { hem?: number; neckline?: number; sleeve?: number },
): DraftPiece[] {
  const ratio = clamp(ctx.style.gatherRatio, 1.4, 2.2);
  const out: DraftPiece[] = [];
  const strip = (template: string, name: string, L: number, h: number, n: number, note: string) =>
    piece(template, name, rect(Math.round(L), h, ['top', 'end', 'hem', 'end_b']), {
      cutQuantity: n,
      grainline: { from: P(30, h / 2), to: P(Math.round(L) - 30, h / 2) },
      markings: [mark('gather', [P(15, 8), P(Math.round(L) - 15, 8)], 'gather')],
      notes: [note],
      inputs: { length: Math.round(L), depth: h },
    });
  for (const where of ctx.style.ruffles) {
    if (where === 'hem' && edges.hem)
      out.push(
        strip(
          'ruffle_hem',
          'Hem ruffle',
          (edges.hem / 2) * ratio,
          ctx.kids ? 50 : 70,
          2,
          'Cut 2 (front and back halves); narrow hem, gather onto the hem',
        ),
      );
    if (where === 'neckline' && edges.neckline)
      out.push(
        strip(
          'ruffle_neck',
          'Neckline ruffle',
          edges.neckline * ratio,
          ctx.kids ? 35 : 45,
          1,
          'Cut 1; join at CB, gather to the neckline',
        ),
      );
    if (where === 'sleeve' && edges.sleeve)
      out.push(
        strip(
          'ruffle_sleeve',
          'Sleeve ruffle',
          edges.sleeve * ratio,
          ctx.kids ? 35 : 50,
          2,
          'Cut 2; gather onto the sleeve hems',
        ),
      );
  }
  return out;
}

/**
 * Wrap front: the CF edge is moved out by `overlap` (the fronts cross over), cut as a pair, and a
 * pair of ties is added. Works on any front whose CF edge is at x = 0.
 */
export function wrapFront(ctx: Ctx, front: DraftPiece, overlap: number): DraftPiece {
  const outline = front.outline.map((p) => (Math.abs(p.x) < 0.5 ? P(-overlap, p.y) : p));
  return {
    ...front,
    outline,
    foldLine: null,
    cutQuantity: 2,
    mirrored: true,
    notes: [...front.notes, `Wrap front: cut 2 (pair); ${overlap} mm overlap past CF`],
    edges: front.edges.map((e) => (e.name === 'cf' ? { ...e, name: 'front_edge' } : e)),
  };
}

export function draftTies(ctx: Ctx, waistFull: number): DraftPiece {
  const w = ctx.kids ? 30 : 40;
  const L = Math.round(waistFull / 2 + (ctx.kids ? 350 : 550));
  return piece('ties', 'Tie', rect(L, w * 2, ['long', 'end', 'long_b', 'end_b']), {
    cutQuantity: 2,
    foldLine: { from: P(0, w), to: P(L, w) },
    grainline: { from: P(30, w / 2), to: P(L - 30, w / 2) },
    notes: ['Cut 2; fold, stitch, turn; one tie through a slot in the side seam'],
  });
}

/**
 * Frock yoke: the bodice is cut across at `yokeY` (yoke above, on the fold); below, a gathered
 * skirt panel `gather` × the yoke width, flaring to the hem.
 */
export function frockFromBodice(
  ctx: Ctx,
  body: { front: DraftPiece; back: DraftPiece },
  yokeY: number,
): DraftPiece[] {
  const out: DraftPiece[] = [];
  for (const side of ['front', 'back'] as const) {
    const p = body[side];
    const { top, bottom } = splitAtY(p as Shape & DraftPiece, yokeY, 'yoke_seam');
    const yokeW = edgeLen(top, 'yoke_seam');
    const hemY = Math.max(...p.outline.map((q) => q.y));
    const hemHalf = Math.max(...bottom.outline.map((q) => q.x));
    const w = Math.round(Math.max(yokeW * ctx.style.gatherRatio, hemHalf * 1.15));
    const h = Math.round(hemY - yokeY);
    const flare = ctx.kids ? 40 : 60;
    const o = new Outline(P(0, 0));
    o.line('yoke_seam', P(w, 0), w - yokeW)
      .line('side', P(w + flare, h))
      .line('hem', P(0, h));
    const cb = side === 'front' ? 'cf' : 'cb';
    out.push({
      ...p,
      template: `yoke_${side}`,
      name: side === 'front' ? 'Front yoke' : 'Back yoke',
      outline: top.outline,
      edges: top.edges,
      foldLine: p.foldLine ? { from: p.foldLine.from, to: P(0, yokeY) } : null,
      grainline: { from: P(yokeW * 0.4, yokeY - 50), to: P(yokeW * 0.4, yokeY - 10) },
      markings: p.markings.filter((m) => m.points.every((q) => q.y <= yokeY)),
      notches: p.notches.filter((q) => q.y <= yokeY),
      notes: ['Cut 2 (outer + lining)' + (p.foldLine ? ' on the fold' : ' pairs')],
    });
    out.push(
      piece(`frock_${side}`, side === 'front' ? 'Skirt front' : 'Skirt back', o.close(cb), {
        cutQuantity: p.cutQuantity,
        mirrored: p.mirrored,
        foldLine: p.foldLine ? { from: P(0, 0), to: P(0, h) } : null,
        grainline: { from: P(w * 0.4, 30), to: P(w * 0.4, h - 30) },
        markings: [mark('gather', [P(20, 8), P(w - 20, 8)], 'gather to the yoke')],
        notes: [p.foldLine ? 'Cut 1 on the fold' : 'Cut 2 (pair)'],
        inputs: { yoke: yokeW, width: w },
      }),
    );
  }
  return out;
}
