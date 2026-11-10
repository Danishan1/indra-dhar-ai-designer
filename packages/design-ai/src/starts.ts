import type { AiImageInput, AiProvider, AiUsage } from '@ai-designer/ai';
import { z } from 'zod';

import { SKETCH_GARMENT_TYPES } from './sketch.js';

/**
 * The other two ways to start a design (ADR-066). Both end in a black-and-white line sketch, which is
 * then read exactly like an uploaded sketch (ADR-058/061):
 *
 * - **From a garment photo** — a model wearing it, a product photo, a colourful design: the image
 *   model redraws the garment as a technical line sketch (front, garment only).
 * - **From a fabric** — the fabric is read (colour, print, texture, drape) and 3–4 garments that suit
 *   it are suggested, for the chosen wearer or one the AI picks. For the chosen suggestion the image
 *   model draws the design in the fabric (a reference picture) and then its line sketch.
 */

// ── line sketches ───────────────────────────────────────────────────────────

const LINE_STYLE =
  'Draw it as a technical fashion flat: black outlines on a plain white background, the garment ON ITS OWN, front view, laid flat and symmetrical. Seams and topstitching as fine dashed lines; collar, plackets, buttons, pockets, darts, pleats, gathers, waistband, belt loops, zips and cuffs drawn where they are. BLACK LINES ONLY: no colour, no fill, no print or fabric texture, no shading. NO person, NO model, NO mannequin or dress form, NO hanger, NO body parts, NO text.';

/** Photo (worn or not) → line sketch of the garment(s) in it. */
export function photoToSketchPrompt(input: {
  garmentHint?: string | null;
  notes?: string | null;
  views: number;
}): string {
  return [
    `Redraw the garment${input.views > 1 ? 's' : ''} in the photo${input.views > 1 ? 's (several views of the same outfit)' : ''} as a line sketch for pattern making.`,
    'Keep its real construction exactly: silhouette and proportions, length, neckline, collar, sleeves and cuffs, closures, pockets, seams, yokes, darts, pleats and gathers. Ignore the person, pose, background, lighting, colours and print — only the garment.',
    'If the outfit has separate garments (for example a shirt and trousers), draw each garment separately, the upper garment above the lower one, not overlapping.',
    input.garmentHint ? `The user says it is: ${input.garmentHint}.` : null,
    input.notes ? `User notes: ${input.notes}` : null,
    LINE_STYLE,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Design picture (drawn from a fabric suggestion) → line sketch of the same garment(s). */
export function designToSketchPrompt(s: FabricSuggestion): string {
  return [
    `Redraw the ${s.title.toLowerCase()} in the reference picture as a line sketch for pattern making.`,
    `Details to keep: ${s.styleDetails.join('; ') || s.description}.`,
    'Keep its construction exactly (silhouette, length, neckline, collar, sleeves, closures, pockets, seams, pleats, gathers). Ignore the model, pose, background, colour and the fabric print.',
    'If it is a set of separate garments, draw each garment separately, the upper above the lower.',
    LINE_STYLE,
  ].join('\n');
}

// ── fabric → suggestions ─────────────────────────────────────────────────────

export const FABRIC_AUDIENCES = ['women', 'men', 'girls', 'boys'] as const;
export type FabricAudience = (typeof FABRIC_AUDIENCES)[number];

const audienceSchema = z.enum(FABRIC_AUDIENCES);
const garmentTypeSchema = z
  .string()
  .transform((s) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_'),
  )
  .pipe(z.enum(SKETCH_GARMENT_TYPES as unknown as [string, ...string[]]));

export const fabricReadingSchema = z.object({
  colors: z.array(z.string().max(40)).max(8).default([]),
  /** solid · stripe · check · floral · geometric · abstract · paisley · animal · other */
  pattern: z.string().max(40).default('solid'),
  motif: z.string().max(200).default(''),
  texture: z.string().max(120).default(''),
  /** light · medium · heavy */
  weight: z.string().max(20).default('medium'),
  /** fluid · soft · crisp · structured */
  drape: z.string().max(20).default('soft'),
  stretch: z.boolean().default(false),
  sheen: z.string().max(20).default('matte'),
  likelyMaterial: z.string().max(60).nullable().default(null),
  season: z.string().max(60).default(''),
  notes: z.string().max(400).default(''),
});
export type FabricReading = z.infer<typeof fabricReadingSchema>;

export const fabricSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  garmentType: garmentTypeSchema,
  audience: audienceSchema,
  description: z.string().max(400).default(''),
  /** Construction details the sketch should show ("mandarin collar", "gathered tiered skirt"). */
  styleDetails: z.array(z.string().max(120)).max(10).default([]),
  why: z.string().max(400).default(''),
});
export type FabricSuggestion = z.infer<typeof fabricSuggestionSchema>;

export const fabricSuggestionsSchema = z.object({
  fabric: fabricReadingSchema,
  /** Who the fabric suits best when the user let the AI decide (null when the user chose). */
  bestFor: z
    .object({ audience: audienceSchema, why: z.string().max(400) })
    .nullable()
    .default(null),
  suggestions: z.array(fabricSuggestionSchema).min(1).max(6),
});

