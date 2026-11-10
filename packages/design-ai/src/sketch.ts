import type { AiImageInput, AiProvider, AiUsage } from '@ai-designer/ai';
import {
  BackPocketOptions,
  ClosureOptions,
  CollarOptions,
  CuffOptions,
  FitOptions,
  HemShapeOptions,
  JacketTypeOptions,
  LegShapeOptions,
  LengthOptions,
  NecklineOptions,
  type PatternAudience,
  type PatternFamily,
  type PatternSpec,
  patternSpecSchema,
  type PatternStyleInput,
  PlacketOptions,
  PleatOptions,
  PocketOptions,
  RuffleOptions,
  SkirtShapeOptions,
  SleeveLengthOptions,
  SleeveStyleOptions,
  TopTypeOptions,
  WaistbandTypeOptions,
} from '@ai-designer/garment-model';
import {
  DEFAULT_SIZE,
  defaultStyle,
  jacketDefaults,
  kidsSizeForAge,
  measurementsFor,
  sizesFor,
} from '@ai-designer/pattern-model';
import { z } from 'zod';

/**
 * Component 1 (ADR-058, two passes since ADR-061): read a garment sketch the way a pattern maker
 * would. **Pass 1 — classify**: who wears it (male/female, adult/child, age), which body sections it
 * covers, and every separate garment drawn (a shirt and shorts are two garments of one set), each
 * with its type. **Pass 2 — checklist**: for each garment, the questions that matter for its type
 * (shorts: waistband, belt loops, fly, front/back pockets, pleats, turn-ups…) answered from the
 * allowed values the pattern engine drafts. The model never draws geometry: `draftPattern` drafts
 * every piece from a size chart, so dimensions are exact and editable.
 */

// ── tolerant parsing helpers ─────────────────────────────────────────────────

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const lenient = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.null()])
    .transform((s) => (s === null ? null : slug(s)))
    .transform((s) =>
      s !== null && (values as readonly string[]).includes(s) ? (s as T[number]) : null,
    )
    .catch(null)
    .default(null);

const bool = z
  .union([z.boolean(), z.string(), z.null()])
  .transform((v) =>
    typeof v === 'string'
      ? /^(yes|true|y)$/i.test(v.trim())
        ? true
        : /^(no|false|n|none)$/i.test(v.trim())
          ? false
          : null
      : v,
  )
  .catch(null)
  .default(null);
const count = (max: number) =>
  z.coerce.number().int().min(0).max(max).nullable().catch(null).default(null);
const ratio = z.coerce.number().min(0.05).max(10).nullable().catch(null).default(null);

/** Garment types the classifier may name (mapped to a family + starting style below). */
export const SKETCH_GARMENT_TYPES = [
  'shirt',
  't_shirt',
  'polo',
  'blouse',
  'top',
  'tank_top',
  'hoodie',
  'sweatshirt',
  'jacket',
  'shirt_jacket',
  'blazer',
  'bomber',
  'coat',
  'dress',
  'frock',
  'gown',
  'jumpsuit',
  'romper',
  'dungarees',
  'shortalls',
  'skirt',
  'trousers',
  'jeans',
  'chinos',
  'joggers',
  'leggings',
  'shorts',
] as const;
export type SketchGarmentType = (typeof SKETCH_GARMENT_TYPES)[number];

const ALIASES: Record<string, SketchGarmentType> = {
  pants: 'trousers',
  pant: 'trousers',
  half_pant: 'shorts',
  half_pants: 'shorts',
  bermuda: 'shorts',
  bermudas: 'shorts',
  tee: 't_shirt',
  tshirt: 't_shirt',
  overalls: 'dungarees',
  playsuit: 'romper',
  frock_dress: 'frock',
  sweatpants: 'joggers',
  track_pants: 'joggers',
  cardigan: 'jacket',
  vest: 'tank_top',
  camisole: 'tank_top',
  kurta: 'top',
  tunic: 'top',
};

const garmentType = z
  .string()
  .transform(slug)
  .transform((s): SketchGarmentType =>
    (SKETCH_GARMENT_TYPES as readonly string[]).includes(s)
      ? (s as SketchGarmentType)
      : (ALIASES[s] ??
        (/short/.test(s)
          ? 'shorts'
          : /jean/.test(s)
            ? 'jeans'
            : /trouser|pant/.test(s)
              ? 'trousers'
              : /skirt/.test(s)
                ? 'skirt'
                : /dress|gown/.test(s)
                  ? 'dress'
                  : /hood/.test(s)
                    ? 'hoodie'
                    : /jacket|coat/.test(s)
                      ? 'jacket'
                      : /shirt/.test(s)
                        ? 'shirt'
                        : 'top')),
  )
  .catch('top');

