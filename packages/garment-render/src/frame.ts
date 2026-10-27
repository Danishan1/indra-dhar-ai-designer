/**
 * The garment frame: measurements shared by several components (neck, shoulders, armholes, hem,
 * sleeves), derived once per render from the body, neckline, sleeve, cuff and hem properties.
 *
 * Canonical half coordinates: everything is computed for the half on the viewer's right (x > 0) and
 * mirrored with `sideSign` when drawn. Front view: the wearer's left is on the viewer's right; back
 * view: the wearer's right is.
 */
import type { DesignComponent, GarmentDesignState } from '@ai-designer/garment-model';

import { add, mirror, pt, sampleQuad, scale, unit } from './geometry.js';
import { ParamReader } from './params.js';
import {
  HemTypes,
  type HemType,
  type RenderTemplate,
  Silhouettes,
  SleeveTypes,
  type SleeveType,
} from './registry.js';
import type { Point, View } from './types.js';

export type WearerSide = 'left' | 'right';

export const NecklineTypes = ['crew', 'v_neck', 'scoop', 'henley', 'boat'] as const;
export type NecklineType = (typeof NecklineTypes)[number];

export interface SleeveFrame {
  componentId: string;
  type: Exclude<SleeveType, 'sleeveless'>;
  length: number;
  /** Outer attach point (shoulder end). */
  shoulder: Point;
  /** Raglan seam start on the neckline (raglan only). */
  raglanTop: Point | null;
  under: Point;
  endTop: Point;
  endBottom: Point;
  /** Unit vector down the sleeve. */
  dir: Point;
  cuffId: string | null;
  cuffWidth: number;
  /** A hem component finishing the sleeve end (knits). */
  hemId: string | null;
  hemType: HemType;
  hemDepth: number;
}

export interface ArmFrame {
  type: SleeveType;
  shoulder: Point;
  under: Point;
  sleeve: SleeveFrame | null;
}

export interface Frame {
  template: RenderTemplate;
  /** Half neck width. */
  nh: number;
  /** y of the high point shoulder (negative: origin is the centre-front neck point). */
  hpsY: number;
  neckline: NecklineType;
  backNeckY: number;
  chestHalf: number;
  hemHalf: number;
  hemY: number;
  hemSideY: number;
  hemType: HemType;
  hemDepth: number;
  hemId: string | null;
  arms: Record<WearerSide, ArmFrame>;
  /** Parameters drawn with defaults, per component. */
  placeholders: Map<string, string[]>;
  /** Stable keys of the numbers above, split so a sleeve change does not redraw the body. */
  keys: { torso: string; arms: string; sleeve: Record<WearerSide, string> };
}

/** +1 when the wearer's `side` is on the viewer's right in `view`. */
export function sideSign(side: string, view: View): 1 | -1 {
  const left = side !== 'right';
  return (view === 'front') === left ? 1 : -1;
}

/** The wearer's side drawn on the viewer's right in `view`. */
export const rightHalfSide = (view: View): WearerSide => (view === 'front' ? 'left' : 'right');

const SILHOUETTE_FACTOR: Record<(typeof Silhouettes)[number], number> = {
  slim: 0.93,
  regular: 1,
  relaxed: 1.05,
  oversized: 1.1,
  boxy: 1.02,
};

const first = (
  state: GarmentDesignState,
  type: string,
  pred: (c: DesignComponent) => boolean = () => true,
) => state.components.find((c) => c.componentType === type && pred(c));

/** Sleeve angle from vertical: long sleeves hang closer to the body. */
function sleeveAngle(length: number, type: string): number {
  const t = Math.min(1, Math.max(0, (length - 250) / 300));
  const deg = 55 - 35 * t + (type === 'dolman' ? 6 : 0);
  return (deg * Math.PI) / 180;
}

