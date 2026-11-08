import type { BodiceResult } from './bodice.js';
import { type DraftPiece, mark, Outline, P, piece, quadPts } from './geom.js';
import type { Ctx } from './resolve.js';

/** Collars, neckbands, facings and binding drafted to the measured neckline (ADR-058). */

export function draftNeckFinish(ctx: Ctx, b: BodiceResult): DraftPiece[] {
  const { style } = ctx;
  const half = b.frontNeck + b.backNeck; // CF → CB along the neckline
  const out: DraftPiece[] = [];
  const backOpen = style.closure === 'back_zip';
  if (style.hood) return out; // the hood is sewn to the neckline (see draftHood)
  if (style.collar === 'camp' || style.collar === 'notched') {
    // One-piece collar without a stand: camp (convertible, to CF) or the top collar of a notched
    // lapel (from the gorge). Neck edge = the half neckline it sits on.
    const camp = style.collar === 'camp';
    const depth = ctx.kids ? (camp ? 60 : 55) : camp ? 80 : 75;
    const lift = 10;
    const co = new Outline(P(0, depth));
    co.quad('neck', P(half * 0.6, depth), P(half, depth - lift), 10);
    const point = camp
      ? P(half + (ctx.kids ? 18 : 30), -4)
      : P(half + (ctx.kids ? 10 : 18), depth * 0.25);
    co.line('front', point);
    if (!camp) co.line('front', P(half - (ctx.kids ? 4 : 6), -2));
    co.quad('outer', P(half * 0.55, -2), P(0, 0), 12);
    out.push(
      piece('collar', camp ? 'Camp collar' : 'Top collar', co.close('cb'), {
        cutQuantity: 2,
        foldLine: { from: P(0, 0), to: P(0, depth) },
        grainline: { from: P(half * 0.2, depth * 0.45), to: P(half * 0.8, depth * 0.45) },
        notches: [P(b.backNeck, depth - lift * (b.backNeck / half) ** 2)],
        notes: [
          camp
            ? 'Cut 2 (upper and under collar) + 1 interfacing; ends at CF'
            : 'Cut 2 (top collar + under collar) + interfacing; meets the lapel at the gorge',
        ],
        inputs: { neckline: half, depth },
      }),
    );
    out.push(backNeckFacing(ctx, b));
    return out;
  }
  if (style.collar === 'shirt' || style.collar === 'mandarin') {
    const ext = b.extension;
    const standH = ctx.kids ? 25 : 32;
    const lift = 8;
    // Stand on the CB fold: neck edge (bottom) CB → CF, then the button extension, curved up.
    const so = new Outline(P(0, standH));
    so.quad('neck', P(half * 0.6, standH), P(half, standH - lift), 10);
    if (ext)
      so.quad('ext', P(half + ext * 0.7, standH - lift - 2), P(half + ext, standH - lift - 8), 4);
    const endX = half + ext;
    so.quad('front', P(endX + 4, (standH - lift) * 0.4), P(endX - 8, 0 - lift * 0.6), 6);
    so.quad('top', P(half * 0.6, 0), P(0, 0), 10);
    const stand = so.close('cb');
    out.push(
      piece(
        style.collar === 'mandarin' ? 'collar_band' : 'collar_stand',
        style.collar === 'mandarin' ? 'Mandarin collar' : 'Collar stand',
        stand,
        {
          cutQuantity: 2,
          foldLine: { from: P(0, 0), to: P(0, standH) },
          grainline: { from: P(half * 0.2, standH * 0.5), to: P(half * 0.8, standH * 0.5) },
          notches: [P(b.backNeck, standH - lift * (b.backNeck / half) ** 2)],
          markings: ext ? [mark('buttonhole', [P(half + ext * 0.4, standH * 0.45)])] : [],
          notes: ['Cut 2 + 1 interfacing; notch = shoulder seam'],
          inputs: { neckline: half, height: standH, extension: ext },
        },
      ),
    );
    if (style.collar === 'shirt') {
      const depth = ctx.kids ? 55 : 72;
      const co = new Outline(P(0, depth));
      co.quad('neck', P(half * 0.6, depth), P(half, depth - lift), 10);
      const point = P(half + (ctx.kids ? 14 : 25), -6);
      co.line('front', point);
      co.quad('outer', P(half * 0.55, -2), P(0, 0), 12);
      out.push(
        piece('collar', 'Collar', co.close('cb'), {
          cutQuantity: 2,
          foldLine: { from: P(0, 0), to: P(0, depth) },
          grainline: { from: P(half * 0.2, depth * 0.45), to: P(half * 0.8, depth * 0.45) },
          notes: ['Cut 2 (upper and under collar) + 1 interfacing'],
          inputs: { neckline: half, depth },
        }),
      );
    }
    return out;
  }
  if (style.collar === 'peter_pan') {
    const width = ctx.kids ? 50 : 65;
    // Flat collar: an arc whose inner edge equals the neckline, lying flat around the neck.
    const sweep = Math.PI * 0.92;
    const r = half / sweep;
    const at = (rad: number, a: number) => P(rad * Math.sin(a), rad * Math.cos(a));
    const inner = Array.from({ length: 19 }, (_, i) => at(r, (sweep * i) / 18));
    const outer = Array.from({ length: 19 }, (_, i) => at(r + width, sweep * (1 - i / 18)));
    const o = new Outline(inner[0]!);
    o.poly('neck', inner.slice(1));
    // Rounded front edge.
    const tipIn = inner[18]!;
    const tipOut = outer[0]!;
    o.quad(
      'front',
      P(tipOut.x + (tipOut.x - tipIn.x) * 0.2, tipIn.y + (tipOut.y - tipIn.y) * 1.1),
      tipOut,
      8,
    );
    o.poly('outer', outer.slice(1));
    const shape = o.close('cb');
    out.push(
      piece('collar', 'Peter Pan collar', shape, {
        cutQuantity: backOpen ? 4 : 2,
        mirrored: backOpen,
        foldLine: backOpen ? null : { from: inner[0]!, to: outer[18]! },
        grainline: { from: at(r + width / 2, 0.05), to: at(r + width / 2, 0.6) },
        notes: [
          backOpen
            ? 'Cut 4 (2 upper, 2 under) — opens at centre back'
            : 'Cut 2 on the fold (upper and under collar)',
        ],
        inputs: { neckline: half, width },
      }),
    );
  }
  if (
    ctx.knit &&
    style.collar === 'none' &&
    (style.neckline === 'crew' || style.neckline === 'round')
  ) {
    const length = Math.round(2 * half * 0.85);
    const h = 20;
    out.push(
      piece(
        'neckband',
        'Neckband',
        new Outline(P(0, 0))
          .line('long', P(length, 0))
          .line('end', P(length, h * 2))
          .line('long_b', P(0, h * 2))
          .close('end_b'),
        {
          cutQuantity: 1,
          foldLine: { from: P(0, h), to: P(length, h) },
          grainline: { from: P(length * 0.5 - 20, h), to: P(length * 0.5 + 20, h) },
          notes: ['Stretch evenly to fit the neckline (85 % of its length); seam at CB'],
          inputs: { neckline: half * 2, length },
        },
      ),
    );
    return out;
  }
  // Neck facings (no collar, no front opening — the grown-on facing covers CF).
  if (style.wrap)
    ctx.notes.push('Wrap front: finish the neckline and wrap edge with bias binding or a facing');
  if (
    style.collar === 'none' &&
    style.closure !== 'front_buttons' &&
    !ctx.style.ribbing &&
    !style.wrap
  ) {
    const frontOpen = style.closure === 'front_zip';
    const depth = ctx.kids ? 45 : 55;
    for (const front of [true, false]) {
      const pts = front ? b.frontNeckPts : b.backNeckPts;
      const o = new Outline(pts[0]!);
      o.poly('neck', pts.slice(1));
      const hps = pts[pts.length - 1]!;
      o.line('shoulder', P(hps.x + 30, hps.y + 10));
      const shifted = [...pts]
        .reverse()
        .map((p) => P(p.x + 30 * (p.x / Math.max(1, hps.x)), p.y + depth));
      o.poly('outer', shifted);
      const shape = o.close(front ? 'cf' : 'cb');
      const split = front ? frontOpen : backOpen;
      out.push(
        piece(
          front ? 'facing_front' : 'facing_back',
          front ? 'Front neck facing' : 'Back neck facing',
          shape,
          {
            cutQuantity: split ? 2 : 1,
            mirrored: split,
            foldLine: split ? null : { from: pts[0]!, to: P(0, pts[0]!.y + depth) },
            grainline: {
              from: P(hps.x * 0.4, pts[0]!.y),
              to: P(hps.x * 0.4, pts[0]!.y + depth * 0.8),
            },
            fabricRole: 'main',
            notes: ['Cut in fabric + interfacing'],
          },
        ),
      );
    }
  }
  return out;
}

