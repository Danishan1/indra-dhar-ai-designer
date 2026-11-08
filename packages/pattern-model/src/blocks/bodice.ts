import {
  clamp,
  cubicPts,
  dart,
  type DraftPiece,
  dist,
  edgeLength,
  lerp,
  mark,
  Outline,
  P,
  piece,
  quadPts,
} from './geom.js';
import type { Ctx } from './resolve.js';

/**
 * Bodice / top block (ADR-058): half front and half back, centre front/back on x = 0, y down from
 * the high point of the shoulder (HPS) line. Neckline, shoulder slope, armhole, bust and waist
 * shaping follow standard flat-pattern drafting; the result is measured, not guessed: armhole,
 * neckline and side seam lengths are read from the drawn outlines so sleeves, collars and skirts
 * are drafted to fit them.
 */

export interface BodiceEnd {
  /** `waist`: ends at the waistline (dress with waist seam). `length`: to a hem `lengthMm` from HPS. */
  kind: 'waist' | 'length';
  lengthMm?: number;
  /** Extra half-width at the hem beyond the hip line (one-piece dresses, A-line tops). */
  flare?: number;
  /** Shirt-tail hem: the side seam is this much shorter than centre front/back. */
  hemCurve?: number;
}

export interface BodiceResult {
  front: DraftPiece;
  back: DraftPiece;
  /** Upper back cut off as a yoke (shirts). */
  yoke: DraftPiece | null;
  frontArmhole: number;
  backArmhole: number;
  /** Half neckline lengths (CF/CB to the neck point). */
  frontNeck: number;
  backNeck: number;
  /** Finished half waist (seam length minus darts) for joining a skirt. */
  frontWaist: number;
  backWaist: number;
  /** Front neckline points (CF → HPS) for facings and collars. */
  frontNeckPts: P[];
  backNeckPts: P[];
  /** Button extension beyond CF (0 = none). */
  extension: number;
  /** Notched lapel geometry (gorge → lapel point → break), for the facing and top collar. */
  lapel: { gorge: P; point: P; breakY: number } | null;
  /** Front hem / waist y at CF and the facing width a separate facing needs. */
  frontHemY: number;
  shoulder: number;
  underarmY: number;
}

