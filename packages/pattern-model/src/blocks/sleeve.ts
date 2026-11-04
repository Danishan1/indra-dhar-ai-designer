import {
  clamp,
  cubicPts,
  type DraftPiece,
  edgeLength,
  mark,
  Outline,
  P,
  piece,
  polyLength,
  solve,
} from './geom.js';
import { type Ctx, sleeveLengthFor } from './resolve.js';

/**
 * Sleeve block drafted to the bodice armhole (ADR-058): the cap height comes from the fit, the
 * sleeve width is solved so the cap seam equals the armhole plus the right amount of cap ease;
 * length, hem width and style (puff, bishop, flared) follow the style options.
 */

export interface SleeveResult {
  pieces: DraftPiece[];
  capLength: number;
  hemLength: number;
}

const CAP_RATIO = { fitted: 0.3, straight: 0.26, puff: 0.32, bishop: 0.26, flared: 0.24 } as const;

export function capEaseRange(ctx: Ctx): [number, number] {
  const { style } = ctx;
  if (style.sleeveStyle === 'puff') return [20, 2000];
  if (ctx.knit) return [-12, 15];
  if (style.fit === 'oversized') return [-8, 20];
  if (style.fit === 'relaxed') return [0, 28];
  return style.sleeveStyle === 'fitted' ? [12, 45] : [5, 38];
}

