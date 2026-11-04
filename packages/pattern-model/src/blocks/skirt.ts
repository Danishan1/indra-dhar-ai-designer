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
 * Skirt blocks (ADR-058): half front and half back on the fold. Straight/pencil/A-line/flared are
 * drafted from waist, hip and waist-to-hip with darts and side shaping; gathered skirts are
 * rectangles; half and full circles are sectors whose waist arc equals the waist.
 */

export interface SkirtInput {
  /** Finished half waists to match (dress bodice); omitted → from the body + ease. */
  frontWaist?: number;
  backWaist?: number;
  /** Dress skirts never have their own waistband. */
  forDress?: boolean;
  /** Button extension of the bodice (shirt dresses). */
  extension?: number;
}

export interface SkirtResult {
  pieces: DraftPiece[];
  /** Finished full waist of the skirt (for the waistband). */
  waist: number;
}

export function draftSkirt(ctx: Ctx, input: SkirtInput = {}): SkirtResult {
  const { m, style, ease } = ctx;
  const W = m.waist + (input.forDress ? ease.waist : Math.min(ease.waist, 20));
  const H = m.hip + ease.hip;
  const wh = m.waist_to_hip;
  const L = lengthFor(ctx, 'skirt');
  const qwF = input.frontWaist ?? W / 4 + 5;
  const qwB = input.backWaist ?? W / 4 - 5;
  const qhF = H / 4 + 5;
  const qhB = H / 4 - 5;
  const shape = style.skirt;
  const backZip = style.closure === 'back_zip';
  const sideZip = style.closure === 'side_zip' || (!input.forDress && style.closure === 'none');
  const prefix = input.forDress ? 'skirt' : 'skirt';
  const nameF = input.forDress ? 'Skirt front' : 'Front';
  const nameB = input.forDress ? 'Skirt back' : 'Back';
  const pieces: DraftPiece[] = [];
  /** Dress opening all the way down (shirt dress): extension + grown-on facing on the skirt front. */
  const opening =
    input.forDress && style.closure === 'front_buttons'
      ? { ext: input.extension ?? 15, facing: ctx.kids ? 45 : 60 }
      : null;

  if (shape === 'circle' || shape === 'half_circle') {
    const full = 2 * (qwF + qwB); // whole waist
    const fraction = shape === 'circle' ? 1 : 0.5;
    const r = full / (2 * Math.PI * fraction);
    const at = (rad: number, a: number) => P(rad * Math.sin(a), rad * Math.cos(a) - r);
    for (const front of [true, false]) {
      // The drawn half piece (cut on the fold) carries its own half waist.
      const sweep = (front ? qwF : qwB) / r;
      const steps = 16;
      const waist = Array.from({ length: steps + 1 }, (_, i) => at(r, (sweep * i) / steps));
      const hem = Array.from({ length: steps + 1 }, (_, i) => at(r + L, sweep * (1 - i / steps)));
      const o = new Outline(waist[0]!);
      o.poly('waist', waist.slice(1)).line('side', hem[0]!).poly('hem', hem.slice(1));
      const s = o.close(front ? 'cf' : 'cb');
      const split = !front && backZip;
      pieces.push(
        piece(`${prefix}_${front ? 'front' : 'back'}`, front ? nameF : nameB, s, {
          cutQuantity: split ? 2 : 1,
          mirrored: split,
          foldLine: split ? null : { from: waist[0]!, to: hem[steps]! },
          grainline: { from: at(r + 40, sweep * 0.02), to: at(r + L - 40, sweep * 0.02) },
          markings: zipMarks(front, backZip, sideZip, input.forDress, s.outline, 0),
          notes: [
            `${shape === 'circle' ? 'Full' : 'Half'} circle: waist radius ${Math.round(r)} mm`,
            'Let it hang 24 h before hemming',
          ],
          inputs: { radius: r, length: L },
        }),
      );
    }
    return { pieces, waist: full };
  }

  if (shape === 'gathered') {
    const ratio = style.gatherRatio;
    for (const front of [true, false]) {
      const qw = front ? qwF : qwB;
      const w = Math.max(qw * ratio, front ? qhF + 30 : qhB + 30);
      const o = new Outline(P(0, 0));
      o.line('waist', P(w, 0)).line('side', P(w, L)).line('hem', P(0, L));
      let s = o.close(front ? 'cf' : 'cb');
      s.edges.find((e) => e.name === 'waist')!.intakeMm = w - qw;
      if (front && opening) s = withOpening(s, opening);
      const split = (!front && backZip) || (front && !!opening);
      pieces.push(
        piece(`${prefix}_${front ? 'front' : 'back'}`, front ? nameF : nameB, s, {
          cutQuantity: split ? 2 : 1,
          mirrored: split,
          foldLine: split ? null : { from: P(0, 0), to: P(0, L) },
          grainline: { from: P(w * 0.5, 40), to: P(w * 0.5, L - 40) },
          markings: [
            mark('gather', [P(15, 0), P(w - 15, 0)], `gather to ${Math.round(qw)} mm`),
            ...zipMarks(front, backZip, sideZip, input.forDress, s.outline, w),
            ...(front && opening ? openingMarks(opening, L, style.buttons) : []),
          ],
          inputs: { gatherRatio: ratio, length: L },
        }),
      );
    }
    return { pieces, waist: 2 * (qwF + qwB) };
  }

  for (const front of [true, false]) {
    const qw = front ? qwF : qwB;
    const qh = front ? qhF : qhB;
    const excess = Math.max(0, qh - qw);
    const dartShare = shape === 'flared' ? 0 : shape === 'a_line' ? 0.3 : front ? 0.45 : 0.55;
    const darts =
      style.darts || !input.forDress ? clamp(excess * dartShare, 0, front ? 30 : 50) : 0;
    const side = excess - darts;
    const below = Math.max(0, L - wh);
    const hemX =
      shape === 'pencil'
        ? qh - (ctx.kids ? 10 : 25)
        : shape === 'a_line'
          ? qh + below * 0.16
          : shape === 'flared'
            ? qh + below * 0.38
            : qh;
    const rise = shape === 'flared' ? 18 : 10;
    const waistSide = P(qw + darts, -rise * clamp(side / 40, 0.3, 1));
    const o = new Outline(P(0, 0));
    o.quad('waist', P(waistSide.x * 0.6, 0), waistSide, 8);
    if (darts) o.intake('waist', darts);
    o.poly('side', quadPts(waistSide, P(qh, wh * 0.4), P(qh, wh), 8));
    if (L > wh) o.line('side', P(hemX, L));
    // Flared hems curve so the hem meets the side seam at a right angle.
    if (shape === 'flared' || shape === 'a_line')
      o.quad('hem', P(hemX * 0.5, L + (hemX - qh) * 0.12), P(0, L + (hemX - qh) * 0.06), 10);
    else o.line('hem', P(0, L));
    let s = o.close(front ? 'cf' : 'cb');
    if (front && opening) s = withOpening(s, opening);
    const marks = [];
    if (darts) {
      const n = front ? 1 : darts > 25 ? 2 : 1;
      const each = darts / n;
      for (let i = 0; i < n; i++) {
        const x = front ? Math.min(90, qw * 0.45) : qw * (n === 1 ? 0.45 : 0.33 + i * 0.3);
        const len = front ? 90 : 130 - i * 20;
        marks.push(dart(P(x - each / 2, 0), P(x, len), P(x + each / 2, 0), 'dart'));
      }
    }
    const split = (!front && backZip) || (front && !!opening);
    if (front && opening) marks.push(...openingMarks(opening, L, style.buttons));
    pieces.push(
      piece(`${prefix}_${front ? 'front' : 'back'}`, front ? nameF : nameB, s, {
        cutQuantity: split ? 2 : 1,
        mirrored: split,
        foldLine: split ? null : { from: P(0, 0), to: P(0, L) },
        grainline: { from: P(qw * 0.5, 60), to: P(qw * 0.5, L - 60) },
        markings: [...marks, ...zipMarks(front, backZip, sideZip, input.forDress, s.outline, qh)],
        notches: [P(qh, wh)],
        inputs: { length: L, waist: qw, hip: qh },
      }),
    );
  }
  return { pieces, waist: 2 * (qwF + qwB) };
}