// ── pass 1: classification ───────────────────────────────────────────────────

export const sketchClassificationSchema = z.object({
  gender: z
    .string()
    .transform(slug)
    .transform((s): 'male' | 'female' | 'unisex' =>
      /^(m|male|man|men|boy|boys)$/.test(s) ||
      (/\bm[ae]n\b|male|boy/.test(s) && !/female|woman|women/.test(s))
        ? 'male'
        : /female|wom|girl|lady|ladies/.test(s)
          ? 'female'
          : 'unisex',
    )
    .catch('unisex'),
  ageGroup: z
    .string()
    .transform(slug)
    .transform((s): 'adult' | 'child' =>
      /child|kid|boy|girl|toddler|baby|teen|junior/.test(s) ? 'child' : 'adult',
    )
    .catch('adult'),
  /** Children: estimated age in years from the proportions / style (null if unclear). */
  ageYears: z.coerce.number().min(0).max(18).nullable().catch(null).default(null),
  /** Body sections the drawing covers. */
  sections: z
    .array(z.string().transform(slug))
    .catch([])
    .default([])
    .transform(
      (a) =>
        a.filter((x) => ['upper', 'lower', 'full'].includes(x)) as ('upper' | 'lower' | 'full')[],
    ),
  garments: z
    .array(
      z.object({
        type: garmentType,
        section: z
          .string()
          .transform(slug)
          .transform((s): 'upper' | 'lower' | 'full' =>
            s === 'lower' || s === 'full' ? s : 'upper',
          )
          .catch('upper'),
        label: z.string().trim().min(1).max(120).catch('Garment'),
        confidence: z.coerce.number().min(0).max(1).catch(0.6).default(0.6),
      }),
    )
    .min(1)
    .max(4)
    .catch([{ type: 'dress', section: 'full', label: 'Garment', confidence: 0.3 }]),
  /** Short name of the whole outfit ("Boys' shirt and shorts set"). */
  label: z.string().trim().min(1).max(160).catch('Garment'),
  /** Views shown (front, back, side). */
  views: z.array(z.string().max(20)).max(6).catch([]).default([]),
  confidence: z.coerce.number().min(0).max(1).catch(0.6).default(0.6),
  description: z.string().max(1500).catch('').default(''),
});
export type SketchClassification = z.infer<typeof sketchClassificationSchema>;

export const SKETCH_CLASSIFY_SYSTEM = [
  'You are a senior pattern maker classifying a fashion sketch before drafting patterns.',
  'Decide step by step: (1) who wears it — male or female, adult or child (estimate the age from',
  'head-to-body proportions, garment style and cut); (2) which body sections are drawn — upper',
  '(shoulders to waist/hip), lower (waist down) or full (one garment covering both, like a dress,',
  'jumpsuit or dungarees); (3) every SEPARATE garment drawn. A shirt drawn above a pair of shorts is',
  'two garments (a set), not a dress. A dress is one continuous garment from the shoulders down.',
  'Never invent garments that are not drawn.',
].join(' ');