export function draftBodice(ctx: Ctx, end: BodiceEnd): BodiceResult {
  const { m, style, ease } = ctx;
  const B = m.bust + ease.bust;
  const W = m.waist + ease.waist;
  const H = m.hip + ease.hip;
  const N = m.neck;
  const AD = m.armhole_depth;
  const collared = style.collar === 'shirt' || style.collar === 'mandarin';
  const neckline = collared ? 'round' : style.neckline;
  const loose = style.fit === 'relaxed' || style.fit === 'oversized';

  // Neck.
  const baseNw = N / 5 - 2 + (collared ? 3 : 0);
  const widen = { round: 0, crew: 0, v_neck: 5, scoop: 30, square: 25, boat: 55 }[neckline];
  const nw = style.neckWidthMm ?? baseNw + widen;
  const fndDefault = {
    round: N / 5 + 8,
    crew: N / 5,
    v_neck: AD * 0.9,
    scoop: AD * 0.7,
    square: AD * 0.55,
    boat: 30,
  }[neckline];
  const fnd = style.neckDepthMm ?? (collared ? N / 5 + 5 : fndDefault);
  const bnd = neckline === 'boat' ? 12 : neckline === 'scoop' ? 30 : 20;

  // Shoulder (dropped for relaxed / oversized fits).
  const shBase = m.shoulder;
  const drop = style.fit === 'oversized' ? 45 : style.fit === 'relaxed' ? 15 : 0;
  const SH = shBase + drop;
  const slope = style.fit === 'oversized' ? 0.7 : 1;
  const dropB = shBase * 0.3 * slope;
  const dropF = shBase * 0.42 * slope;
  const spB = P(nw + Math.sqrt(Math.max(1, SH * SH - dropB * dropB)), dropB);
  const spF = P(nw + Math.sqrt(Math.max(1, SH * SH - dropF * dropF)), dropF);

  // Armhole and bust line.
  const yU = 20 + AD + ease.bust / 10;
  const hbB = Math.max(B / 4 - 5, spB.x + 5);
  const hbF = Math.max(B / 4 + 5, spF.x + 5);
  const abX = Math.min(m.across_back / 2 + ease.bust / 16, spB.x - 4);
  const afX = Math.min(abX - (ctx.women ? 12 : 8), spF.x - 6);
  const abY = dropB + (yU - dropB) * 0.5;
  const afY = dropF + (yU - dropF) * 0.55;
  const armholeB = [
    ...quadPts(spB, P(abX, spB.y + (abY - spB.y) * 0.55), P(abX, abY), 8),
    ...quadPts(P(abX, abY), P(abX + 6, yU), P(hbB, yU), 10),
  ];
  const armholeF = [
    ...quadPts(spF, P(afX, spF.y + (afY - spF.y) * 0.55), P(afX, afY), 8),
    ...quadPts(P(afX, afY), P(afX + 3, yU), P(hbF, yU), 10),
  ];

  // Waist and bust dart.
  const yWB = 20 + m.back_length;
  const bustDart =
    ctx.women && style.darts && !ctx.knit && style.fit !== 'oversized'
      ? clamp(m.front_length - yWB, 0, 45)
      : 0;
  const yWF = yWB + bustDart;
  const cfExtra = ctx.women && !bustDart ? clamp((m.front_length - yWB) * 0.5, 0, 20) : 0;
  const qwB = W / 4 - 5;
  const qwF = W / 4 + 5;
  const shaped = style.darts && !loose && !ctx.knit;
  const exF = hbF - qwF;
  const exB = hbB - qwB;
  let dF = shaped ? clamp(exF * 0.55, 0, 40) : 0;
  let dB = shaped ? clamp(exB * 0.55, 0, 35) : 0;
  const sideShare = shaped ? 1 : loose ? 0.15 : ctx.knit ? 0.25 : 0.35;
  let sF = clamp((exF - dF) * (shaped ? 1 : sideShare), -60, 45);
  let sB = clamp((exB - dB) * (shaped ? 1 : sideShare), -60, 45);
  if (style.fit === 'oversized') sF = sB = dF = dB = 0;
  const bp = P(m.bust_span / 2, m.bust_depth);

  // Below the waist.
  const qhF = H / 4 + 5;
  const qhB = H / 4 - 5;
  const yH = yWB + m.waist_to_hip;
  const lengthB = end.kind === 'length' ? (end.lengthMm ?? yH) : yWB;
  const flare = end.flare ?? 0;
  const hemCurve = end.hemCurve ?? 0;

  const sidePts = (front: boolean): { pts: P[]; hemX: number; hemY: number } => {
    const hb = front ? hbF : hbB;
    const s = front ? sF : sB;
    const yW = front ? yWF : yWB;
    const offset = front ? bustDart : 0;
    const under = P(hb, yU);
    const waist = P(hb - s, yW);
    if (end.kind === 'waist') return { pts: [waist], hemX: waist.x, hemY: yW };
    const L = lengthB + offset - hemCurve;
    if (L <= yW) {
      const t = clamp((L - yU) / (yW - yU), 0, 1);
      const q = lerp(under, waist, t);
      return { pts: [q], hemX: q.x, hemY: L };
    }
    const qh = front ? qhF : qhB;
    const hipX = Math.max(qh, waist.x, loose ? hb : 0);
    const hip = P(hipX, yH + offset);
    if (L <= hip.y) {
      const t = (L - yW) / (hip.y - yW);
      const q = P(waist.x + (hipX - waist.x) * Math.sqrt(t), L);
      return { pts: [waist, q], hemX: q.x, hemY: L };
    }
    const hem = P(hipX + flare * ((L - hip.y) / Math.max(1, L - yU)) * 2, L);
    // Waist → hip as a gentle curve, then straight (or flared) to the hem.
    const curve = quadPts(waist, P(hipX, waist.y + (hip.y - waist.y) * 0.5), hip, 6);
    return { pts: [waist, ...curve, hem], hemX: hem.x, hemY: L };
  };

  // Front opening: button extension + grown-on facing (a separate placket replaces the facing; a
  // hidden placket doubles it). Front zips and notched lapels have separate facings.
  const buttons = style.closure === 'front_buttons';
  const zip = style.closure === 'front_zip';
  const notched = buttons && style.collar === 'notched';
  const jacket = ctx.spec.family === 'jacket';
  const ext = buttons
    ? notched
      ? ctx.kids
        ? 18
        : 22
      : (style.topType === 'shirt' && ctx.spec.family === 'top') || jacket
        ? 18
        : 15
    : 0;
  const baseFacing = ctx.kids ? 45 : 60;
  const facing =
    !buttons || notched
      ? 0
      : style.placket === 'separate'
        ? 0
        : style.placket === 'hidden'
          ? baseFacing * 2
          : baseFacing;
  const opened = buttons || zip;

  const neckF = neckCurve(neckline, nw, fnd);
  const neckB = cubicPts(P(0, bnd), P(nw * 0.6, bnd), P(nw, bnd * 0.35), P(nw, 0), 10);
  const neckBack = [P(0, bnd), ...neckB];

  // ── front ──
  const fSide = sidePts(true);
  const gorgeAt = Math.max(1, Math.floor(neckF.length * 0.35));
  const gorge = neckF[gorgeAt]!;
  const fo = notched
    ? new Outline(gorge)
    : buttons
      ? new Outline(P(-ext - facing, fnd))
      : new Outline(P(0, fnd));
  if (buttons && !notched) {
    if (facing) fo.line('facing', P(-ext, fnd));
    fo.line('neck_ext', P(0, fnd));
  }
  fo.poly('neck', notched ? neckF.slice(gorgeAt + 1) : neckF.slice(1))
    .line('shoulder', spF)
    .poly('armhole', armholeF)
    .poly('side', fSide.pts, bustDart);
  const hemF = fSide.hemY + (hemCurve ? hemCurve : 0) + cfExtra;
  const isWaist = end.kind === 'waist';
  if (hemCurve || cfExtra)
    fo.cubic(
      isWaist ? 'waist' : 'hem',
      P(fSide.hemX * 0.6, fSide.hemY + (hemF - fSide.hemY) * 0.9),
      P(fSide.hemX * 0.25, hemF),
      P(0, hemF),
      12,
    );
  else fo.line(isWaist ? 'waist' : 'hem', P(0, fSide.hemY));
  if (isWaist && dF) fo.intake('waist', dF);
  const yBreak = yU + (ctx.kids ? 10 : 25);
  const lapelW = ctx.kids ? 45 : 65;
  if (buttons) {
    const yEnd = isWaist ? fSide.hemY : hemF;
    fo.line(isWaist ? 'waist_ext' : 'hem_ext', P(-ext, yEnd));
    if (facing) fo.line('facing', P(-ext - facing, yEnd));
    if (notched)
      fo.line('front_edge', P(-ext, yBreak)).line('lapel', P(-ext - lapelW, gorge.y + 10));
  }
  const front = fo.close(notched ? 'gorge' : buttons ? 'front_edge' : 'cf');
  const frontMarks = [];
  if (bustDart) {
    const top = P(hbF, yU);
    const dirTo = fSide.pts[0]!;
    const yd = yU + 45;
    const t1 = (yd - top.y) / Math.max(1, dirTo.y - top.y);
    const t2 = (yd + bustDart - top.y) / Math.max(1, dirTo.y - top.y);
    frontMarks.push(
      dart(lerp(top, dirTo, t1), P(bp.x + 25, bp.y), lerp(top, dirTo, t2), 'bust dart'),
    );
  }
  if (dF) {
    const cx = bp.x;
    if (isWaist)
      frontMarks.push(
        dart(P(cx - dF / 2, yWF), P(cx, bp.y + 25), P(cx + dF / 2, yWF), 'waist dart'),
      );
    else if (fSide.hemY > yWF + 140)
      frontMarks.push(
        mark(
          'dart',
          [P(cx, bp.y + 25), P(cx - dF / 2, yWF), P(cx, yWF + 120), P(cx + dF / 2, yWF)],
          'fisheye dart',
        ),
      );
  }
  if (zip)
    frontMarks.push(mark('zip', [P(0, fnd + 5), P(0, (isWaist ? yWF : hemF) - 10)], 'front zip'));
  if (buttons && notched) {
    const n = style.buttons ?? (ctx.kids ? 2 : 2);
    for (let i = 0; i < n; i++)
      frontMarks.push(
        mark(
          'button',
          [P(0, yBreak + 10 + i * (ctx.kids ? 70 : 100))],
          i === 0 ? `${n} buttons` : null,
        ),
      );
    frontMarks.push(
      mark('fold', [P(-ext, yBreak), P(nw * 0.85, 0)], 'roll line (lapel folds back)'),
    );
  } else if (buttons) {
    const yStart = fnd + 15;
    const yEnd = isWaist
      ? yWF - 25
      : Math.min(hemF - 120, ctx.spec.family === 'dress' ? hemF - 150 : hemF - 90);
    const count = style.buttons ?? Math.max(3, Math.round((yEnd - yStart) / 95) + 1);
    for (let i = 0; i < count; i++) {
      const y = yStart + ((yEnd - yStart) * i) / Math.max(1, count - 1);
      frontMarks.push(mark('button', [P(0, y)], i === 0 ? `${count} buttons` : null));
    }
    if (facing)
      frontMarks.push(
        mark('fold', [P(-ext, fnd), P(-ext, isWaist ? yWF : hemF)], 'fold back facing'),
      );
  }

  // ── back ──
  const bSide = sidePts(false);
  const backZip = style.closure === 'back_zip';
  const yokeDepth = style.yoke ? (ctx.kids ? 50 : 75) : 0;
  const bo = new Outline(P(0, bnd));
  bo.poly('neck', neckB).line('shoulder', spB).poly('armhole', armholeB).poly('side', bSide.pts);
  const hemB = bSide.hemY + hemCurve;
  if (hemCurve)
    bo.cubic(
      'hem',
      P(bSide.hemX * 0.6, hemB - hemCurve * 0.1),
      P(bSide.hemX * 0.25, hemB),
      P(0, hemB),
      12,
    );
  else bo.line(isWaist ? 'waist' : 'hem', P(0, bSide.hemY));
  if (isWaist && dB) bo.intake('waist', dB);
  const backFull = bo.close('cb');
  const backMarks = [];
  if (dB) {
    const cx = Math.min(abX * 0.62, hbB * 0.5);
    if (isWaist)
      backMarks.push(dart(P(cx - dB / 2, yWB), P(cx, yU + 10), P(cx + dB / 2, yWB), 'waist dart'));
    else if (bSide.hemY > yWB + 140)
      backMarks.push(
        mark(
          'dart',
          [P(cx, yU + 10), P(cx - dB / 2, yWB), P(cx, yWB + 130), P(cx + dB / 2, yWB)],
          'fisheye dart',
        ),
      );
  }
  if (backZip)
    backMarks.push(
      mark(
        'zip',
        [P(0, bnd + 10), P(0, isWaist ? yWB : Math.min(yWB + 180, bSide.hemY - 80))],
        'invisible zip',
      ),
    );

  let yoke: DraftPiece | null = null;
  let back = backFull;
  if (yokeDepth) {
    // Split the back at the yoke line: yoke above, body below (both on the CB fold).
    const found = armholeB.findIndex((p) => p.y >= yokeDepth);
    const ai = found < 0 ? armholeB.length - 1 : found;
    const a0 = ai === 0 ? spB : armholeB[ai - 1]!;
    const a1 = armholeB[ai]!;
    const t = (yokeDepth - a0.y) / Math.max(0.01, a1.y - a0.y);
    const yokeEnd = lerp(a0, a1, t);
    const yo = new Outline(P(0, bnd));
    yo.poly('neck', neckB)
      .line('shoulder', spB)
      .poly('armhole', [...armholeB.slice(0, ai), yokeEnd])
      .line('seam', P(0, yokeDepth));
    yoke = piece('yoke', 'Back yoke', yo.close('cb'), {
      cutQuantity: 2,
      foldLine: { from: P(0, bnd), to: P(0, yokeDepth) },
      grainline: { from: P(nw * 0.6, yokeDepth * 0.5), to: P(spB.x * 0.8, yokeDepth * 0.5) },
      notes: ['Cut 2 (outer and inner yoke)'],
    });
    const bo2 = new Outline(P(0, yokeDepth));
    bo2.line('seam', yokeEnd).poly('armhole', armholeB.slice(ai)).poly('side', bSide.pts);
    if (hemCurve)
      bo2.cubic(
        'hem',
        P(bSide.hemX * 0.6, hemB - hemCurve * 0.1),
        P(bSide.hemX * 0.25, hemB),
        P(0, hemB),
        12,
      );
    else bo2.line('hem', P(0, bSide.hemY));
    back = bo2.close('cb');
    if (style.backPleat) {
      // Box pleat at CB: widen the back body at the fold; the yoke seam takes it in.
      const pl = ctx.kids ? 20 : 30;
      back = {
        outline: back.outline.map((p) => (p.x <= 0.01 ? p : P(p.x + pl, p.y))),
        edges: back.edges.map((e) => (e.name === 'seam' ? { ...e, intakeMm: e.intakeMm + pl } : e)),
      };
      backMarks.push(mark('pleat', [P(0, yokeDepth), P(pl, yokeDepth)], 'box pleat (half)'));
    }
  }

  const frontArmhole = edgeLength(
    front.outline,
    front.edges.find((e) => e.name === 'armhole')!,
  );
  const backArmhole =
    edgeLength(
      back.outline,
      back.edges.find((e) => e.name === 'armhole')!,
    ) +
    (yoke
      ? edgeLength(
          yoke.outline,
          yoke.edges.find((e) => e.name === 'armhole')!,
        )
      : 0);
  // (For a notched lapel the front neck runs from the gorge to the neck point.)
  const frontNeck = edgeLength(
    front.outline,
    front.edges.find((e) => e.name === 'neck')!,
  );
  const backNeck = edgeLength(
    backFull.outline,
    backFull.edges.find((e) => e.name === 'neck')!,
  );
  const frontWaistLen = isWaist
    ? edgeLength(
        front.outline,
        front.edges.find((e) => e.name === 'waist')!,
      )
    : 0;

  const grainF = {
    from: P(Math.max(30, bp.x * 0.7), yU),
    to: P(Math.max(30, bp.x * 0.7), Math.max(yU + 60, fSide.hemY - 40)),
  };
  const grainB = {
    from: P(abX * 0.5, Math.max(yU, yokeDepth + 30)),
    to: P(abX * 0.5, Math.max(yU + 60, bSide.hemY - 40)),
  };
  const bodiceNames =
    isWaist &&
    (ctx.spec.family === 'dress' || ctx.spec.family === 'jumpsuit' || ctx.spec.family === 'top');
  const frontName = bodiceNames ? 'Bodice front' : 'Front';
  const backName = bodiceNames ? 'Bodice back' : 'Back';
  return {
    front: piece(isWaist ? 'bodice_front' : 'front', frontName, front, {
      cutQuantity: opened ? 2 : 1,
      mirrored: opened,
      foldLine: opened ? null : { from: P(0, fnd), to: P(0, isWaist ? yWF : hemF) },
      grainline: grainF,
      notches: [P(afX, afY)],
      markings: frontMarks,
      inputs: { bust: B, waist: W, armhole: frontArmhole },
      notes: notched
        ? [
            'Cut 2 (left and right fronts); separate front facing; lapel rolls back on the roll line',
          ]
        : buttons && facing
          ? ['Cut 2 (left and right fronts); fold the facing back along the fold line']
          : opened
            ? ['Cut 2 (left and right fronts)']
            : [],
    }),
    back: piece(isWaist ? 'bodice_back' : 'back', backName, back, {
      cutQuantity: backZip ? 2 : 1,
      mirrored: backZip,
      foldLine: backZip ? null : { from: P(0, yokeDepth || bnd), to: P(0, isWaist ? yWB : hemB) },
      grainline: grainB,
      notches: [P(abX, abY - 6), P(abX, abY + 6)],
      markings: backMarks,
      inputs: { armhole: backArmhole },
      notes: backZip ? ['Cut 2; centre back seam with zip'] : [],
    }),
    yoke,
    frontArmhole,
    backArmhole,
    frontNeck,
    backNeck,
    frontWaist: Math.max(0, frontWaistLen - dF),
    backWaist: isWaist
      ? Math.max(
          0,
          edgeLength(
            back.outline,
            back.edges.find((e) => e.name === 'waist')!,
          ) - dB,
        )
      : 0,
    frontNeckPts: notched ? neckF.slice(gorgeAt) : neckF,
    backNeckPts: neckBack,
    extension: ext,
    lapel: notched ? { gorge, point: P(-ext - lapelW, gorge.y + 10), breakY: yBreak } : null,
    frontHemY: isWaist ? yWF : hemF,
    shoulder: dist(P(nw, 0), spF),
    underarmY: yU,
  };
}

/** Front neckline from CF (x = 0) to the neck point (nw, 0). */
function neckCurve(style: string, nw: number, depth: number): P[] {
  const a = P(0, depth);
  const b = P(nw, 0);
  switch (style) {
    case 'v_neck':
      return [a, b];
    case 'square': {
      const r = Math.min(15, nw * 0.2, depth * 0.2);
      return [
        a,
        P(nw - r, depth),
        ...quadPts(P(nw - r, depth), P(nw, depth), P(nw, depth - r), 4),
        b,
      ];
    }
    case 'boat':
      return [a, ...cubicPts(a, P(nw * 0.6, depth), P(nw * 0.9, depth * 0.3), b, 10)];
    default:
      return [a, ...cubicPts(a, P(nw * 0.55, depth), P(nw, depth * 0.45), b, 12)];
  }
}