export function draftSleeve(ctx: Ctx, armhole: { front: number; back: number }): SleeveResult {
  const { m, style } = ctx;
  const AH = armhole.front + armhole.back;
  const fitFactor = style.fit === 'oversized' ? 0.55 : style.fit === 'relaxed' ? 0.78 : 1;
  const knitFactor = ctx.knit
    ? 0.8
    : style.topType === 'shirt' && ctx.spec.family === 'top'
      ? 0.8
      : 1;
  let CH = AH * CAP_RATIO[style.sleeveStyle] * fitFactor * knitFactor;
  const [eLo, eHi] = capEaseRange(ctx);
  let capEase =
    style.sleeveStyle === 'puff'
      ? AH * (style.gatherRatio - 1) * 0.35
      : (eLo + Math.min(eHi, 40)) / 2;
  if (ctx.knit) capEase = 0;
  if (style.sleeveStyle === 'puff') CH *= 1.25;

  const cap = (hw: number) => {
    const back = cubicPts(P(0, CH), P(hw * 0.35, CH * 0.88), P(hw * 0.55, 0), P(hw, 0), 12);
    const front = cubicPts(P(hw, 0), P(hw * 1.45, 0), P(hw * 1.7, CH * 0.95), P(2 * hw, CH), 12);
    return {
      back,
      front,
      length: polyLength([P(0, CH), ...back]) + polyLength([P(hw, 0), ...front]),
    };
  };
  let hw = solve((x) => cap(x).length, AH + capEase, 40, 600);
  // Never narrower than the arm.
  const minHalf = (m.upper_arm + (ctx.knit ? 20 : 45)) / 2;
  if (hw < minHalf) hw = minHalf;
  const capPts = cap(hw);

  const L = sleeveLengthFor(ctx, CH);
  const arm = m.arm_length;
  const t = clamp((L - CH) / Math.max(1, arm - CH), 0, 1);
  const wristHalf = (m.wrist + 70) / 2;
  let hemHalf: number;
  switch (style.sleeveStyle) {
    case 'fitted':
      hemHalf = hw + (Math.max(wristHalf, hw * 0.55) - hw) * t;
      break;
    case 'puff':
      hemHalf = hw * 1.15;
      break;
    case 'bishop':
      hemHalf = hw * 1.25;
      break;
    case 'flared':
      hemHalf = hw * (1.2 + 0.4 * t);
      break;
    default:
      hemHalf = hw - (hw - Math.max(wristHalf, hw * 0.6)) * 0.6 * t;
  }
  if (style.fit === 'oversized' || style.fit === 'relaxed')
    hemHalf = Math.max(hemHalf, hw * 0.85 * (1 - 0.2 * t));

  const o = new Outline(P(0, CH));
  o.poly('cap', capPts.back)
    .poly('cap', capPts.front)
    .line('underarm_front', P(hw + hemHalf, L));
  o.line('hem', P(hw - hemHalf, L));
  const shape = o.close('underarm_back');
  const capLength = edgeLength(
    shape.outline,
    shape.edges.find((e) => e.name === 'cap')!,
  );
  const hemLength = hemHalf * 2;

  const pieces: DraftPiece[] = [];
  const markings = [];
  const notes: string[] = [];
  const gatherCap = style.sleeveStyle === 'puff';
  if (gatherCap) {
    markings.push(mark('gather', [capPts.back[3]!, P(hw, 0), capPts.front[8]!], 'gather the cap'));
    notes.push('Gather the cap between the marks to fit the armhole');
  }
  // Cuff / band.
  const cuffKind =
    style.cuff !== 'none'
      ? style.cuff
      : style.sleeveStyle === 'puff' || style.sleeveStyle === 'bishop'
        ? 'band'
        : 'none';
  if (cuffKind === 'shirt') {
    const cuffLen = m.wrist + 55;
    const overlap = 20;
    const depth = ctx.kids ? 45 : 60;
    const pleats = Math.max(0, hemLength - cuffLen);
    if (pleats > 0) shape.edges.find((e) => e.name === 'hem')!.intakeMm = pleats;
    markings.push(
      mark('line', [P(hw * 0.5, L), P(hw * 0.5, L - (ctx.kids ? 90 : 140))], 'sleeve placket slit'),
    );
    if (pleats > 0)
      markings.push(
        mark('pleat', [P(hw * 0.8, L), P(hw * 0.8 + Math.min(pleats, 30), L)], 'pleat'),
      );
    pieces.push(
      piece(
        'cuff',
        'Cuff',
        new Outline(P(0, 0))
          .line('top', P(cuffLen + overlap, 0))
          .line('end', P(cuffLen + overlap, depth * 2))
          .line('bottom', P(0, depth * 2))
          .close('end_b'),
        {
          cutQuantity: 2,
          foldLine: { from: P(0, depth), to: P(cuffLen + overlap, depth) },
          grainline: { from: P(30, depth), to: P(cuffLen - 10, depth) },
          markings: [
            mark('buttonhole', [P(cuffLen + overlap - 12, depth * 0.5)]),
            mark('button', [P(12, depth * 0.5)]),
          ],
          notes: [
            'Cut 2 + 2 interfacing; fold along the fold line',
            `Includes ${overlap} mm overlap`,
          ],
          inputs: { length: cuffLen, overlap, depth },
        },
      ),
    );
  } else if (cuffKind === 'band') {
    const atLength =
      style.sleeve === 'long'
        ? m.wrist + 40
        : m.upper_arm * (style.sleeve === 'short' || style.sleeve === 'cap' ? 1 : 0.85) + 30;
    const depth = 30;
    const gather = Math.max(0, hemLength - atLength);
    shape.edges.find((e) => e.name === 'hem')!.intakeMm = gather;
    if (gather > 0)
      markings.push(
        mark('gather', [P(hw - hemHalf + 20, L), P(hw + hemHalf - 20, L)], 'gather into the band'),
      );
    pieces.push(
      piece(
        'sleeve_band',
        'Sleeve band',
        new Outline(P(0, 0))
          .line('top', P(atLength, 0))
          .line('end', P(atLength, depth * 2))
          .line('bottom', P(0, depth * 2))
          .close('end_b'),
        {
          cutQuantity: 2,
          foldLine: { from: P(0, depth), to: P(atLength, depth) },
          grainline: { from: P(20, depth), to: P(atLength - 20, depth) },
          notes: ['Cut 2; fold along the fold line'],
          inputs: { length: atLength, depth },
        },
      ),
    );
  }
  pieces.unshift(
    piece('sleeve', 'Sleeve', shape, {
      cutQuantity: 2,
      mirrored: true,
      grainline: { from: P(hw, CH + 20), to: P(hw, L - 30) },
      notches: [P(hw, 0), capPts.front[6]!, capPts.back[5]!, capPts.back[6]!],
      markings,
      notes: [...notes, 'Single notch = front, double notch = back'],
      inputs: { capHeight: CH, bicep: hw * 2, length: L, capEase: capLength - AH },
    }),
  );
  return { pieces, capLength, hemLength };
}