export function buildFrame(state: GarmentDesignState, template: RenderTemplate): Frame {
  const d = template.defaults;
  const placeholders = new Map<string, string[]>();
  const note = (c: DesignComponent | undefined, r: ParamReader) => {
    if (c && r.placeholders.length)
      placeholders.set(c.componentId, [
        ...(placeholders.get(c.componentId) ?? []),
        ...r.placeholders,
      ]);
  };

  const body = first(state, 'garment_body');
  const b = new ParamReader(body);
  const chestHalf = b.length('dimension.chest_width', d.chestWidth, 300, 900) / 2;
  const shoulderHalf = Math.min(
    chestHalf * 0.98,
    b.length('dimension.shoulder_width', d.shoulderWidth, 250, 800) / 2,
  );
  const bodyLength = b.length('dimension.body_length', d.bodyLength, 300, 1400);
  const silhouette = body ? b.choice('appearance.silhouette', Silhouettes, 'regular') : 'regular';
  note(body, b);

  const necklineC = first(state, 'neckline');
  const n = new ParamReader(necklineC);
  let neckline: NecklineType = 'crew';
  let neckWidth = d.neckWidth;
  let frontDepth = d.frontNeckDepth;
  if (necklineC) {
    neckline = n.choice('construction.neckline_type', NecklineTypes, 'crew');
    neckWidth = n.length('dimension.neckline_width', d.neckWidth, 120, 400);
    if (neckline === 'scoop') frontDepth = d.frontNeckDepth * 1.6;
    if (neckline === 'v_neck') frontDepth = d.frontNeckDepth * 1.9;
    if (neckline === 'boat') {
      neckWidth = Math.max(neckWidth, d.neckWidth * 1.5);
      frontDepth = d.frontNeckDepth * 0.4;
    }
    note(necklineC, n);
  }
  const nh = Math.min(neckWidth / 2, shoulderHalf - 40);
  const hpsY = -frontDepth;
  const backNeckY = hpsY + d.backNeckDepth;
  const armY = hpsY + d.armholeDepth;

  const bodyIds = new Set(
    state.components
      .filter((c) =>
        ['garment_body', 'front_body_panel', 'back_body_panel'].includes(c.componentType),
      )
      .map((c) => c.componentId),
  );
  const hemC =
    first(state, 'hem', (c) => c.parentComponentId !== null && bodyIds.has(c.parentComponentId)) ??
    first(state, 'hem', (c) => c.parentComponentId === null);
  const h = new ParamReader(hemC);
  const hemType = hemC
    ? h.choice('construction.hem_type', HemTypes, template.defaultHemType)
    : 'straight';
  const hemDepth = hemC ? h.length('dimension.hem_depth', d.hemDepth, 0, 120) : 0;
  note(hemC, h);
  const hemY = hpsY + bodyLength;
  const hemHalf = chestHalf * SILHOUETTE_FACTOR[silhouette];
  const hemSideY = hemType === 'shirt_tail' ? hemY - Math.min(80, bodyLength * 0.09) : hemY;

  const arm = (side: WearerSide): ArmFrame => {
    const sleeveC = first(state, 'sleeve', (c) => (c.side === 'right' ? 'right' : 'left') === side);
    const s = new ParamReader(sleeveC);
    const type: SleeveType = sleeveC
      ? s.choice('construction.sleeve_type', SleeveTypes, template.defaultSleeveType)
      : 'sleeveless';
    let shoulder = pt(shoulderHalf, hpsY + d.shoulderDrop);
    let under = pt(chestHalf, armY);
    if (type === 'drop_shoulder') {
      shoulder = add(shoulder, pt(45, 14));
      under = add(under, pt(0, 35));
    }
    if (type === 'dolman') under = pt(chestHalf - 8, armY + 120);
    if (type === 'sleeveless') shoulder = pt(shoulderHalf - 30, hpsY + d.shoulderDrop - 6);
    let sleeve: SleeveFrame | null = null;
    if (sleeveC && type !== 'sleeveless') {
      const length = s.length('dimension.sleeve_length', d.sleeveLength, 40, 900);
      const a = sleeveAngle(length, type);
      const dir = pt(Math.sin(a), Math.cos(a));
      const inward = pt(-Math.cos(a), Math.sin(a));
      const opening =
        type === 'dolman'
          ? d.sleeveOpening * 0.9
          : Math.min(d.sleeveOpening, Math.max(60, length * 0.9));
      const endTop = add(shoulder, scale(dir, length));
      const endBottom = add(endTop, scale(inward, opening));
      const cuffC = first(state, 'cuff', (c) => c.parentComponentId === sleeveC.componentId);
      let cuffWidth = 0;
      if (cuffC) {
        const cr = new ParamReader(cuffC);
        cuffWidth = cr.length(
          'dimension.cuff_width',
          d.cuffWidth || 60,
          10,
          Math.max(20, length * 0.5),
        );
        note(cuffC, cr);
      }
      const sleeveHemC = first(state, 'hem', (c) => c.parentComponentId === sleeveC.componentId);
      let sleeveHemType: HemType = 'single_fold';
      let sleeveHemDepth = 0;
      if (sleeveHemC) {
        const hr = new ParamReader(sleeveHemC);
        sleeveHemType = hr.choice('construction.hem_type', HemTypes, template.defaultHemType);
        sleeveHemDepth = hr.length(
          'dimension.hem_depth',
          d.hemDepth,
          0,
          Math.max(10, length * 0.4),
        );
        note(sleeveHemC, hr);
      }
      sleeve = {
        componentId: sleeveC.componentId,
        hemId: sleeveHemC?.componentId ?? null,
        hemType: sleeveHemType,
        hemDepth: sleeveHemDepth,
        type,
        length,
        shoulder,
        raglanTop: type === 'raglan' ? raglanTop({ nh, hpsY }) : null,
        under,
        endTop,
        endBottom,
        dir: unit(dir),
        cuffId: cuffC?.componentId ?? null,
        cuffWidth,
      };
    }
    note(sleeveC, s);
    return { type, shoulder, under, sleeve };
  };

  const arms = { left: arm('left'), right: arm('right') };
  const frame: Omit<Frame, 'keys'> = {
    template,
    nh,
    hpsY,
    neckline,
    backNeckY,
    chestHalf,
    hemHalf,
    hemY,
    hemSideY,
    hemType,
    hemDepth,
    hemId: hemC?.componentId ?? null,
    arms,
    placeholders,
  };
  const armShape = (a: ArmFrame) => [a.type, a.shoulder, a.under];
  const keys = {
    torso: JSON.stringify([
      template.key,
      nh,
      hpsY,
      neckline,
      backNeckY,
      chestHalf,
      hemHalf,
      hemY,
      hemSideY,
      hemType,
      hemDepth,
    ]),
    arms: JSON.stringify([armShape(arms.left), armShape(arms.right)]),
    sleeve: { left: JSON.stringify(arms.left.sleeve), right: JSON.stringify(arms.right.sleeve) },
  };
  return { ...frame, keys };
}

