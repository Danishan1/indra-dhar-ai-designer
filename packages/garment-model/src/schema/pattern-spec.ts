import { z } from 'zod';

/**
 * Pattern-first designs (ADR-058): the AI reads the style from a sketch; the pattern engine
 * (`@ai-designer/pattern-model` `draftPattern`) drafts the pieces from body measurements + style.
 * This spec is the editable input of that drafting — change a measurement or a style option and
 * the pieces are redrafted. All lengths are millimetres.
 */

export const PatternFamilies = ['dress', 'top', 'skirt', 'trousers'] as const;
export type PatternFamily = (typeof PatternFamilies)[number];

export const PatternAudiences = ['women', 'men', 'girls', 'boys'] as const;
export type PatternAudience = (typeof PatternAudiences)[number];

/** Body measurements the drafting uses (circumferences are full, lengths are on the body). */
export const BodyMeasurementKeys = [
  'height',
  'bust',
  'waist',
  'hip',
  'neck',
  'shoulder',
  'across_back',
  'back_length',
  'front_length',
  'bust_depth',
  'bust_span',
  'armhole_depth',
  'arm_length',
  'upper_arm',
  'wrist',
  'waist_to_hip',
  'waist_to_knee',
  'waist_to_floor',
  'crotch_depth',
  'thigh',
  'knee',
  'ankle',
] as const;
export type BodyMeasurementKey = (typeof BodyMeasurementKeys)[number];

export const bodyMeasurementsSchema = z.partialRecord(
  z.enum(BodyMeasurementKeys),
  z.number().finite().min(1).max(3000),
);
export type BodyMeasurements = Partial<Record<BodyMeasurementKey, number>>;

export const FitOptions = ['fitted', 'regular', 'relaxed', 'oversized'] as const;
export const NecklineOptions = ['round', 'crew', 'v_neck', 'scoop', 'square', 'boat'] as const;
export const CollarOptions = ['none', 'peter_pan', 'shirt', 'mandarin'] as const;
export const SleeveLengthOptions = [
  'none',
  'cap',
  'short',
  'elbow',
  'three_quarter',
  'long',
] as const;
export const SleeveStyleOptions = ['fitted', 'straight', 'puff', 'bishop', 'flared'] as const;
export const CuffOptions = ['none', 'band', 'shirt'] as const;
export const ClosureOptions = ['none', 'back_zip', 'side_zip', 'front_buttons', 'fly_zip'] as const;
export const SkirtShapeOptions = [
  'straight',
  'pencil',
  'a_line',
  'flared',
  'gathered',
  'half_circle',
  'circle',
] as const;
export const LengthOptions = [
  'crop',
  'hip',
  'tunic',
  'mini',
  'above_knee',
  'knee',
  'midi',
  'ankle',
  'floor',
  'shorts',
  'cropped',
  'full',
] as const;
export const TopTypeOptions = ['blouse', 'shirt', 'tshirt'] as const;
export const LegShapeOptions = ['straight', 'slim', 'wide', 'tapered'] as const;
export const PocketOptions = ['none', 'patch', 'side_seam'] as const;

export const patternStyleSchema = z.object({
  fit: z.enum(FitOptions).default('regular'),
  /** top only: blouse (woven, darts optional) · shirt (collar, yoke, cuffs) · tshirt (knit). */
  topType: z.enum(TopTypeOptions).default('blouse'),
  neckline: z.enum(NecklineOptions).default('round'),
  /** Override the neckline depth / width (front, from the neck point); null = style default. */
  neckDepthMm: z.number().min(0).max(600).nullable().default(null),
  neckWidthMm: z.number().min(20).max(300).nullable().default(null),
  collar: z.enum(CollarOptions).default('none'),
  sleeve: z.enum(SleeveLengthOptions).default('short'),
  sleeveStyle: z.enum(SleeveStyleOptions).default('straight'),
  /** Finished sleeve length from the shoulder point; null = from the sleeve length option. */
  sleeveLengthMm: z.number().min(20).max(1200).nullable().default(null),
  cuff: z.enum(CuffOptions).default('none'),
  closure: z.enum(ClosureOptions).default('none'),
  /** dress only: bodice and skirt joined at the waist (false = one-piece shift/sheath). */
  waistSeam: z.boolean().default(true),
  skirt: z.enum(SkirtShapeOptions).default('a_line'),
  length: z.enum(LengthOptions).default('knee'),
  /** Finished length (tops: from the neck point · skirts/dress skirts: from the waist · trousers:
   * outseam from the waist); null = from the length option. */
  lengthMm: z.number().min(50).max(2000).nullable().default(null),
  darts: z.boolean().default(true),
  pockets: z.enum(PocketOptions).default('none'),
  yoke: z.boolean().default(false),
  leg: z.enum(LegShapeOptions).default('straight'),
  waistband: z.boolean().default(true),
  /** Gathered skirts and puff sleeves: fabric width ÷ finished width. */
  gatherRatio: z.number().min(1).max(4).default(1.8),
  buttons: z.number().int().min(0).max(20).nullable().default(null),
});
export type PatternStyle = z.infer<typeof patternStyleSchema>;
export type PatternStyleInput = z.input<typeof patternStyleSchema>;

export const patternSpecSchema = z.object({
  version: z.literal(1).default(1),
  family: z.enum(PatternFamilies),
  audience: z.enum(PatternAudiences),
  /** Size chart entry the measurements started from, e.g. `M` or `6y`. */
  size: z.string().trim().min(1).max(20),
  body: bodyMeasurementsSchema.default({}),
  style: patternStyleSchema.default(patternStyleSchema.parse({})),
  /** Extra ease added to the body (mm, full circumference); null = from the fit. */
  ease: z
    .object({
      bust: z.number().min(-100).max(600).nullable().default(null),
      waist: z.number().min(-100).max(600).nullable().default(null),
      hip: z.number().min(-100).max(600).nullable().default(null),
    })
    .default({ bust: null, waist: null, hip: null }),
  seamAllowanceMm: z.number().min(0).max(50).default(10),
  hemAllowanceMm: z.number().min(0).max(100).default(30),
});
export type PatternSpec = z.infer<typeof patternSpecSchema>;
export type PatternSpecInput = z.input<typeof patternSpecSchema>;