export const FABRIC_SUGGEST_SHAPE = `{
  "fabric": { "colors": ["navy", "white"], "pattern": "floral", "motif": "small white daisies", "texture": "smooth plain weave", "weight": "light", "drape": "soft", "stretch": false, "sheen": "matte", "likelyMaterial": "cotton lawn", "season": "spring/summer", "notes": "" },
  "bestFor": { "audience": "girls", "why": "…" } | null,
  "suggestions": [ { "title": "Tiered sundress", "garmentType": "dress", "audience": "girls", "description": "…", "styleDetails": ["square neckline", "two gathered tiers"], "why": "…" } ]
}`;

export const FABRIC_SUGGEST_SYSTEM =
  'You are an experienced fashion designer and textile expert. You look at fabric swatches and suggest garments that suit them — for the colour, print scale, weight, drape, stretch and season. You never invent fibre content as fact: the material is a likely guess.';

export function fabricSuggestPrompt(input: {
  audience: FabricAudience | null;
  notes?: string | null;
}): string {
  return [
    'Read the fabric in the image(s): colours, print or pattern and its scale, texture, weight, drape, stretch, sheen, likely material and season.',
    input.audience
      ? `Suggest 4 garments made from this fabric for ${input.audience}. Set "bestFor" to null and every suggestion's audience to "${input.audience}".`
      : 'First decide who this fabric suits best — women, men, girls or boys — and say why in "bestFor". Then suggest 4 garments for that wearer (you may include one for another wearer if it clearly suits too).',
    input.notes ? `User notes: ${input.notes}` : null,
    `Each suggestion: a short title, garmentType (one of: ${SKETCH_GARMENT_TYPES.join(', ')}; a set of separate pieces such as a shirt with shorts is the type of its upper garment with "set" in the title), the audience, a one-sentence description, 3–6 construction details for the sketch (neckline, collar, sleeves, length, closures, pockets, pleats/gathers), and why it suits this fabric.`,
    'Prefer garments whose construction suits the fabric: fluid fabrics for gathers and drape, crisp ones for tailored shapes, large prints for simple cuts with few seams, stretch fabrics for close fits.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface FabricSuggestions {
  mode: 'fabric_suggestions';
  fabric: FabricReading;
  bestFor: { audience: FabricAudience; why: string } | null;
  suggestions: FabricSuggestion[];
  provider: string;
}

export async function suggestFromFabric(
  input: {
    images: readonly AiImageInput[];
    audience: FabricAudience | null;
    notes?: string | null;
  },
  deps: {
    provider: AiProvider;
    recordUsage?(u: AiUsage, outcome: 'succeeded' | 'failed'): Promise<void>;
    progress?(stage: string): Promise<void>;
  },
): Promise<FabricSuggestions> {
  await deps.progress?.('Reading the fabric');
  const out = await deps.provider.generateStructured({
    task: 'fabric_suggest',
    system: FABRIC_SUGGEST_SYSTEM,
    prompt: fabricSuggestPrompt(input),
    images: input.images.map((i, n) => ({
      ...i,
      label: n === 0 ? 'fabric' : `fabric view ${n + 1}`,
    })),
    schema: fabricSuggestionsSchema,
    shapeHint: FABRIC_SUGGEST_SHAPE,
    temperature: 0.4,
  });
  await deps.recordUsage?.(out.usage, 'succeeded');
  const data = out.data;
  // The user's choice of wearer wins over anything the model returned.
  const suggestions = input.audience
    ? data.suggestions.map((s) => ({ ...s, audience: input.audience! }))
    : data.suggestions;
  return {
    mode: 'fabric_suggestions',
    fabric: data.fabric,
    bestFor: input.audience ? null : data.bestFor,
    suggestions,
    provider: deps.provider.name,
  };
}

const AUDIENCE_WORDS: Record<FabricAudience, string> = {
  women: 'an adult woman model',
  men: 'an adult man model',
  girls: 'a girl model (about 8 years old)',
  boys: 'a boy model (about 8 years old)',
};

/** The chosen suggestion drawn in the fabric: a reference picture of the final design. */
export function fabricDesignPrompt(s: FabricSuggestion, fabric: FabricReading): string {
  return [
    `Design and show a ${s.title.toLowerCase()} (${s.garmentType.replaceAll('_', ' ')}) made from the fabric in the reference image, worn by ${AUDIENCE_WORDS[s.audience]}.`,
    s.description ? `About it: ${s.description}` : null,
    s.styleDetails.length ? `Construction details: ${s.styleDetails.join('; ')}.` : null,
    `Use the fabric exactly as it is — colours ${fabric.colors.join(', ') || 'as shown'}, ${fabric.pattern} pattern${fabric.motif ? ` (${fabric.motif})` : ''}, print scale true to the swatch — and let it drape as a ${fabric.weight}, ${fabric.drape} fabric would.`,
    'Realistic fashion photograph, front view, full body in frame, natural standing pose, soft studio light, plain light background. The construction must be clearly visible. No text or logos.',
  ]
    .filter(Boolean)
    .join('\n');
}