function zipMarks(
  front: boolean,
  backZip: boolean,
  sideZip: boolean,
  dress: boolean | undefined,
  outline: readonly P[],
  sideX: number,
) {
  if (backZip && !front) return [mark('zip', [P(0, 0), P(0, dress ? 150 : 180)], 'invisible zip')];
  if (sideZip && front && !dress)
    return [mark('zip', [P(sideX, 5), P(sideX, 180)], 'zip on the left side seam')];
  void outline;
  return [];
}

/** Straight waistband for skirts and trousers (overlap for the button). */
export function draftWaistband(ctx: Ctx, waist: number): DraftPiece {
  const overlap = 35;
  const h = ctx.kids ? 30 : 38;
  const len = Math.round(waist + overlap);
  return piece(
    'waistband',
    'Waistband',
    new Outline(P(0, 0))
      .line('long', P(len, 0))
      .line('end', P(len, h * 2))
      .line('long_b', P(0, h * 2))
      .close('end_b'),
    {
      cutQuantity: 1,
      foldLine: { from: P(0, h), to: P(len, h) },
      grainline: { from: P(40, h * 0.5), to: P(len - 40, h * 0.5) },
      markings: [mark('buttonhole', [P(len - 15, h * 0.5)]), mark('button', [P(15, h * 0.5)])],
      notes: ['Cut 1 + 1 interfacing', `Includes ${overlap} mm overlap`],
      inputs: { waist, overlap, height: h },
    },
  );
}

