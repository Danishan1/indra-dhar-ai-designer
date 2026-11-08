import type { BodiceResult } from './bodice.js';
import {
  type DraftPiece,
  edgeLength,
  mark,
  Outline,
  P,
  piece,
  polyLength,
  quadPts,
  rect,
  solve,
} from './geom.js';
import type { Ctx } from './resolve.js';

/**
 * Jacket and top details (ADR-061): hood, separate front facing (notched lapel, zip fronts), knit
 * rib bands, kangaroo pocket, linings, shirt button placket and sleeve plackets.
 */

const len = (p: DraftPiece, edge: string) => {
  const e = p.edges.find((x) => x.name === edge);
  return e ? edgeLength(p.outline, e) : 0;
};

/** Two-piece hood (side pieces, seam over the crown) drafted to the half neckline. */
export function draftHood(ctx: Ctx, b: BodiceResult): DraftPiece[] {
  const half = b.frontNeck + b.backNeck;
  const H = ctx.kids ? 290 : 350;
  const neckCurve = (D: number) => quadPts(P(0, H), P(D * 0.55, H + 10), P(D, H - 25), 10);
  const D = solve((d) => polyLength([P(0, H), ...neckCurve(d)]), half, 60, 600);
  const o = new Outline(P(0, H));
  o.poly('neck', neckCurve(D));
  o.quad('back', P(D + 35, H * 0.45), P(D * 0.8, 30), 12);
  o.quad('back', P(D * 0.45, -12), P(25, 0), 8);
  o.line('front', P(0, 30));
  const shape = o.close('front');
  const pieces = [
    piece('hood', 'Hood', shape, {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(D * 0.4, 60), to: P(D * 0.4, H - 40) },
      notches: [P(D * 0.5, H + 4)],
      notes: ['Cut 2 (pair); centre seam over the crown; front edge hemmed or with a casing'],
      inputs: { neckline: half, height: H, depth: D },
    }),
  ];
  if (ctx.style.lining)
    pieces.push({
      ...pieces[0]!,
      template: 'hood_lining',
      name: 'Hood lining',
      fabricRole: 'lining',
      notes: ['Cut 2 (pair) in lining'],
    });
  return pieces;
}

/** Separate front facing: follows the lapel for notched collars, a strip for zip fronts. */
export function draftFrontFacing(ctx: Ctx, b: BodiceResult, front: DraftPiece): DraftPiece {
  const fw = ctx.kids ? 55 : 75;
  const ext = b.extension;
  const hemY = b.frontHemY;
  if (b.lapel) {
    const neck = b.frontNeckPts; // gorge → HPS
    const hps = neck[neck.length - 1]!;
    const o = new Outline(hps);
    o.line('shoulder', P(hps.x + (ctx.kids ? 25 : 35), hps.y + 12));
    o.line('inner', P(-ext + fw, b.lapel.breakY + 60));
    o.line('inner', P(-ext + fw, hemY));
    o.line('hem', P(-ext, hemY));
    o.line('front_edge', P(-ext, b.lapel.breakY));
    o.line('lapel', b.lapel.point);
    o.line('gorge', b.lapel.gorge);
    o.poly('neck', neck.slice(1, -1));
    return piece('front_facing', 'Front facing', o.close('neck'), {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(-ext + fw * 0.4, b.lapel.breakY), to: P(-ext + fw * 0.4, hemY - 40) },
      notes: ['Cut 2 (pair) in fabric + interfacing; the lapel is the facing side'],
    });
  }
  const top = front.outline.reduce((m, p) => (Math.abs(p.x) < 1 ? Math.min(m, p.y) : m), Infinity);
  const y0 = Number.isFinite(top) ? top : 0;
  return piece(
    'front_facing',
    'Front facing',
    rect(fw, hemY - y0, ['top', 'inner', 'hem', 'front_edge']),
    {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(fw / 2, 20), to: P(fw / 2, hemY - y0 - 20) },
      notes: ['Cut 2 (pair) + interfacing; covers the zip tape'],
    },
  );
}