/** Bias binding for sleeveless armholes. */
export function draftArmholeBinding(ctx: Ctx, b: BodiceResult): DraftPiece {
  const length = Math.round(b.frontArmhole + b.backArmhole + 20);
  const w = ctx.kids ? 28 : 32;
  return piece(
    'armhole_binding',
    'Armhole binding (bias)',
    new Outline(P(0, 0))
      .line('long', P(length, 0))
      .line('end', P(length, w))
      .line('long_b', P(0, w))
      .close('end_b'),
    {
      cutQuantity: 2,
      grainline: { from: P(20, 20), to: P(60, -20) },
      notes: ['Cut 2 on the bias (45°)'],
      inputs: { armhole: b.frontArmhole + b.backArmhole },
    },
  );
}

/** Patch pocket (tops, shirts, dresses). */
export function draftPatchPocket(ctx: Ctx): DraftPiece {
  const w = ctx.kids ? 90 : 125;
  const h = ctx.kids ? 100 : 140;
  const o = new Outline(P(0, 0));
  o.line('top', P(w, 0)).line('side', P(w, h - 20));
  o.poly('bottom', [
    ...quadPts(P(w, h - 20), P(w, h), P(w - 20, h), 4),
    P(20, h),
    ...quadPts(P(20, h), P(0, h), P(0, h - 20), 4),
  ]);
  return piece('patch_pocket', 'Patch pocket', o.close('side_b'), {
    cutQuantity: ctx.spec.family === 'top' ? 1 : 2,
    grainline: { from: P(w / 2, 20), to: P(w / 2, h - 20) },
    markings: [mark('fold', [P(0, 30), P(w, 30)], 'fold the hem')],
    notes: ['30 mm hem at the top edge'],
  });
}

