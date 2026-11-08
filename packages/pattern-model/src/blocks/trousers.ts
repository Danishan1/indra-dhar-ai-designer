import type { PatternEdge } from '@ai-designer/garment-model';

import {
  clamp,
  dart,
  dist,
  type DraftPiece,
  edgeLength,
  lerp,
  mark,
  Outline,
  P,
  piece,
  quadPts,
} from './geom.js';
import { type Ctx, lengthFor } from './resolve.js';

/**
 * Trouser / shorts block (ADR-058): one front and one back leg (cut 2 mirrored each), drafted from
 * waist, hip, body rise, knee and ankle with crotch extensions (front H/16, back H/9), a raised and
 * slanted centre back, darts, and the leg shape (straight, slim, wide, tapered). The back side
 * seam is adjusted so the outseams match.
 */

export interface TrouserResult {
  pieces: DraftPiece[];
  /** Finished waist of the legs (front + back, both sides), for the waistband. */
  waist: number;
  frontWaist: number;
  backWaist: number;
  /** Front pocket pieces (side fronts, bags) when the pocket is cut into the leg. */
  pocketPieces: DraftPiece[];
  /** Geometry for placing back/cargo pockets. */
  back: { sideWaist: P; cTop: P };
  front: { sideWaist: P; cTop: P; crotchY: number };
}

export interface TrouserOptions {
  /** Jumpsuits: the finished waist the legs must have (to join the bodice). */
  waistTarget?: number;
  /** Extra body rise (jumpsuits, dungarees need room to sit). */
  riseExtra?: number;
}

/** Front/back pleat depth for the pleat option. */
export function pleatDepth(ctx: Ctx): number {
  const one = ctx.kids ? 20 : 30;
  return ctx.style.pleats === 'double' ? one * 1.8 : ctx.style.pleats === 'single' ? one : 0;
}

const KNEE_EASE = { fitted: 80, regular: 120, relaxed: 170, oversized: 220 } as const;

