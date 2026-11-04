import {
  type BodyMeasurementKey,
  type PatternSpec,
  type PatternSpecInput,
  patternSpecSchema,
  type PatternStyle,
  type PatternStyleInput,
} from '@ai-designer/garment-model';

import { measurementsFor } from './sizes.js';

/** Everything the blocks need, resolved once: measurements (chart + overrides), ease, lengths. */
export interface Ctx {
  spec: PatternSpec;
  style: PatternStyle;
  m: Record<BodyMeasurementKey, number>;
  ease: { bust: number; waist: number; hip: number };
  women: boolean;
  kids: boolean;
  knit: boolean;
  notes: string[];
}

const EASE: Record<PatternStyle['fit'], { bust: number; waist: number; hip: number }> = {
  fitted: { bust: 50, waist: 30, hip: 40 },
  regular: { bust: 90, waist: 70, hip: 60 },
  relaxed: { bust: 150, waist: 140, hip: 100 },
  oversized: { bust: 240, waist: 240, hip: 160 },
};

export function resolve(input: PatternSpec | PatternSpecInput): Ctx {
  const spec = patternSpecSchema.parse(input);
  const chart = measurementsFor(spec.audience, spec.size);
  const m = { ...chart, ...spec.body } as Record<BodyMeasurementKey, number>;
  const style = spec.style;
  const knit = spec.family === 'top' && style.topType === 'tshirt';
  const kids = spec.audience === 'girls' || spec.audience === 'boys';
  const base = EASE[style.fit];
  const extra = spec.family === 'top' && style.topType === 'shirt' ? 30 : 0;
  const knitCut = knit ? -30 : 0;
  const scale = kids ? 0.7 : 1;
  const ease = {
    bust: spec.ease.bust ?? Math.round((base.bust + extra + knitCut) * scale),
    waist: spec.ease.waist ?? Math.round((base.waist + extra + knitCut) * scale),
    hip: spec.ease.hip ?? Math.round((base.hip + knitCut) * scale),
  };
  return {
    spec,
    style,
    m,
    ease,
    women: spec.audience === 'women',
    kids,
    knit,
    notes: [],
  };
}

/** Sensible starting style for a family (the AI reading overrides what it sees). */
export function defaultStyle(
  family: PatternSpec['family'],
  audience: PatternSpec['audience'],
): PatternStyleInput {
  const kids = audience === 'girls' || audience === 'boys';
  switch (family) {
    case 'dress':
      return {
        length: 'knee',
        skirt: 'a_line',
        sleeve: 'short',
        closure: 'back_zip',
        darts: !kids,
      };
    case 'top':
      return {
        length: 'hip',
        topType: 'blouse',
        sleeve: 'short',
        skirt: 'straight',
        darts: audience === 'women',
      };
    case 'skirt':
      return { length: 'knee', skirt: 'a_line', closure: 'side_zip', waistband: true };
    case 'trousers':
      return {
        length: 'full',
        leg: 'straight',
        closure: kids ? 'none' : 'fly_zip',
        waistband: true,
        pockets: 'side_seam',
      };
  }
}

/** Finished length for the length option (see `patternStyleSchema.lengthMm`). */
export function lengthFor(ctx: Ctx, kind: 'top' | 'skirt' | 'trousers'): number {
  const { m, style } = ctx;
  if (style.lengthMm) return style.lengthMm;
  const waistY = 20 + m.back_length;
  const knee = m.waist_to_knee;
  const floor = m.waist_to_floor;
  if (kind === 'top') {
    switch (style.length) {
      case 'crop':
        return waistY - 30;
      case 'tunic':
        return waistY + m.waist_to_hip + 170;
      case 'hip':
      default:
        return waistY + m.waist_to_hip + (style.topType === 'shirt' ? 60 : 20);
    }
  }
  if (kind === 'trousers') {
    switch (style.length) {
      case 'shorts':
        return m.crotch_depth + 140;
      case 'knee':
        return knee + 40;
      case 'cropped':
      case 'midi':
        return Math.round(floor * 0.82);
      case 'mini':
      case 'above_knee':
        return m.crotch_depth + 200;
      default:
        return floor - 25;
    }
  }
  switch (style.length) {
    case 'mini':
      return Math.round(knee * 0.62);
    case 'above_knee':
      return Math.round(knee * 0.85);
    case 'midi':
      return Math.round(knee + (floor - knee) * 0.5);
    case 'ankle':
      return floor - 80;
    case 'floor':
      return floor - 20;
    case 'knee':
    default:
      return knee + 30;
  }
}

/** Finished sleeve length from the shoulder point for the sleeve option. */
export function sleeveLengthFor(ctx: Ctx, capHeight: number): number {
  const { style, m } = ctx;
  if (style.sleeveLengthMm) return style.sleeveLengthMm;
  const arm = m.arm_length;
  switch (style.sleeve) {
    case 'cap':
      return capHeight + 25;
    case 'short':
      return Math.max(capHeight + 40, Math.round(arm * 0.33));
    case 'elbow':
      return Math.round(arm * 0.56);
    case 'three_quarter':
      return Math.round(arm * 0.76);
    case 'long':
    default:
      return arm + (style.cuff === 'none' ? 10 : 0);
  }
}
