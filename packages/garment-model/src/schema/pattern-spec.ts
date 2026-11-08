import { z } from 'zod';

/**
 * Pattern-first designs (ADR-058): the AI reads the style from a sketch; the pattern engine
 * (`@ai-designer/pattern-model` `draftPattern`) drafts the pieces from body measurements + style.
 * This spec is the editable input of that drafting — change a measurement or a style option and
 * the pieces are redrafted. All lengths are millimetres.
 */

/**
 * Garment families the engine drafts (ADR-061): dress (incl. kids' frocks), top (blouse, shirt,
 * T-shirt), skirt, trousers (incl. shorts), jumpsuit (incl. rompers: bodice + trousers joined at
 * the waist), jacket (shirt-jacket, blazer, hoodie, bomber, sweatshirt), dungarees (bib + straps).
 */
export const PatternFamilies = [
  'dress',
  'top',
  'skirt',
  'trousers',
  'jumpsuit',
  'jacket',
  'dungarees',
] as const;
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
export const CollarOptions = ['none', 'peter_pan', 'shirt', 'mandarin', 'camp', 'notched'] as const;
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
export const ClosureOptions = [
  'none',
  'back_zip',
  'side_zip',
  'front_buttons',
  'fly_zip',
  'front_zip',
  'side_buttons',
] as const;
export const SkirtShapeOptions = [
  'straight',
  'pencil',
  'a_line',
  'flared',
  'gathered',
  'half_circle',
  'circle',
  'tiered',
  'pleated',
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
/** Tops/jackets: chest (patch) or kangaroo; bottoms and dresses: front/side pockets. */
export const PocketOptions = ['none', 'patch', 'side_seam', 'slant', 'scoop', 'kangaroo'] as const;
export const BackPocketOptions = ['none', 'patch', 'welt'] as const;
export const WaistbandTypeOptions = ['fitted', 'elastic', 'drawstring', 'elastic_back'] as const;
export const PleatOptions = ['none', 'single', 'double'] as const;
export const PlacketOptions = ['grown_on', 'separate', 'hidden'] as const;
export const HemShapeOptions = ['auto', 'straight', 'curved'] as const;
export const JacketTypeOptions = [
  'shirt_jacket',
  'blazer',
  'hoodie',
  'bomber',
  'sweatshirt',
] as const;
export const RuffleOptions = ['hem', 'neckline', 'sleeve'] as const;

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
  /** Bottoms: waistband construction (`waistband` false = faced waist, no band). */
  waistbandType: z.enum(WaistbandTypeOptions).default('fitted'),
  /** Bottoms: number of belt loops (0 = none). */
  beltLoops: z.number().int().min(0).max(10).default(0),
  /** Chest pockets on tops/jackets (1 or 2) when `pockets` is patch. */
  pocketCount: z.number().int().min(1).max(2).default(1),
  /** Bottoms: back pockets and how many (1 or 2). */
  backPockets: z.enum(BackPocketOptions).default('none'),
  backPocketCount: z.number().int().min(1).max(2).default(2),
  /** Trousers/shorts: cargo pockets on the outseam. */
  cargoPockets: z.boolean().default(false),
  /** Trousers: front pleats at the waist. */
  pleats: z.enum(PleatOptions).default('none'),
  /** Trousers: turned-up hem (turn-ups). */
  turnUps: z.boolean().default(false),
  /** Button fronts: grown-on facing, separate button placket, or hidden (fly) placket. */
  placket: z.enum(PlacketOptions).default('grown_on'),
  /** Tops/jackets: straight or curved (shirt-tail) hem; auto = curved for shirts. */
  hemShape: z.enum(HemShapeOptions).default('auto'),
  /** Shirts: box pleat at the centre back (under the yoke). */
  backPleat: z.boolean().default(false),
  /** Jackets: which kind (sets defaults for ease, collar and finishes). */
  jacketType: z.enum(JacketTypeOptions).default('shirt_jacket'),
  hood: z.boolean().default(false),
  lining: z.boolean().default(false),
  /** Knit rib bands at the hem and cuffs (hoodies, sweatshirts, bombers). */
  ribbing: z.boolean().default(false),
  /** Tiered skirts: number of tiers. */
  tiers: z.number().int().min(2).max(5).default(3),
  ruffles: z.array(z.enum(RuffleOptions)).max(3).default([]),
  /** Tops: a flared peplum below the waist. */
  peplum: z.boolean().default(false),
  /** Dresses, skirts and tops: a wrap front that ties. */
  wrap: z.boolean().default(false),
  /** Gathered skirts and puff sleeves: fabric width ÷ finished width. */
  gatherRatio: z.number().min(1).max(4).default(1.8),
  buttons: z.number().int().min(0).max(20).nullable().default(null),
});
export type PatternStyle = z.infer<typeof patternStyleSchema>;
export type PatternStyleInput = z.input<typeof patternStyleSchema>;

/** Another garment of a co-ord set (shirt + shorts…): same wearer and measurements, own style. */
export const setGarmentSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,23}$/)
    .refine((k) => k !== 'main', 'reserved'),
  family: z.enum(PatternFamilies),
  style: patternStyleSchema.default(patternStyleSchema.parse({})),
});
export type SetGarment = z.infer<typeof setGarmentSchema>;

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
  /**
   * Co-ord sets (ADR-061): the other garments drafted with the same body. `family`/`style` above
   * are the first garment (key `main`).
   */
  garments: z
    .array(setGarmentSchema)
    .max(3)
    .default([])
    .refine((g) => new Set(g.map((x) => x.key)).size === g.length, 'garment keys must be unique'),
});
export type PatternSpec = z.infer<typeof patternSpecSchema>;
export type PatternSpecInput = z.input<typeof patternSpecSchema>;

/** Every garment of a spec, the first one keyed `main` (one entry unless it is a co-ord set). */
export function garmentsOf(spec: PatternSpec): SetGarment[] {
  return [{ key: 'main', family: spec.family, style: spec.style } as SetGarment, ...spec.garments];
}

/** The spec of one garment of a set (shared wearer, size, body and allowances; no `garments`). */
export function garmentSpec(spec: PatternSpec, key: string): PatternSpec {
  if (key === 'main') return { ...spec, garments: [] };
  const g = spec.garments.find((x) => x.key === key);
  if (!g) throw new Error(`No garment ${key} in the spec`);
  return { ...spec, family: g.family, style: g.style, garments: [] };
}
