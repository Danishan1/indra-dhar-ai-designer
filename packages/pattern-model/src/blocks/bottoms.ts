import { type DraftPiece, mark, Outline, P, piece, quadPts, rect } from './geom.js';
import type { Ctx } from './resolve.js';

/**
 * Details of bottoms (ADR-061): waistband constructions, belt loops, back, cargo and front patch
 * pockets, drawstrings. Shared by trousers/shorts, skirts, jumpsuits and dungarees.
 */

/** Whether the waist needs an opening (zip/buttons) — elastic waists pull on. */
export function waistOpens(ctx: Ctx): boolean {
  const c = ctx.style.closure;
  return c === 'fly_zip' || c === 'side_zip' || c === 'back_zip' || c === 'front_buttons';
}

/**
 * Waistband for a finished waist `waist` (full circumference, mm): fitted (button + overlap),
 * elastic or drawstring casing (the waist is gathered onto the elastic), or elastic back (flat front
 * with a button, elastic in the back half — common on kids' trousers).
 */
export function draftBottomWaistband(
  ctx: Ctx,
  waist: number,
  opts: { frontWaist?: number; backWaist?: number } = {},
): DraftPiece[] {
  const st = ctx.style;
  const type = st.waistbandType;
  const opens = waistOpens(ctx);
  const loops = st.beltLoops;
  const out: DraftPiece[] = [];
  if (type === 'elastic' || type === 'drawstring') {
    const elastic = ctx.kids ? 25 : 32;
    const h = elastic + 8;
    const len = Math.round(waist);
    const marks = [];
    if (type === 'drawstring')
      marks.push(
        mark('buttonhole', [P(len / 2 - 15, h * 0.5)], 'eyelet'),
        mark('buttonhole', [P(len / 2 + 15, h * 0.5)], 'eyelet'),
      );
    marks.push(...loopMarks(len, h, loops, 0));
    const elasticLen = Math.round(ctx.m.waist * 0.92);
    out.push(
      piece(
        'waistband',
        type === 'drawstring' ? 'Drawstring casing' : 'Elastic waistband',
        bandShape(len, h),
        {
          cutQuantity: 1,
          foldLine: { from: P(0, h), to: P(len, h) },
          grainline: { from: P(40, h * 0.5), to: P(len - 40, h * 0.5) },
          markings: marks,
          notes: [
            `Elastic ${elastic} mm wide × ${elasticLen} mm (body waist − 8 %)`,
            'Join into a loop at CB; no opening needed',
          ],
          inputs: { waist, height: h, elastic: elasticLen },
        },
      ),
    );
    if (type === 'drawstring') {
      const w = ctx.kids ? 28 : 36;
      const L = Math.round(waist + (ctx.kids ? 450 : 700));
      out.push(
        piece('drawstring', 'Drawstring', rect(L, w * 2, ['long', 'end', 'long_b', 'end_b']), {
          cutQuantity: 1,
          foldLine: { from: P(0, w), to: P(L, w) },
          grainline: { from: P(30, w * 0.5), to: P(L - 30, w * 0.5) },
          notes: ['Fold in half lengthwise, edges in, stitch closed (or use cord)'],
        }),
      );
    }
    return out;
  }
  const overlap = opens ? 35 : 0;
  const h = ctx.kids ? 30 : 38;
  const len = Math.round(waist + overlap);
  const marks = opens
    ? [mark('buttonhole', [P(len - 15, h * 0.5)]), mark('button', [P(15, h * 0.5)])]
    : [];
  marks.push(...loopMarks(len, h, loops, overlap));
  const notes = ['Cut 1 + 1 interfacing'];
  if (overlap) notes.push(`Includes ${overlap} mm overlap`);
  if (type === 'elastic_back' && opts.backWaist) {
    const front = Math.round(2 * (opts.frontWaist ?? waist / 4));
    marks.push(
      mark(
        'gather',
        [P(overlap + front / 2, h * 0.5), P(overlap + front / 2 + 2 * opts.backWaist, h * 0.5)],
        'elastic back',
      ),
    );
    notes.push(
      `Elastic in the back half: ${Math.round(ctx.m.waist * 0.46)} mm (${ctx.kids ? 25 : 30} mm wide)`,
    );
  }
  out.push(
    piece('waistband', 'Waistband', bandShape(len, h), {
      cutQuantity: 1,
      foldLine: { from: P(0, h), to: P(len, h) },
      grainline: { from: P(40, h * 0.5), to: P(len - 40, h * 0.5) },
      markings: marks,
      notes,
      inputs: { waist, overlap, height: h },
    }),
  );
  return out;
}

function bandShape(len: number, h: number) {
  return new Outline(P(0, 0))
    .line('long', P(len, 0))
    .line('end', P(len, h * 2))
    .line('long_b', P(0, h * 2))
    .close('end_b');
}

/** Belt-loop positions on the band: CF ±, sides, CB (from the button end). */
function loopMarks(len: number, h: number, n: number, overlap: number) {
  if (!n) return [];
  const body = len - overlap;
  const at = n === 1 ? [0.5] : Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  return at.map((t, i) =>
    mark(
      'placement',
      [P(overlap + body * t, 0), P(overlap + body * t, h)],
      i === 0 ? `${n} belt loops` : null,
    ),
  );
}