export const waistOf = (p: DraftPiece) => {
  const e = p.edges.find((x) => x.name === 'waist');
  return e ? edgeLength(p.outline, e) - e.intakeMm : 0;
};

type Shape = {
  outline: P[];
  edges: { name: string; from: number; to: number; intakeMm: number }[];
};

/**
 * Adds a button extension and grown-on facing on the CF side of a half front whose outline starts
 * at the CF waist (0, 0) and closes along CF: the CF edge becomes extension → facing → front edge.
 */
function withOpening(s: Shape, o: { ext: number; facing: number }): Shape {
  const n = s.outline.length;
  const cf = s.edges.find((e) => e.name === 'cf')!;
  const hemPt = s.outline[cf.from]!;
  const pts = [
    ...s.outline,
    P(-o.ext, hemPt.y),
    P(-o.ext - o.facing, hemPt.y),
    P(-o.ext - o.facing, 0),
    P(-o.ext, 0),
  ];
  const edges = s.edges.filter((e) => e.name !== 'cf').map((e) => ({ ...e }));
  edges.push({ name: 'hem_ext', from: n - 1, to: n, intakeMm: 0 });
  edges.push({ name: 'facing', from: n, to: n + 1, intakeMm: 0 });
  edges.push({ name: 'front_edge', from: n + 1, to: n + 2, intakeMm: 0 });
  edges.push({ name: 'facing', from: n + 2, to: n + 3, intakeMm: 0 });
  edges.push({ name: 'waist_ext', from: n + 3, to: 0, intakeMm: 0 });
  return { outline: pts, edges };
}

function openingMarks(o: { ext: number }, L: number, buttons: number | null) {
  const count = buttons
    ? Math.max(2, Math.round(buttons / 2))
    : Math.max(2, Math.round((L - 160) / 100));
  const out = [mark('fold', [P(-o.ext, 0), P(-o.ext, L)], 'fold back facing')];
  for (let i = 0; i < count; i++)
    out.push(mark('button', [P(0, 60 + ((L - 220) * i) / Math.max(1, count - 1))]));
  return out;
}