/** Side-seam pocket bag. */
export function draftPocketBag(ctx: Ctx): DraftPiece {
  const w = ctx.kids ? 120 : 170;
  const h = ctx.kids ? 200 : 280;
  const o = new Outline(P(0, 0));
  o.line('seam', P(0, h * 0.75));
  o.quad('bag', P(0, h), P(w * 0.5, h), 8)
    .quad('bag', P(w, h), P(w, h * 0.45), 8)
    .quad('bag', P(w, 0), P(w * 0.25, 0), 8);
  return piece('pocket_bag', 'Pocket bag', o.close('top'), {
    cutQuantity: 4,
    mirrored: true,
    fabricRole: 'lining',
    grainline: { from: P(w * 0.4, 30), to: P(w * 0.4, h * 0.7) },
    markings: [mark('placement', [P(0, 40), P(0, 40 + (ctx.kids ? 110 : 150))], 'pocket opening')],
    notes: ['Cut 4 in pocketing (2 pairs); opening on the side seam'],
  });
}

/** Back neck facing (collars without a stand, lined jackets). */
export function backNeckFacing(ctx: Ctx, b: BodiceResult): DraftPiece {
  const depth = ctx.kids ? 45 : 60;
  const pts = b.backNeckPts;
  const o = new Outline(pts[0]!);
  o.poly('neck', pts.slice(1));
  const hps = pts[pts.length - 1]!;
  o.line('shoulder', P(hps.x + 30, hps.y + 10));
  o.poly(
    'outer',
    [...pts].reverse().map((p) => P(p.x + 30 * (p.x / Math.max(1, hps.x)), p.y + depth)),
  );
  return piece('facing_back', 'Back neck facing', o.close('cb'), {
    cutQuantity: 1,
    foldLine: { from: pts[0]!, to: P(0, pts[0]!.y + depth) },
    grainline: { from: P(hps.x * 0.4, pts[0]!.y), to: P(hps.x * 0.4, pts[0]!.y + depth * 0.8) },
    notes: ['Cut in fabric + interfacing'],
  });
}