export function draftTrousers(ctx: Ctx, opts: TrouserOptions = {}): TrouserResult {
  const { m, style } = ctx;
  const H = m.hip + ctx.ease.hip;
  const W =
    opts.waistTarget ?? m.waist + Math.min(ctx.ease.waist, style.fit === 'fitted' ? 15 : 25);
  // Elastic and drawstring waists pull on over the hips: no darts, waist = hip.
  const elastic =
    style.waistband && (style.waistbandType === 'elastic' || style.waistbandType === 'drawstring');
  const elasticBack = style.waistband && style.waistbandType === 'elastic_back';
  const pleat = pleatDepth(ctx);
  const pocketCut = style.pockets === 'slant' || style.pockets === 'scoop' ? style.pockets : null;
  const fH = H / 4 - 10;
  const bH = H / 4 + 10;
  const fx = H / 16;
  const bx = H / 9;
  const riseEase = { fitted: 8, regular: 15, relaxed: 25, oversized: 35 }[style.fit];
  const CD = m.crotch_depth + riseEase + (opts.riseExtra ?? 0);
  const yH = m.waist_to_hip;
  const yK = m.waist_to_knee;
  const OS = lengthFor(ctx, 'trousers');

  let kneeT = m.knee + KNEE_EASE[style.fit];
  let hemT = kneeT;
  switch (style.leg) {
    case 'slim':
      kneeT -= 30;
      hemT = Math.max(m.ankle + 120, kneeT - 70);
      break;
    case 'tapered':
      kneeT -= 20;
      hemT = m.ankle + 90;
      break;
    case 'wide':
      kneeT += 80;
      hemT = kneeT + 140;
      break;
  }

  const leg = (front: boolean, sideWaistY: number) => {
    const hip = front ? fH : bH;
    const ext = front ? fx : bx;
    const crotchY = CD + (front ? 0 : 10);
    const C = P(hip + ext, crotchY);
    const crease = (hip + ext) / 2 - (front ? 0 : 10);
    const kneeHalf = (kneeT / 2 + (front ? -20 : 20)) / 2;
    const hemHalf = (hemT / 2 + (front ? -20 : 20)) / 2;
    // Half width of the leg at height y (crotch line → knee → hem).
    const halfAt = (y: number) => {
      const atCrotch = (hip + ext) / 2;
      if (y <= yK)
        return (
          atCrotch + (kneeHalf - atCrotch) * clamp((y - crotchY) / Math.max(1, yK - crotchY), 0, 1)
        );
      return kneeHalf + (hemHalf - kneeHalf) * clamp((y - yK) / Math.max(1, OS - yK), 0, 1);
    };
    const gathered = elastic || (elasticBack && !front);
    const q = gathered ? hip : front ? W / 4 - 5 : W / 4 + 5;
    const excess = Math.max(0, hip - q);
    let d = gathered ? 0 : front ? clamp(excess * 0.3, 0, 20) : clamp(excess * 0.5, 0, 40);
    if (front && pleat && !gathered) d = pleat;
    const cTop = front ? P(hip - 10, 0) : P(hip - 25, -25);
    const sideWaist = P(
      cTop.x - Math.sqrt(Math.max(1, (q + d) ** 2 - (cTop.y - sideWaistY) ** 2)),
      sideWaistY,
    );

    // Side seam from the hip up to the side waist (shared by the leg and a cut-in pocket).
    const hipSideX = (crotchY: number) => Math.min(0, crease - halfAt(Math.max(crotchY, yH)));
    const hipSide0 = P(hipSideX(crotchY), yH);
    const upper = [
      hipSide0,
      ...quadPts(hipSide0, P(hipSide0.x, yH * 0.35 + sideWaistY * 0.65), sideWaist, 8),
    ];
    // Slant / scoop pocket (front only): the leg starts on the waist `pw` in from the side and
    // the side seam stops `ph` down; the side front piece fills the corner.
    const pw = ctx.kids ? 35 : 45;
    const ph = Math.min(ctx.kids ? 120 : 165, yH - 15);
    const cut = front && pocketCut;
    const A = cut ? lerp(sideWaist, cTop, pw / dist(sideWaist, cTop)) : sideWaist;
    const yB = sideWaistY + ph;
    const B = cut ? pointAtY(upper, yB) : sideWaist;
    const o = new Outline(A);
    o.line('waist', cTop, d);
    o.line('crotch', P(hip, yH * (front ? 0.75 : 0.85)));
    o.quad('crotch', P(hip + (front ? 0 : 5), crotchY), C, 10);
    const short = OS <= yK;
    const innerHem = P(crease + halfAt(OS), OS);
    if (short)
      o.quad(
        'inseam',
        P(C.x - (C.x - innerHem.x) * 0.6, crotchY + (OS - crotchY) * 0.3),
        innerHem,
        6,
      );
    else {
      const kneeIn = P(crease + kneeHalf, yK);
      o.quad(
        'inseam',
        P(C.x - (C.x - kneeIn.x) * 0.65, crotchY + (yK - crotchY) * 0.35),
        kneeIn,
        8,
      );
      o.line('inseam', innerHem);
    }
    const outerHem = P(crease - halfAt(OS), OS);
    o.line('hem', outerHem);
    if (!short) o.line('outseam', P(crease - kneeHalf, yK));
    // Up the side: knee → hip → waist (a gentle hip curve).
    let shape;
    let sideFront: { outline: P[]; edges: PatternEdge[] } | null = null;
    if (cut) {
      o.poly(
        'outseam',
        upper.filter((p) => p.y > yB + 0.5),
      );
      o.line('outseam', B);
      if (pocketCut === 'scoop')
        o.quad('pocket', P(A.x + (B.x - A.x) * 0.05 + 10, B.y - 10), lerp(B, A, 0.985), 8);
      shape = o.close('pocket');
      // Side front (pocket facing + back of the bag): waist A → side waist → down the side seam.
      const yC = yB + (ctx.kids ? 45 : 60);
      const below = yC <= upper[0]!.y ? pointAtY(upper, yC) : P(upper[0]!.x, yC);
      const sideDown = [...upper].reverse().filter((p) => p.y < yB - 0.5);
      const sf = new Outline(A);
      sf.line('waist', sideWaist);
      sf.poly('outseam', sideDown.slice(1));
      sf.line('outseam', B);
      sf.line('outseam_under', P(Math.min(B.x, below.x), yC));
      sf.line('bag', P(A.x + 25, yC));
      sideFront = sf.close('bag');
    } else {
      const hipSide = upper[0]!;
      o.line('outseam', hipSide);
      o.poly('outseam', upper.slice(1, -1));
      shape = o.close('outseam');
    }
    const marks = [];
    if (d) {
      const n = front ? 1 : d > 22 ? 2 : 1;
      const each = d / n;
      for (let i = 0; i < n; i++) {
        const t = front ? 0.5 : n === 1 ? 0.5 : 0.35 + i * 0.3;
        const a = P(
          sideWaist.x + (cTop.x - sideWaist.x) * t,
          sideWaistY + (cTop.y - sideWaistY) * t,
        );
        marks.push(
          front
            ? mark('pleat', [P(a.x - each / 2, a.y), P(a.x + each / 2, a.y)], 'pleat / dart')
            : dart(
                P(a.x - each / 2, a.y),
                P(a.x, a.y + 120 - i * 15),
                P(a.x + each / 2, a.y),
                'dart',
              ),
        );
      }
    }
    if (gathered && !front)
      marks.push(
        mark(
          'gather',
          [P(sideWaist.x + 20, sideWaistY + 8), P(cTop.x - 20, cTop.y + 8)],
          'elastic',
        ),
      );
    if (front && pleat && !gathered) {
      // Pleats folded towards the side, the first on the crease.
      marks.length = 0;
      const n = style.pleats === 'double' ? 2 : 1;
      const each = pleat / n;
      for (let i = 0; i < n; i++) {
        const x = crease - i * (each + 25);
        const yAt =
          sideWaistY + ((cTop.y - sideWaistY) * (x - sideWaist.x)) / (cTop.x - sideWaist.x);
        marks.push(
          mark(
            'pleat',
            [P(x - each, yAt), P(x, yAt)],
            i === 0 ? `${n} pleat${n > 1 ? 's' : ''}` : null,
          ),
        );
      }
    }
    const sideFrontOutseam = sideFront
      ? edgeLength(
          sideFront.outline,
          sideFront.edges.find((e) => e.name === 'outseam')!,
        )
      : 0;
    return {
      shape,
      sideFront,
      A,
      crease,
      marks,
      C,
      cTop,
      sideWaist,
      crotchY,
      outseam:
        edgeLength(
          shape.outline,
          shape.edges.find((e) => e.name === 'outseam')!,
        ) + sideFrontOutseam,
      q,
      d,
    };
  };

  const f = leg(true, 0);
  let b = leg(false, 0);
  // The back crease sits on the back hip; a cut-in pocket keeps the outseams matched below.
  // Match the outseams by moving the back side-waist point.
  const diff = f.outseam - b.outseam;
  if (Math.abs(diff) > 0.5) b = leg(false, -diff);

  const marksF = [...f.marks];
  if (style.cargoPockets) {
    const cw = ctx.kids ? 130 : 180;
    const cy = f.crotchY + (ctx.kids ? 40 : 60);
    const x0 = Math.min(0, f.crease - cw * 1.1);
    marksF.push(
      mark(
        'placement',
        [
          P(x0 + 10, cy),
          P(x0 + 10 + cw, cy),
          P(x0 + 10 + cw, cy + cw * 1.1),
          P(x0 + 10, cy + cw * 1.1),
          P(x0 + 10, cy),
        ],
        'cargo pocket',
      ),
    );
  }
  if (style.closure === 'fly_zip')
    marksF.push(mark('zip', [P(f.cTop.x, 5), P(f.cTop.x + 2, 180)], 'fly zip'));
  if (style.closure === 'side_zip')
    marksF.push(
      mark(
        'zip',
        [P(f.shape.outline[0]!.x, 5), P(f.shape.outline[0]!.x - 3, 180)],
        'zip on the left side seam',
      ),
    );
  const pieces: DraftPiece[] = [
    piece('trouser_front', 'Front leg', f.shape, {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(f.crease, CD + 40), to: P(f.crease, OS - 60) },
      notches: [P(fH, yH * 0.75)],
      markings: [...marksF, mark('line', [P(f.crease, 0), P(f.crease, OS)], 'crease line')],
      inputs: { hip: fH, crotchExtension: fx, rise: CD, outseam: OS },
    }),
    piece('trouser_back', 'Back leg', b.shape, {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(b.crease, CD + 40), to: P(b.crease, OS - 60) },
      notches: [P(bH, yH * 0.85 - 6), P(bH, yH * 0.85 + 6)],
      markings: [
        ...b.marks,
        ...backPocketMarks(ctx, b.sideWaist, b.cTop),
        mark('line', [P(b.crease, 0), P(b.crease, OS)], 'crease line'),
      ],
      inputs: { hip: bH, crotchExtension: bx, rise: CD + 10, outseam: OS },
    }),
  ];
  if (style.closure === 'fly_zip') {
    const len = ctx.kids ? 130 : 190;
    pieces.push(
      piece(
        'fly_facing',
        'Fly facing',
        new Outline(P(0, 0))
          .line('top', P(40, 0))
          .line('side', P(40, len - 30))
          .quad('bottom', P(40, len), P(0, len), 6)
          .close('cf'),
        {
          cutQuantity: 1,
          grainline: { from: P(20, 20), to: P(20, len - 40) },
          notes: ['Cut 1 + 1 interfacing'],
        },
      ),
      piece(
        'fly_shield',
        'Fly shield',
        new Outline(P(0, 0))
          .line('top', P(90, 0))
          .line('side', P(90, len))
          .line('bottom', P(0, len))
          .close('fold'),
        {
          cutQuantity: 1,
          foldLine: { from: P(45, 0), to: P(45, len) },
          grainline: { from: P(20, 20), to: P(20, len - 20) },
          notes: ['Cut 1; fold lengthwise'],
        },
      ),
    );
  }
  if (turnUpDepth(ctx))
    for (const p of pieces.slice(0, 2)) {
      p.allowances = { hem: turnUpDepth(ctx) * 2 + 15 };
      p.notes.push(
        `Turn-ups: hem allowance ${turnUpDepth(ctx) * 2 + 15} mm (fold up ${turnUpDepth(ctx)} mm twice)`,
      );
    }
  const pocketPieces: DraftPiece[] = [];
  if (f.sideFront) {
    pocketPieces.push(
      piece('side_front', 'Side front (pocket facing)', f.sideFront, {
        cutQuantity: 2,
        mirrored: true,
        grainline: { from: P(f.sideWaist.x + 20, 30), to: P(f.sideWaist.x + 20, 120) },
        notes: ['Cut 2 (pair) in main fabric — the back of the pocket'],
      }),
    );
    pocketPieces.push(
      frontPocketBag(
        ctx,
        style.pockets === 'scoop',
        ctx.kids ? 35 : 45,
        Math.min(ctx.kids ? 120 : 165, yH - 15),
      ),
    );
  }
  // Finished waist: front side front + leg (minus darts / pleats) + back, both sides.
  const sfWaist = f.sideFront
    ? edgeLength(
        f.sideFront.outline,
        f.sideFront.edges.find((e) => e.name === 'waist')!,
      )
    : 0;
  const legWaist = (x: typeof f) =>
    edgeLength(
      x.shape.outline,
      x.shape.edges.find((e) => e.name === 'waist')!,
    ) - x.d;
  const frontWaist = legWaist(f) + sfWaist;
  const backWaist = legWaist(b);
  const waist = 2 * (frontWaist + backWaist);
  return {
    pieces,
    waist,
    frontWaist,
    backWaist,
    pocketPieces,
    back: { sideWaist: b.sideWaist, cTop: b.cTop },
    front: { sideWaist: f.sideWaist, cTop: f.cTop, crotchY: f.crotchY },
  };
}

