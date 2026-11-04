import {
  clamp,
  dart,
  type DraftPiece,
  edgeLength,
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
  waist: number;
}

const KNEE_EASE = { fitted: 80, regular: 120, relaxed: 170, oversized: 220 } as const;

export function draftTrousers(ctx: Ctx): TrouserResult {
  const { m, style } = ctx;
  const H = m.hip + ctx.ease.hip;
  const W = m.waist + Math.min(ctx.ease.waist, style.fit === 'fitted' ? 15 : 25);
  const fH = H / 4 - 10;
  const bH = H / 4 + 10;
  const fx = H / 16;
  const bx = H / 9;
  const riseEase = { fitted: 8, regular: 15, relaxed: 25, oversized: 35 }[style.fit];
  const CD = m.crotch_depth + riseEase;
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
    const q = front ? W / 4 - 5 : W / 4 + 5;
    const excess = Math.max(0, hip - q);
    const d = front ? clamp(excess * 0.3, 0, 20) : clamp(excess * 0.5, 0, 40);
    const cTop = front ? P(hip - 10, 0) : P(hip - 25, -25);
    const sideWaist = P(
      cTop.x - Math.sqrt(Math.max(1, (q + d) ** 2 - (cTop.y - sideWaistY) ** 2)),
      sideWaistY,
    );

    const o = new Outline(sideWaist);
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
    const hipSide = P(Math.min(0, crease - halfAt(Math.max(crotchY, yH))), yH);
    o.line('outseam', hipSide);
    o.poly(
      'outseam',
      quadPts(hipSide, P(hipSide.x, yH * 0.35 + sideWaistY * 0.65), sideWaist, 8).slice(0, -1),
    );
    const shape = o.close('outseam');
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
    return {
      shape,
      crease,
      marks,
      C,
      cTop,
      outseam: edgeLength(
        shape.outline,
        shape.edges.find((e) => e.name === 'outseam')!,
      ),
      q,
    };
  };

  const f = leg(true, 0);
  let b = leg(false, 0);
  // Match the outseams by moving the back side-waist point.
  const diff = f.outseam - b.outseam;
  if (Math.abs(diff) > 0.5) b = leg(false, -diff);

  const marksF = [...f.marks];
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
      markings: [...b.marks, mark('line', [P(b.crease, 0), P(b.crease, OS)], 'crease line')],
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
  const waist = 2 * (f.q + b.q);
  return { pieces, waist };
}