/** Knit rib bands: hem band (85 % of the hem) and cuffs (on the sleeve hem). */
export function draftRibBands(
  ctx: Ctx,
  pieces: { front: DraftPiece; back: DraftPiece; sleeve?: DraftPiece },
): DraftPiece[] {
  const h = ctx.kids ? 45 : 65;
  const fold = (L: number, name: string, template: string, n: number, note: string) =>
    piece(template, name, rect(Math.round(L), h * 2, ['long', 'end', 'long_b', 'end_b']), {
      cutQuantity: n,
      fabricRole: 'rib',
      foldLine: { from: P(0, h), to: P(Math.round(L), h) },
      grainline: { from: P(Math.round(L) / 2 - 20, h), to: P(Math.round(L) / 2 + 20, h) },
      notes: [note],
    });
  // Each piece is half the front / back (on the fold or cut as a pair).
  const fHem = 2 * (len(pieces.front, 'hem') + len(pieces.front, 'hem_ext'));
  const bHem = 2 * len(pieces.back, 'hem');
  const out = [
    fold(
      (fHem + bHem) * 0.85,
      'Hem rib',
      'rib_hem',
      1,
      'Rib knit, ribs vertical; 85 % of the hem, stretched evenly',
    ),
  ];
  if (pieces.sleeve) {
    const sHem = len(pieces.sleeve, 'hem');
    out.push(
      fold(
        Math.max(ctx.m.wrist + 20, sHem * 0.75),
        'Cuff rib',
        'rib_cuff',
        2,
        'Rib knit; seam into a loop, fold in half',
      ),
    );
  }
  return out;
}

/** Kangaroo pocket (hoodies): one patch across the front, side openings. */
export function draftKangaroo(ctx: Ctx): DraftPiece {
  const w = ctx.kids ? 120 : 175; // half width (on the fold)
  const h = ctx.kids ? 160 : 220;
  const slope = ctx.kids ? 45 : 65;
  const o = new Outline(P(0, 0));
  o.line('top', P(w - slope, 0))
    .line('opening', P(w, h * 0.7))
    .line('side', P(w, h))
    .line('bottom', P(0, h));
  return piece('kangaroo_pocket', 'Kangaroo pocket', o.close('cf'), {
    cutQuantity: 1,
    foldLine: { from: P(0, 0), to: P(0, h) },
    grainline: { from: P(30, 20), to: P(30, h - 20) },
    notes: ['Cut 1 on the fold; hem the slanted openings, topstitch to the front'],
  });
}

/** Linings: front (less the facing), back with a CB ease pleat, sleeves. */
export function draftLinings(ctx: Ctx, pieces: DraftPiece[]): DraftPiece[] {
  return pieces.map((p) => ({
    ...p,
    template: `lining_${p.template}`,
    name: `${p.name} lining`,
    fabricRole: 'lining',
    markings: [],
    notches: p.notches,
    notes: [
      p.template.includes('front')
        ? 'Cut in lining; trim the facing width off the front edge (+ seam allowance)'
        : p.template.includes('back')
          ? 'Cut in lining with a 20 mm ease pleat at CB'
          : 'Cut in lining',
    ],
  }));
}

/** Separate button placket for shirts (left front). */
export function draftButtonPlacket(ctx: Ctx, b: BodiceResult, front: DraftPiece): DraftPiece {
  const ext = b.extension || 15;
  const L = Math.round(len(front, 'front_edge') || b.frontHemY);
  const w = ext * 4;
  return piece(
    'button_placket',
    'Button placket',
    rect(w, L, ['top', 'side', 'bottom', 'side_b']),
    {
      cutQuantity: 1,
      grainline: { from: P(w / 2, 20), to: P(w / 2, L - 20) },
      markings: [
        mark('fold', [P(ext, 0), P(ext, L)], 'fold'),
        mark('fold', [P(ext * 3, 0), P(ext * 3, L)], 'fold'),
      ],
      notes: ['Cut 1 + interfacing; sewn to the left front, folded to 2 × extension wide'],
    },
  );
}

/** Sleeve plackets for shirt cuffs (tower placket + underlap binding), and the slit. */
export function draftSleevePlackets(ctx: Ctx): DraftPiece[] {
  const slit = ctx.kids ? 90 : 140;
  const w = ctx.kids ? 50 : 60;
  return [
    piece('sleeve_placket', 'Sleeve placket', rect(w, slit + 40), {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(w / 2, 10), to: P(w / 2, slit + 30) },
      notes: ['Tower placket; cut 2 (pair)'],
    }),
    piece('sleeve_underlap', 'Placket underlap', rect(30, slit * 2 + 20), {
      cutQuantity: 2,
      grainline: { from: P(15, 10), to: P(15, slit * 2) },
      notes: ['Binding for the underlap side of the slit'],
    }),
  ];
}

/** Slit length on the sleeve for the placket. */
export function sleeveSlit(ctx: Ctx): number {
  return ctx.kids ? 90 : 140;
}