export function classifyPrompt(input: {
  garmentHint?: string | null;
  audience?: string | null;
  notes?: string | null;
}): string {
  return [
    'Classify the sketch(es). Images after the first may show other views of the same outfit.',
    input.garmentHint ? `The user says it is: ${input.garmentHint}.` : '',
    input.audience ? `It is for: ${input.audience}.` : '',
    input.notes ? `User notes: ${input.notes}` : '',
    '',
    'Return:',
    '- gender: male | female | unisex;  ageGroup: adult | child;  ageYears (children only, else null);',
    '- sections: the body sections drawn, from upper | lower | full;',
    `- garments: one entry per separate garment, each { type, section, label, confidence }, type one of: ${SKETCH_GARMENT_TYPES.join(', ')};`,
    '  section: upper (tops, shirts, jackets), lower (trousers, shorts, skirts), full (dresses, jumpsuits, rompers, dungarees);',
    '  list the upper garment first. Shorts ending above or at the knee are "shorts" ("half pants");',
    '- label: a short name of the outfit; views: front/back/side shown; confidence 0–1;',
    '- description: two sentences describing what is drawn.',
    '',
    'Cues: a separate waistband line with belt loops below a shirt hem means separate bottoms; a boxy',
    "shirt with a collar and short sleeves on a small figure is a boy's shirt; a frock is a child's",
    'dress with a yoke or gathered skirt.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export const SKETCH_CLASSIFY_SHAPE = `{
  "gender": "male", "ageGroup": "child", "ageYears": 8, "sections": ["upper", "lower"],
  "garments": [
    { "type": "shirt", "section": "upper", "label": "Short-sleeve shirt", "confidence": 0.9 },
    { "type": "shorts", "section": "lower", "label": "Shorts with belt loops", "confidence": 0.85 }
  ],
  "label": "Boys' shirt and shorts set", "views": ["front"], "confidence": 0.85, "description": "…"
}`;

// ── pass 2: per-garment checklist ────────────────────────────────────────────

const styleReadingSchema = z
  .object({
    fit: lenient(FitOptions),
    topType: lenient(TopTypeOptions),
    jacketType: lenient(JacketTypeOptions),
    neckline: lenient(NecklineOptions),
    collar: lenient(CollarOptions),
    sleeve: lenient(SleeveLengthOptions),
    sleeveStyle: lenient(SleeveStyleOptions),
    cuff: lenient(CuffOptions),
    closure: lenient(ClosureOptions),
    placket: lenient(PlacketOptions),
    buttons: count(20),
    hemShape: lenient(HemShapeOptions),
    yoke: bool,
    backPleat: bool,
    darts: bool,
    pockets: lenient(PocketOptions),
    pocketCount: count(2),
    waistSeam: bool,
    skirt: lenient(SkirtShapeOptions),
    tiers: count(5),
    length: lenient(LengthOptions),
    leg: lenient(LegShapeOptions),
    waistband: bool,
    waistbandType: lenient(WaistbandTypeOptions),
    beltLoops: count(10),
    backPockets: lenient(BackPocketOptions),
    backPocketCount: count(2),
    cargoPockets: bool,
    pleats: lenient(PleatOptions),
    turnUps: bool,
    hood: bool,
    lining: bool,
    ribbing: bool,
    peplum: bool,
    wrap: bool,
    ruffles: z
      .array(z.string().transform(slug))
      .catch([])
      .transform(
        (a) =>
          a.filter((x) =>
            (RuffleOptions as readonly string[]).includes(x),
          ) as (typeof RuffleOptions)[number][],
      ),
  })
  .partial()
  .catch({});

export const sketchDetailsSchema = z.object({
  garments: z
    .array(
      z.object({
        index: z.coerce.number().int().min(0).max(5).catch(0),
        style: styleReadingSchema.default({}),
        /** Style keys that are a guess (shown as "check"). */
        unsure: z.array(z.string().max(40)).max(30).catch([]).default([]),
        proportions: z
          .object({
            lengthToShoulder: ratio,
            skirtToBodice: ratio,
            sleeveToShoulder: ratio,
            /** Bottoms: outseam (waist → hem) ÷ hip width. */
            lengthToHip: ratio,
          })
          .partial()
          .catch({})
          .default({}),
        /** Details no option covers (embroidery, bows, prints…). */
        details: z.array(z.string().max(200)).max(20).catch([]).default([]),
      }),
    )
    .catch([])
    .default([]),
  uncertain: z.array(z.string().max(200)).max(20).catch([]).default([]),
});
export type SketchDetails = z.infer<typeof sketchDetailsSchema>;

export const SKETCH_DETAILS_SYSTEM = [
  'You are a senior pattern maker. For each garment listed, answer its checklist by looking closely',
  'at the construction lines of the sketch: seams, topstitching, darts, pleats, gathers, plackets,',
  'waistbands, belt loops, pocket openings, zips and buttons. Choose only from the allowed values.',
  'When a detail is not visible (e.g. the back), give the most likely value for that garment type',
  'and list its key in "unsure". Count things you can see (buttons, belt loops) — for belt loops',
  'the front shows about half of them. Never invent measurements.',
].join(' ');

const opt = (name: string, values: readonly string[], cue = '') =>
  `  - ${name}: ${values.join(' | ')}${cue ? ` — ${cue}` : ''}`;

const UPPER = [
  opt('fit', FitOptions),
  opt('neckline', NecklineOptions, 'when there is no collar'),
  opt(
    'collar',
    CollarOptions,
    'shirt = pointed collar on a stand; mandarin = band only; camp = flat open collar without stand; notched = lapel with a notch (blazers); peter_pan = flat rounded',
  ),
  opt('sleeve', SleeveLengthOptions),
  opt('sleeveStyle', SleeveStyleOptions, 'puff = gathered; flared = widening; straight otherwise'),
  opt('cuff', CuffOptions, 'shirt = buttoned cuff; band = narrow band; none = hemmed'),
  opt(
    'closure',
    ClosureOptions,
    'buttons down the front = front_buttons; zip down the front = front_zip',
  ),
  opt(
    'placket',
    PlacketOptions,
    'separate = a visible strip with two stitch lines along the buttons; hidden = buttons not visible; grown_on = no visible strip',
  ),
  '  - buttons: count down the front (null if none)',
  opt('hemShape', HemShapeOptions, 'curved = shirt-tail; straight = level hem'),
  '  - yoke (shirts: seam across the upper back / shoulders): true | false; backPleat: true | false',
  opt('pockets', PocketOptions, 'tops: patch = chest pocket, kangaroo = hoodie front pocket'),
  '  - pocketCount: 1 | 2 (chest pockets); darts: true | false',
];
const BOTTOM = [
  opt('fit', FitOptions),
  opt(
    'length',
    ['shorts', 'above_knee', 'knee', 'cropped', 'full'],
    'shorts = mid-thigh; above_knee = just above the knee (half pants); full = to the ankle',
  ),
  opt('leg', LegShapeOptions),
  '  - waistband: true when a separate band is sewn at the waist (a horizontal strip with its own stitch lines)',
  opt(
    'waistbandType',
    WaistbandTypeOptions,
    'fitted = flat band with a button; elastic = gathered all round; drawstring = cord at the front; elastic_back = flat front, gathered back',
  ),
  '  - beltLoops: number of belt loops (0 if none; count the tabs crossing the band, typical 5–7)',
  opt(
    'closure',
    ['fly_zip', 'side_zip', 'front_buttons', 'none'],
    'fly_zip = J-shaped topstitch line at the front crotch, usually with a button on the band',
  ),
  opt(
    'pockets',
    ['none', 'side_seam', 'slant', 'scoop', 'patch'],
    'front pockets: slant = diagonal opening from waist to side; scoop = curved (jeans); side_seam = hidden in the side seam',
  ),
  opt('backPockets', BackPocketOptions, 'patch = sewn-on; welt = slit with a lip'),
  '  - backPocketCount: 1 | 2; cargoPockets: true | false; turnUps: true | false',
  opt('pleats', PleatOptions, 'folds at the front waist'),
  '  - darts: true | false',
];

function checklist(type: SketchGarmentType): string[] {
  switch (familyOf(type)) {
    case 'top':
      return [
        opt(
          'topType',
          TopTypeOptions,
          'shirt = collar + button front; tshirt = knit, no opening; blouse = other woven tops',
        ),
        ...UPPER,
        opt('length', ['crop', 'hip', 'tunic']),
        '  - peplum: true | false; wrap: true | false',
        opt('ruffles', RuffleOptions, 'list where (empty if none)'),
      ];
    case 'jacket':
      return [
        opt('jacketType', JacketTypeOptions),
        ...UPPER,
        '  - hood: true | false; lining: true | false; ribbing (knit bands at hem and cuffs): true | false',
      ];
    case 'dress':
      return [
        ...UPPER,
        '  - waistSeam: true when bodice and skirt are joined at the waist; yoke: true for a frock yoke across the chest with the skirt gathered below it',
        opt(
          'skirt',
          SkirtShapeOptions,
          'gathered = soft folds at the waist; a_line = smooth flare; circle = deep waves; tiered = horizontal tiers; pleated = knife pleats',
        ),
        '  - tiers: number of tiers (tiered only)',
        opt('length', ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor']),
        opt('pockets', ['none', 'side_seam', 'patch']),
        '  - wrap: true | false',
        opt('ruffles', RuffleOptions, 'list where (empty if none)'),
      ];
    case 'skirt':
      return [
        opt('skirt', SkirtShapeOptions),
        '  - tiers: number (tiered only)',
        opt('length', ['mini', 'above_knee', 'knee', 'midi', 'ankle', 'floor']),
        '  - waistband: true | false',
        opt('waistbandType', WaistbandTypeOptions),
        '  - beltLoops: count',
        opt('closure', ['side_zip', 'back_zip', 'front_buttons', 'none']),
        opt('pockets', ['none', 'side_seam', 'patch']),
        '  - wrap: true | false',
        opt('ruffles', RuffleOptions, 'list where (empty if none)'),
      ];
    case 'jumpsuit':
      return [...UPPER, ...BOTTOM.filter((l) => !/waistband/.test(l))];
    case 'dungarees':
      return [
        opt('length', ['shorts', 'above_knee', 'knee', 'cropped', 'full']),
        opt('leg', LegShapeOptions),
        opt('pockets', ['none', 'patch', 'side_seam'], 'patch = bib pocket'),
        opt('backPockets', BackPocketOptions),
        '  - waistband: true | false',
      ];
    case 'trousers':
    default:
      return BOTTOM;
  }
}

export function detailsPrompt(c: SketchClassification): string {
  const who = `${c.gender === 'unisex' ? '' : `${c.gender} `}${c.ageGroup}${c.ageYears ? ` (about ${c.ageYears} years)` : ''}`;
  const parts = c.garments.map((g, i) =>
    [
      `Garment ${i} — ${g.type} (${g.section}): "${g.label}". Checklist:`,
      ...checklist(g.type),
    ].join('\n'),
  );
  return [
    `The sketch shows an outfit for a ${who}: ${c.label}.`,
    'Answer the checklist of every garment below from what the sketch shows.',
    '',
    ...parts,
    '',
    'Return { "garments": [{ "index", "style": { key: value … }, "unsure": [keys], "proportions": { … }, "details": [] }], "uncertain": [] }.',
    'proportions (ratios measured on the drawing, null if unclear): lengthToShoulder (tops/dresses: neck point → hem ÷ shoulder width),',
    'skirtToBodice (dresses), sleeveToShoulder, lengthToHip (bottoms: waist → hem ÷ hip width).',
    'details: design details no option covers (bows, embroidery, prints, contrast stitching).',
  ].join('\n');
}

export const SKETCH_DETAILS_SHAPE = `{
  "garments": [
    { "index": 0, "style": { "topType": "shirt", "fit": "regular", "collar": "shirt", "sleeve": "short", "cuff": "none", "closure": "front_buttons", "placket": "separate", "buttons": 6, "hemShape": "straight", "pockets": "none", "darts": false }, "unsure": ["yoke"], "proportions": { "lengthToShoulder": 1.9 }, "details": [] },
    { "index": 1, "style": { "length": "above_knee", "leg": "straight", "waistband": true, "waistbandType": "fitted", "beltLoops": 6, "closure": "fly_zip", "pockets": "slant", "backPockets": "patch", "backPocketCount": 2, "pleats": "none", "turnUps": false }, "unsure": ["backPockets", "pockets"], "proportions": { "lengthToHip": 1.3 }, "details": [] }
  ],
  "uncertain": ["Back view not shown"]
}`;

// ── result ───────────────────────────────────────────────────────────────────

export interface SketchGarmentReading {
  /** Spec garment key (`main` for the first). */
  key: string;
  type: SketchGarmentType;
  section: 'upper' | 'lower' | 'full';
  family: PatternFamily;
  label: string;
  confidence: number;
  details: string[];
}

/** Display summary of the reading (kept for the review page and design metadata). */
export interface SketchReadingSummary {
  family: PatternFamily | 'other';
  label: string;
  audience: PatternAudience | null;
  confidence: number;
  description: string;
  details: string[];
  uncertain: string[];
}

export interface SketchAnalysis {
  mode: 'sketch';
  reading: SketchReadingSummary;
  classification: SketchClassification;
  garments: SketchGarmentReading[];
  /** The pattern spec proposed from the reading (the user can change it before drafting). */
  spec: PatternSpec;
  /** Options the reading set, per garment key. */
  fromSketch: Record<string, string[]>;
  /** Options read but guessed (check them), per garment key. */
  unsure: Record<string, string[]>;
  notes: string[];
  provider: string;
  models: { text: string; image: string };
}

export async function readSketch(
  input: {
    images: readonly AiImageInput[];
    garmentHint?: string | null;
    audience?: PatternAudience | null;
    size?: string | null;
    notes?: string | null;
    /** Labels per image (default: sketch, view 2…) — e.g. a photo given for details only. */
    labels?: readonly string[];
  },
  deps: {
    provider: AiProvider;
    recordUsage?(u: AiUsage, outcome: 'succeeded' | 'failed'): Promise<void>;
    progress?(stage: string): Promise<void>;
  },
): Promise<SketchAnalysis> {
  const images = input.images.map((i, n) => ({
    ...i,
    label: input.labels?.[n] ?? (n === 0 ? 'sketch' : `view ${n + 1}`),
  }));
  await deps.progress?.('Identifying the garments');
  const c = await deps.provider.generateStructured({
    task: 'sketch_classify',
    system: SKETCH_CLASSIFY_SYSTEM,
    prompt: classifyPrompt({
      garmentHint: input.garmentHint ?? null,
      audience: input.audience ?? null,
      notes: input.notes ?? null,
    }),
    images,
    schema: sketchClassificationSchema,
    shapeHint: SKETCH_CLASSIFY_SHAPE,
    temperature: 0.1,
  });
  await deps.recordUsage?.(c.usage, 'succeeded');
  const classification = orderGarments(c.data);
  await deps.progress?.('Reading the construction details');
  const d = await deps.provider.generateStructured({
    task: 'sketch_details',
    system: SKETCH_DETAILS_SYSTEM,
    prompt: detailsPrompt(classification),
    images,
    schema: sketchDetailsSchema,
    shapeHint: SKETCH_DETAILS_SHAPE,
    temperature: 0.1,
  });
  await deps.recordUsage?.(d.usage, 'succeeded');
  await deps.progress?.('Preparing the patterns');
  const out = specFromSketch(classification, d.data, {
    audience: input.audience ?? null,
    size: input.size ?? null,
  });
  return {
    mode: 'sketch',
    classification,
    ...out,
    provider: deps.provider.name,
    models: deps.provider.models,
  };
}

/** Upper garments first, then full, then lower (the first becomes the spec's main garment). */
function orderGarments(c: SketchClassification): SketchClassification {
  const rank = { full: 0, upper: 1, lower: 2 } as const;
  const garments = [...c.garments].sort((a, b) => rank[a.section] - rank[b.section]);
  // A full garment with separates is unusual: keep the order the model gave for the rest.
  return { ...c, garments };
}

/** Family and starting style of a garment type. */
export function familyOf(type: SketchGarmentType): PatternFamily {
  switch (type) {
    case 'shirt':
    case 't_shirt':
    case 'polo':
    case 'blouse':
    case 'top':
    case 'tank_top':
      return 'top';
    case 'hoodie':
    case 'sweatshirt':
    case 'jacket':
    case 'shirt_jacket':
    case 'blazer':
    case 'bomber':
    case 'coat':
      return 'jacket';
    case 'dress':
    case 'frock':
    case 'gown':
      return 'dress';
    case 'jumpsuit':
    case 'romper':
      return 'jumpsuit';
    case 'dungarees':
    case 'shortalls':
      return 'dungarees';
    case 'skirt':
      return 'skirt';
    default:
      return 'trousers';
  }
}

function presetFor(type: SketchGarmentType, kids: boolean): PatternStyleInput {
  switch (type) {
    case 'shirt':
      return { topType: 'shirt', collar: 'shirt', closure: 'front_buttons', darts: false };
    case 't_shirt':
      return { topType: 'tshirt', neckline: 'crew', closure: 'none', darts: false };
    case 'polo':
      return {
        topType: 'tshirt',
        collar: 'shirt',
        closure: 'front_buttons',
        buttons: 3,
        darts: false,
      };
    case 'tank_top':
      return { topType: 'blouse', sleeve: 'none' };
    case 'hoodie':
    case 'sweatshirt':
    case 'blazer':
    case 'bomber':
    case 'shirt_jacket':
      return jacketDefaults(type);
    case 'jacket':
      return jacketDefaults('shirt_jacket');
    case 'coat':
      return { ...jacketDefaults('blazer'), lengthMm: null };
    case 'frock':
      return { yoke: true, skirt: 'gathered', darts: false };
    case 'gown':
      return { length: 'floor' };
    case 'romper':
      return { length: 'shorts' };
    case 'shortalls':
      return { length: 'shorts' };
    case 'jeans':
      return {
        pockets: 'scoop',
        backPockets: 'patch',
        beltLoops: 5,
        closure: 'fly_zip',
        waistbandType: 'fitted',
        fit: 'fitted',
      };
    case 'chinos':
      return {
        pockets: 'slant',
        backPockets: 'welt',
        beltLoops: 5,
        closure: 'fly_zip',
        waistbandType: 'fitted',
      };
    case 'joggers':
      return {
        waistbandType: 'drawstring',
        closure: 'none',
        leg: 'tapered',
        pockets: 'side_seam',
        beltLoops: 0,
      };
    case 'leggings':
      return {
        waistbandType: 'elastic',
        closure: 'none',
        leg: 'slim',
        fit: 'fitted',
        pockets: 'none',
        beltLoops: 0,
      };
    case 'shorts':
      return { length: kids ? 'above_knee' : 'shorts' };
    default:
      return {};
  }
}

const KEY_FOR: Record<PatternFamily, string> = {
  top: 'top',
  jacket: 'jacket',
  dress: 'dress',
  skirt: 'skirt',
  trousers: 'bottoms',
  jumpsuit: 'jumpsuit',
  dungarees: 'dungarees',
};

/**
 * Readings → pattern spec: audience and size from who wears it (the user's choice wins), then for
 * each garment the family defaults, the type preset, and every option the checklist answered.
 * Several garments become a co-ord set sharing the body measurements.
 */
export function specFromSketch(
  c: SketchClassification,
  details: SketchDetails,
  input: { audience: PatternAudience | null; size: string | null },
): Omit<SketchAnalysis, 'mode' | 'classification' | 'provider' | 'models'> {
  const notes: string[] = [];
  const kidsFromReading = c.ageGroup === 'child';
  const readAudience: PatternAudience = kidsFromReading
    ? c.gender === 'female'
      ? 'girls'
      : 'boys'
    : c.gender === 'female'
      ? 'women'
      : c.gender === 'male'
        ? 'men'
        : 'women';
  const audience = input.audience ?? readAudience;
  if (input.audience && input.audience !== readAudience)
    notes.push(`The sketch looks like ${readAudience}; using ${input.audience} as you chose`);
  const kids = audience === 'girls' || audience === 'boys';
  const size =
    input.size && sizesFor(audience).includes(input.size)
      ? input.size
      : kids && c.ageYears
        ? kidsSizeForAge(c.ageYears)
        : DEFAULT_SIZE[audience];
  const m = measurementsFor(audience, size);
  const shoulderWidth = (m.shoulder ?? 120) * 2 + (m.neck ?? 360) / 3;

  const used = new Set<string>();
  const fromSketch: Record<string, string[]> = {};
  const unsure: Record<string, string[]> = {};
  const garments: SketchGarmentReading[] = [];
  const specs: { key: string; family: PatternFamily; style: PatternStyleInput }[] = [];
  c.garments.forEach((g, i) => {
    const family = familyOf(g.type);
    const d = details.garments.find((x) => x.index === i) ?? details.garments[i];
    const key =
      i === 0 ? 'main' : uniqueKey(g.type === 'shorts' ? 'shorts' : KEY_FOR[family], used);
    used.add(key);
    const style: Record<string, unknown> = {
      ...defaultStyle(family, audience),
      ...presetFor(g.type, kids),
    };
    const read: string[] = [];
    for (const [k, v] of Object.entries(d?.style ?? {})) {
      if (v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
      style[k] = v;
      read.push(k);
    }
    fixStyle(family, style, notes, g.label);
    // Lengths from the drawn proportions (when no length option was read).
    const p = d?.proportions ?? {};
    if (!read.includes('length')) {
      if ((family === 'top' || family === 'jacket') && p.lengthToShoulder) {
        const L = Math.round(p.lengthToShoulder * shoulderWidth);
        if (L > 150 && L < 1400) {
          style['lengthMm'] = L;
          read.push('lengthMm');
        }
      } else if (family === 'dress' && p.skirtToBodice) {
        const skirt = Math.round(p.skirtToBodice * (20 + (m.back_length ?? 410)));
        if (skirt > 150 && skirt < (m.waist_to_floor ?? 1040)) {
          style['lengthMm'] = skirt;
          read.push('lengthMm');
        }
      } else if (family === 'trousers' && p.lengthToHip) {
        const L = Math.round(p.lengthToHip * ((m.hip ?? 900) / 2));
        if (L > 150 && L < (m.waist_to_floor ?? 1040) + 20) {
          style['lengthMm'] = L;
          read.push('lengthMm');
        }
      }
    }
    if (
      !read.includes('sleeve') &&
      p.sleeveToShoulder &&
      style['sleeve'] &&
      style['sleeve'] !== 'none'
    ) {
      const S = Math.round(p.sleeveToShoulder * shoulderWidth);
      if (S > 60 && S < 900) {
        style['sleeveLengthMm'] = S;
        read.push('sleeveLengthMm');
      }
    }
    fromSketch[key] = read;
    unsure[key] = [...new Set(d?.unsure ?? [])].filter((k) => read.includes(k));
    garments.push({
      key,
      type: g.type,
      section: g.section,
      family,
      label: g.label,
      confidence: g.confidence,
      details: d?.details ?? [],
    });
    specs.push({ key, family, style: style as PatternStyleInput });
    if (d?.details.length)
      notes.push(`${g.label} — not drafted (add by hand): ${d.details.join('; ')}`);
  });
  const [main, ...rest] = specs;
  const spec = patternSpecSchema.parse({
    family: main!.family,
    audience,
    size,
    body: {},
    style: main!.style,
    garments: rest.map((r) => ({ key: r.key, family: r.family, style: r.style })),
  });
  if (c.confidence < 0.5)
    notes.push('The sketch was hard to read — check the garment types and every option');
  return {
    reading: {
      family: main!.family,
      label: c.label,
      audience: readAudience,
      confidence: c.confidence,
      description: c.description,
      details: garments.flatMap((g) => g.details),
      uncertain: details.uncertain,
    },
    garments,
    spec,
    fromSketch,
    unsure,
    notes,
  };
}

function uniqueKey(base: string, used: Set<string>): string {
  let k = base;
  for (let i = 2; used.has(k) || k === 'main'; i++) k = `${base}_${i}`;
  return k;
}

/** Options that do not apply to the family, and combinations the engine needs. */
function fixStyle(
  family: PatternFamily,
  style: Record<string, unknown>,
  notes: string[],
  label: string,
) {
  const bottoms = family === 'trousers' || family === 'skirt';
  if (family !== 'top') delete style['topType'];
  if (family !== 'jacket') delete style['jacketType'];
  if (bottoms)
    for (const k of [
      'neckline',
      'collar',
      'sleeve',
      'sleeveStyle',
      'cuff',
      'yoke',
      'placket',
      'hemShape',
      'backPleat',
    ])
      delete style[k];
  if (family === 'trousers' || family === 'jumpsuit' || family === 'dungarees') {
    if (style['closure'] === 'back_zip' && family === 'trousers') style['closure'] = 'fly_zip';
  } else if (style['closure'] === 'fly_zip')
    style['closure'] = family === 'skirt' ? 'side_zip' : 'back_zip';
  if (style['collar'] === 'shirt' || style['collar'] === 'camp' || style['collar'] === 'notched') {
    if (
      style['closure'] !== 'front_buttons' &&
      family !== 'skirt' &&
      !(family === 'jacket' && style['closure'] === 'front_zip')
    ) {
      style['closure'] = 'front_buttons';
      notes.push(
        `${label}: a ${String(style['collar'])} collar needs a front opening — front buttons added`,
      );
    }
  }
  // A fitted waistband needs an opening; elastic and drawstring waists pull on.
  if (bottoms && style['waistband'] !== false) {
    const t = style['waistbandType'];
    if ((t === 'fitted' || t === undefined) && (style['closure'] === 'none' || !style['closure']))
      style['waistbandType'] = 'elastic';
  }
  if (typeof style['buttons'] === 'number' && style['buttons'] === 0) style['buttons'] = null;
}

// ── compatibility (analyses stored before ADR-061) ───────────────────────────

/** Normalises a stored analysis result: old single-pass results had arrays, not per-garment maps. */
export function sketchHighlights(result: { fromSketch?: unknown; unsure?: unknown }): {
  fromSketch: Record<string, string[]>;
  unsure: Record<string, string[]>;
} {
  const norm = (v: unknown): Record<string, string[]> =>
    Array.isArray(v)
      ? { main: v as string[] }
      : v && typeof v === 'object'
        ? (v as Record<string, string[]>)
        : {};
  return { fromSketch: norm(result.fromSketch), unsure: norm(result.unsure) };
}