/** One strip cut into `n` belt loops. */
export function draftBeltLoops(ctx: Ctx): DraftPiece | null {
  const n = ctx.style.beltLoops;
  if (!n) return null;
  const each = ctx.kids ? 55 : 70;
  const w = ctx.kids ? 30 : 36;
  const L = n * each + 30;
  return piece('belt_loops', 'Belt loop strip', rect(L, w, ['long', 'end', 'long_b', 'end_b']), {
    cutQuantity: 1,
    grainline: { from: P(20, w / 2), to: P(L - 20, w / 2) },
    markings: Array.from({ length: n - 1 }, (_, i) =>
      mark('line', [P((i + 1) * each, 0), P((i + 1) * each, w)], i === 0 ? `cut into ${n}` : null),
    ),
    notes: [`Fold in thirds, topstitch, cut into ${n} loops of ${each} mm`],
    inputs: { loops: n, each },
  });
}

/** Back pockets: patch pockets, or welts with bags. */
export function draftBackPockets(ctx: Ctx): DraftPiece[] {
  const st = ctx.style;
  if (st.backPockets === 'none') return [];
  const w = ctx.kids ? 100 : 140;
  const h = ctx.kids ? 110 : 155;
  const n = st.backPocketCount;
  if (st.backPockets === 'patch') {
    const o = new Outline(P(0, 0));
    o.line('top', P(w, 0))
      .line('side', P(w, h - 15))
      .line('bottom', P(w / 2, h))
      .line('bottom', P(0, h - 15));
    return [
      piece('back_pocket', 'Back patch pocket', o.close('side_b'), {
        cutQuantity: n,
        grainline: { from: P(w / 2, 25), to: P(w / 2, h - 30) },
        markings: [mark('fold', [P(0, 25), P(w, 25)], 'fold the hem')],
        notes: ['25 mm double-fold hem at the top; topstitch onto the back leg at the marks'],
      }),
    ];
  }
  const L = w + 20;
  const welt = ctx.kids ? 12 : 15;
  return [
    piece('welt', 'Welt', rect(L, welt * 4, ['long', 'end', 'long_b', 'end_b']), {
      cutQuantity: n,
      foldLine: { from: P(0, welt * 2), to: P(L, welt * 2) },
      grainline: { from: P(15, welt), to: P(L - 15, welt) },
      notes: [`Cut ${n} + interfacing; finished welt ${welt} mm`],
    }),
    piece(
      'welt_bag',
      'Welt pocket bag',
      rect(L + 20, (ctx.kids ? 140 : 190) * 2, ['top', 'side', 'bottom', 'side_b']),
      {
        cutQuantity: n,
        fabricRole: 'lining',
        foldLine: { from: P(0, ctx.kids ? 140 : 190), to: P(L + 20, ctx.kids ? 140 : 190) },
        grainline: { from: P(30, 30), to: P(30, (ctx.kids ? 140 : 190) * 2 - 30) },
        notes: ['Cut in pocketing; fold at the bottom'],
      },
    ),
  ];
}

/** Cargo pockets (one per leg) with a box pleat and a flap. */
export function draftCargoPockets(ctx: Ctx): DraftPiece[] {
  if (!ctx.style.cargoPockets) return [];
  const w = ctx.kids ? 130 : 180;
  const h = Math.round(w * 1.1);
  const pleat = ctx.kids ? 30 : 40;
  return [
    piece('cargo_pocket', 'Cargo pocket', rect(w + pleat, h + 30), {
      cutQuantity: 2,
      grainline: { from: P((w + pleat) / 2, 40), to: P((w + pleat) / 2, h - 10) },
      markings: [
        mark(
          'pleat',
          [P((w + pleat) / 2 - pleat / 2, 30), P((w + pleat) / 2 + pleat / 2, 30)],
          'box pleat',
        ),
        mark('fold', [P(0, 30), P(w + pleat, 30)], 'fold the hem'),
      ],
      notes: ['30 mm hem at the top; box pleat in the centre'],
    }),
    piece('cargo_flap', 'Cargo flap', rect(w + 10, ctx.kids ? 50 : 65), {
      cutQuantity: 4,
      grainline: { from: P((w + 10) / 2, 10), to: P((w + 10) / 2, (ctx.kids ? 50 : 65) - 10) },
      markings: [mark('buttonhole', [P((w + 10) / 2, (ctx.kids ? 50 : 65) - 18)])],
      notes: ['Cut 4 (2 flaps, outer + facing) + 2 interfacing'],
    }),
  ];
}

/** Front patch pockets on trousers, shorts and skirts (a curved-corner patch). */
export function draftFrontPatchPockets(ctx: Ctx): DraftPiece {
  const w = ctx.kids ? 110 : 160;
  const h = ctx.kids ? 120 : 170;
  const o = new Outline(P(0, 0));
  o.line('top', P(w, 0)).line('side', P(w, h - 25));
  o.poly('bottom', [
    ...quadPts(P(w, h - 25), P(w, h), P(w - 25, h), 4),
    P(25, h),
    ...quadPts(P(25, h), P(0, h), P(0, h - 25), 4),
  ]);
  return piece('front_patch_pocket', 'Front patch pocket', o.close('side_b'), {
    cutQuantity: 2,
    grainline: { from: P(w / 2, 30), to: P(w / 2, h - 30) },
    markings: [mark('fold', [P(0, 30), P(w, 30)], 'fold the hem')],
    notes: ['30 mm hem at the top'],
  });
}
