import type { AiImageInput, AiProvider, AiUsage } from '@ai-designer/ai';
import {
  ClosureOptions,
  CollarOptions,
  CuffOptions,
  FitOptions,
  LegShapeOptions,
  LengthOptions,
  NecklineOptions,
  type PatternAudience,
  type PatternFamily,
  type PatternSpec,
  patternSpecSchema,
  type PatternStyleInput,
  PocketOptions,
  SkirtShapeOptions,
  SleeveLengthOptions,
  SleeveStyleOptions,
  TopTypeOptions,
} from '@ai-designer/garment-model';
import { DEFAULT_SIZE, defaultStyle, measurementsFor, sizesFor } from '@ai-designer/pattern-model';
import { z } from 'zod';

/**
 * Component 1 (ADR-058): read a garment sketch. The model only *reads* the design — family, who it
 * is for, and the style options the pattern engine understands (neckline, sleeve, skirt shape,
 * closure…) plus rough proportions. It never draws geometry: `draftPattern` drafts the pieces from
 * a size chart, so every dimension is exact and editable.
 */

const lenient = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.null()])
    .transform((s) =>
      s === null
        ? null
        : s
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_'),
    )
    .transform((s) =>
      s !== null && (values as readonly string[]).includes(s) ? (s as T[number]) : null,
    )
    .catch(null)
    .default(null);

const ratio = z.coerce.number().min(0.05).max(10).nullable().catch(null).default(null);

export const sketchReadingSchema = z.object({
  family: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .transform((s): PatternFamily | 'other' =>
      /dress|frock|gown/.test(s)
        ? 'dress'
        : /skirt/.test(s)
          ? 'skirt'
          : /trouser|pant|jean|short/.test(s)
            ? 'trousers'
            : /shirt|top|blouse|tee|t_shirt|tunic/.test(s)
              ? 'top'
              : 'other',
    )
    .catch('other'),
  label: z.string().trim().min(1).max(160).catch('Garment'),
  audience: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .transform((s): PatternAudience | null =>
      /girl/.test(s)
        ? 'girls'
        : /boy/.test(s)
          ? 'boys'
          : /wom|lad|female/.test(s)
            ? 'women'
            : /\bm[ae]n\b|male|gent/.test(s)
              ? 'men'
              : /kid|child/.test(s)
                ? 'girls'
                : null,
    )
    .catch(null)
    .default(null),
  confidence: z.coerce.number().min(0).max(1).catch(0.6).default(0.6),
  style: z
    .object({
      fit: lenient(FitOptions),
      topType: lenient(TopTypeOptions),
      neckline: lenient(NecklineOptions),
      collar: lenient(CollarOptions),
      sleeve: lenient(SleeveLengthOptions),
      sleeveStyle: lenient(SleeveStyleOptions),
      cuff: lenient(CuffOptions),
      closure: lenient(ClosureOptions),
      waistSeam: z.boolean().nullable().catch(null).default(null),
      skirt: lenient(SkirtShapeOptions),
      length: lenient(LengthOptions),
      darts: z.boolean().nullable().catch(null).default(null),
      pockets: lenient(PocketOptions),
      yoke: z.boolean().nullable().catch(null).default(null),
      leg: lenient(LegShapeOptions),
      waistband: z.boolean().nullable().catch(null).default(null),
      buttons: z.coerce.number().int().min(0).max(20).nullable().catch(null).default(null),
    })
    .catch({} as never)
    .default({} as never),
  /** Proportions read from the drawing (lengths relative to the shoulder width). */
  proportions: z
    .object({
      /** Total garment length (neck point → hem, or waist → hem for skirts/trousers) ÷ shoulder width. */
      lengthToShoulder: ratio,
      /** Dresses: skirt length (waist → hem) ÷ bodice length (neck point → waist). */
      skirtToBodice: ratio,
      /** Sleeve length ÷ shoulder width. */
      sleeveToShoulder: ratio,
    })
    .catch({ lengthToShoulder: null, skirtToBodice: null, sleeveToShoulder: null })
    .default({ lengthToShoulder: null, skirtToBodice: null, sleeveToShoulder: null }),
  /** Design details the pattern engine does not draft (ruffles, bows, embroidery…). */
  details: z.array(z.string().max(200)).max(20).catch([]).default([]),
  /** What the sketch does not show (back view, closure…). */
  uncertain: z.array(z.string().max(200)).max(20).catch([]).default([]),
  description: z.string().max(1500).catch('').default(''),
});
export type SketchReading = z.infer<typeof sketchReadingSchema>;