// ── shared outlines (canonical right half) ────────────────────────────────────

/** Front neck from the high point shoulder down to the centre-front neck point. */
export function frontNeckHalf(f: Frame): Point[] {
  const hps = pt(f.nh, f.hpsY);
  if (f.neckline === 'v_neck') return [hps, pt(0, 0)];
  const ctrlX = f.neckline === 'boat' ? f.nh * 0.65 : f.nh * 0.92;
  return sampleQuad(hps, pt(ctrlX, 0), pt(0, 0), 12);
}

export function backNeckHalf(f: Frame): Point[] {
  return sampleQuad(pt(f.nh, f.hpsY), pt(f.nh * 0.7, f.backNeckY), pt(0, f.backNeckY), 10);
}

export const raglanTop = (f: Pick<Frame, 'nh' | 'hpsY'>): Point => pt(f.nh + 14, f.hpsY + 8);
/** Control point of the raglan seam (neck → underarm). */
export const raglanCtrl = (f: Pick<Frame, 'nh' | 'hpsY'>, a: Pick<ArmFrame, 'under'>): Point => {
  const t = raglanTop(f);
  return pt((t.x + a.under.x) / 2 + 12, (t.y + a.under.y) / 2 - 10);
};

/** Armhole from the shoulder point to the underarm. */
export function armholeHalf(a: ArmFrame): Point[] {
  const inset = a.type === 'sleeveless' ? 34 : a.type === 'dolman' ? 0 : 18;
  const ctrl = pt(Math.min(a.shoulder.x, a.under.x) - inset, (a.shoulder.y + a.under.y) / 2 + 20);
  return sampleQuad(a.shoulder, ctrl, a.under, 10);
}

/** Hem from the side seam to the centre line. */
export function hemHalfPoints(f: Frame): Point[] {
  const side = pt(f.hemHalf, f.hemSideY);
  if (f.hemType !== 'shirt_tail') return [side, pt(0, f.hemY)];
  return sampleQuad(side, pt(f.hemHalf * 0.5, f.hemY + 2), pt(0, f.hemY), 14);
}

/** One half of the torso outline, from the neck centre to the hem centre. */
export function torsoHalf(f: Frame, view: View, side: WearerSide): Point[] {
  const a = f.arms[side];
  const neck = (view === 'front' ? frontNeckHalf(f) : backNeckHalf(f)).slice().reverse();
  const sideSeam = [a.under, pt(f.hemHalf, f.hemSideY)];
  const armhole =
    a.type === 'raglan'
      ? sampleQuad(raglanTop(f), raglanCtrl(f, a), a.under, 10)
      : [a.shoulder, ...armholeHalf(a).slice(1)];
  return [...neck, ...armhole, ...sideSeam.slice(1), ...hemHalfPoints(f).slice(1)];
}

/** Closed torso outline for a view (viewer-right half, then the mirrored viewer-left half). */
export function torsoOutline(f: Frame, view: View): Point[] {
  const right = torsoHalf(f, view, rightHalfSide(view));
  const otherSide: WearerSide = rightHalfSide(view) === 'left' ? 'right' : 'left';
  const left = torsoHalf(f, view, otherSide).map(mirror).reverse();
  return [...right, ...left.slice(1, -1)];
}

/** Full hem edge, viewer-left to viewer-right. */
export function hemEdge(f: Frame): Point[] {
  const half = hemHalfPoints(f);
  return [...half.map(mirror), ...half.slice().reverse().slice(1)];
}