/** Turn-up depth for the option (0 = none). */
export function turnUpDepth(ctx: Ctx): number {
  return ctx.style.turnUps ? (ctx.kids ? 25 : 40) : 0;
}

/** First point where a polyline (walked in order) reaches height y, interpolated. */
function pointAtY(pts: readonly P[], y: number): P {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if ((a.y - y) * (b.y - y) <= 0 && a.y !== b.y) return lerp(a, b, (y - a.y) / (b.y - a.y));
  }
  return pts[pts.length - 1]!;
}

/** Back pocket placement on the back leg (between the dart and the side seam). */
function backPocketMarks(ctx: Ctx, sideWaist: P, cTop: P) {
  const st = ctx.style;
  if (st.backPockets === 'none') return [];
  const w = ctx.kids ? 100 : 140;
  const h = ctx.kids ? 110 : 155;
  const down = ctx.kids ? 45 : 65;
  const centres = st.backPocketCount === 2 ? [0.5] : [0.5];
  return centres.flatMap((t) => {
    const c = lerp(sideWaist, cTop, t);
    const y = c.y + down;
    return st.backPockets === 'welt'
      ? [mark('placement', [P(c.x - w / 2, y), P(c.x + w / 2, y)], 'welt pocket opening')]
      : [
          mark(
            'placement',
            [
              P(c.x - w / 2, y),
              P(c.x + w / 2, y),
              P(c.x + w / 2, y + h),
              P(c.x - w / 2, y + h),
              P(c.x - w / 2, y),
            ],
            'back patch pocket',
          ),
        ];
  });
}

/** Pocket bag for a slant or scoop pocket (the opening edge matches the cut on the leg). */
function frontPocketBag(ctx: Ctx, scoop: boolean, pw: number, ph: number): DraftPiece {
  const bw = ctx.kids ? 140 : 190;
  const bh = ctx.kids ? 200 : 270;
  const o = new Outline(P(pw, 0));
  o.line('top', P(bw, 0))
    .line('bag', P(bw, bh - 40))
    .quad('bag', P(bw, bh), P(bw - 40, bh), 4);
  o.line('bag', P(30, bh))
    .quad('bag', P(0, bh), P(0, bh - 40), 4)
    .line('side', P(0, ph));
  if (scoop)
    o.quad('opening', P(pw * 0.2 + 10, ph * 0.1 - 10 + ph * 0.1), P(pw * 0.985, ph * 0.015), 8);
  return piece('pocket_bag_front', 'Pocket bag', o.close('opening'), {
    cutQuantity: 2,
    mirrored: true,
    fabricRole: 'lining',
    grainline: { from: P(bw * 0.55, 30), to: P(bw * 0.55, bh - 40) },
    notes: ['Cut 2 (pair) in pocketing; sewn to the pocket opening and the side front'],
  });
}