export const SKETCH_SYSTEM = [
  'You are a pattern maker reading a fashion sketch for someone who is NOT a professional.',
  'Identify the garment and choose, for each style option, the value from the allowed list that',
  'best matches the drawing. Use null when the sketch does not show it. Never invent measurements;',
  'only estimate the proportions asked for.',
].join(' ');

export function sketchPrompt(input: {
  garmentHint?: string | null;
  audience?: string | null;
  notes?: string | null;
}): string {
  const opt = (name: string, values: readonly string[]) => `- ${name}: ${values.join(' | ')}`;
  return [
    'Read the garment sketch(es). Images after the first may show other views of the same garment.',
    input.garmentHint ? `The user says it is: ${input.garmentHint}.` : '',
    input.audience ? `It is for: ${input.audience}.` : '',
    input.notes ? `User notes: ${input.notes}` : '',
    '',
    'Return:',
    '- family: dress | top | skirt | trousers | other; label: a short name ("Girls\' puff-sleeve party dress");',
    '- audience: women | men | girls | boys (who would wear it, from the figure and style);',
    '- style (choose exactly from these lists, null if not visible):',
    opt('fit', FitOptions),
    opt('topType (tops only)', TopTypeOptions),
    opt('neckline', NecklineOptions),
    opt('collar', CollarOptions),
    opt('sleeve (length)', SleeveLengthOptions),
    opt('sleeveStyle', SleeveStyleOptions),
    opt('cuff', CuffOptions),
    opt('closure', ClosureOptions),
    '- waistSeam (dresses): true when bodice and skirt are joined at the waist; false for a shift',
    opt('skirt (dresses and skirts: shape)', SkirtShapeOptions),
    opt('length', LengthOptions),
    '- darts: true if the garment is fitted with darts; pockets: ' + PocketOptions.join(' | '),
    '- yoke (shirts): true/false; leg (trousers): ' +
      LegShapeOptions.join(' | ') +
      '; waistband: true/false; buttons: count',
    '- proportions, measured on the drawing as ratios to the shoulder width (null if unclear):',
    '  lengthToShoulder, skirtToBodice (dresses: skirt length ÷ bodice length), sleeveToShoulder;',
    '- details: design details a basic pattern will not include (ruffles, bows, smocking, prints…);',
    '- uncertain: what you could not tell from the sketch (back view, closure, fabric…);',
    '- description: two or three sentences describing the garment.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export const SKETCH_SHAPE = `{
  "family": "dress", "label": "Girls' puff-sleeve party dress", "audience": "girls", "confidence": 0.8,
  "style": { "fit": "regular", "topType": null, "neckline": "round", "collar": "peter_pan", "sleeve": "short", "sleeveStyle": "puff", "cuff": "band", "closure": "back_zip", "waistSeam": true, "skirt": "gathered", "length": "knee", "darts": false, "pockets": "none", "yoke": null, "leg": null, "waistband": null, "buttons": null },
  "proportions": { "lengthToShoulder": 2.9, "skirtToBodice": 1.6, "sleeveToShoulder": 0.5 },
  "details": ["Bow at the back waist"], "uncertain": ["Back view not shown — back zip assumed"], "description": "…"
}`;

export interface SketchAnalysis {
  mode: 'sketch';
  reading: SketchReading;
  /** The pattern spec proposed from the reading (the user can change it before drafting). */
  spec: PatternSpec;
  /** Reading values the spec took over / kept from defaults, for the review page. */
  fromSketch: string[];
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
  },
  deps: {
    provider: AiProvider;
    recordUsage?(u: AiUsage, outcome: 'succeeded' | 'failed'): Promise<void>;
    progress?(stage: string): Promise<void>;
  },
): Promise<SketchAnalysis> {
  await deps.progress?.('Reading your sketch');
  const res = await deps.provider.generateStructured({
    task: 'sketch_reading',
    system: SKETCH_SYSTEM,
    prompt: sketchPrompt({
      garmentHint: input.garmentHint ?? null,
      audience: input.audience ?? null,
      notes: input.notes ?? null,
    }),
    images: input.images.map((i, n) => ({ ...i, label: n === 0 ? 'sketch' : `view ${n + 1}` })),
    schema: sketchReadingSchema,
    shapeHint: SKETCH_SHAPE,
    temperature: 0.1,
  });
  await deps.recordUsage?.(res.usage, 'succeeded');
  await deps.progress?.('Preparing the pattern');
  const { spec, fromSketch, notes } = specFromReading(res.data, {
    audience: input.audience ?? null,
    size: input.size ?? null,
  });
  return {
    mode: 'sketch',
    reading: res.data,
    spec,
    fromSketch,
    notes,
    provider: deps.provider.name,
    models: deps.provider.models,
  };
}

/**
 * Reading → pattern spec: the family's defaults, overridden by every option the sketch shows, the
 * user's audience/size, and lengths from the drawn proportions (scaled by the chart's shoulder).
 */
export function specFromReading(
  reading: SketchReading,
  input: { audience: PatternAudience | null; size: string | null; family?: PatternFamily | null },
): { spec: PatternSpec; fromSketch: string[]; notes: string[] } {
  const notes: string[] = [];
  const family: PatternFamily =
    input.family ?? (reading.family === 'other' ? 'dress' : reading.family);
  if (reading.family === 'other' && !input.family)
    notes.push('The garment type was unclear; started as a dress — change it if needed');
  const audience: PatternAudience = input.audience ?? reading.audience ?? 'women';
  const size =
    input.size && sizesFor(audience).includes(input.size) ? input.size : DEFAULT_SIZE[audience];
  const style: Record<string, unknown> = { ...defaultStyle(family, audience) };
  const fromSketch: string[] = [];
  for (const [k, v] of Object.entries(reading.style)) {
    if (v === null || v === undefined) continue;
    style[k] = v;
    fromSketch.push(k);
  }
  // Options that do not apply to the family.
  if (family !== 'top') delete style['topType'];
  if (family === 'skirt' || family === 'trousers') {
    for (const k of ['neckline', 'collar', 'sleeve', 'sleeveStyle', 'cuff', 'yoke'])
      delete style[k];
  }
  if (family === 'trousers' && style['closure'] === 'back_zip') style['closure'] = 'fly_zip';
  if (family !== 'trousers' && style['closure'] === 'fly_zip') style['closure'] = 'back_zip';
  if (style['collar'] === 'shirt' && style['closure'] !== 'front_buttons' && family !== 'skirt') {
    style['closure'] = 'front_buttons';
    notes.push('A shirt collar needs a front opening: front buttons added');
  }
  // Lengths from proportions (relative to the chart's shoulder width, ≈ 2.4 × shoulder length + neck).
  const m = measurementsFor(audience, size);
  const shoulderWidth = (m.shoulder ?? 120) * 2 + (m.neck ?? 360) / 3;
  const p = reading.proportions;
  const lengthShown = reading.style.length !== null;
  if (!lengthShown && family === 'dress' && p.skirtToBodice) {
    const bodice = 20 + (m.back_length ?? 410);
    const skirt = Math.round(p.skirtToBodice * bodice);
    if (skirt > 150 && skirt < (m.waist_to_floor ?? 1040)) {
      style['lengthMm'] = skirt;
      fromSketch.push('lengthMm');
    }
  } else if (!lengthShown && p.lengthToShoulder && family === 'top') {
    const L = Math.round(p.lengthToShoulder * shoulderWidth);
    if (L > 150 && L < 1400) {
      style['lengthMm'] = L;
      fromSketch.push('lengthMm');
    }
  }
  if (
    reading.style.sleeve === null &&
    p.sleeveToShoulder &&
    style['sleeve'] &&
    style['sleeve'] !== 'none'
  ) {
    const S = Math.round(p.sleeveToShoulder * shoulderWidth);
    if (S > 60 && S < 900) {
      style['sleeveLengthMm'] = S;
      fromSketch.push('sleeveLengthMm');
    }
  }
  if (reading.details.length)
    notes.push(`Not drafted (add by hand): ${reading.details.join('; ')}`);
  const spec = patternSpecSchema.parse({
    family,
    audience,
    size,
    body: {},
    style: style as PatternStyleInput,
  });
  return { spec, fromSketch, notes };
}
