import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';
import { designSchema } from '../designs/schemas.js';

/**
 * AI design studio (ADR-056): Component 1 (design analyzer + component library reuse) and
 * Component 3 (tech pack generator). Results travel as JSON; their structure is defined by
 * `@ai-designer/design-ai` and validated there.
 */

export const AiProviderNames = ['gemini', 'openai', 'fake'] as const;
export const aiProviderNameSchema = z.enum(AiProviderNames);

export const aiStatusSchema = z.object({
  defaultProvider: aiProviderNameSchema,
  providers: z.array(
    z.object({
      name: aiProviderNameSchema,
      configured: z.boolean(),
      models: z.object({ text: z.string(), image: z.string() }),
    }),
  ),
  dailyLimit: z.number().int(),
  usedToday: z.number().int(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

export const AnalysisInputRoles = ['auto', 'sketch', 'reference', 'pattern', 'fabric'] as const;
export const analysisInputRoleSchema = z.enum(AnalysisInputRoles);

export const createAnalysisRequestSchema = z.object({
  inputs: z
    .array(z.object({ assetId: z.uuid(), role: analysisInputRoleSchema.default('auto') }))
    .min(1, { message: 'Add at least one image' })
    .max(10),
  notes: z.string().trim().max(1000).optional(),
  garmentHint: z.string().trim().max(120).optional(),
  audience: z.enum(['men', 'women', 'kids', 'unisex', 'girls', 'boys']).optional(),
  provider: aiProviderNameSchema.optional(),
  /**
   * How the design starts (ADR-058): `sketch` = the AI reads a sketch and the pattern engine drafts
   * editable flat patterns; `images` = the earlier component analysis.
   */
  mode: z.enum(['images', 'sketch']).default('images'),
  /** Size chart entry for sketch mode (e.g. `M`, `6y`); default per audience. */
  size: z.string().trim().min(1).max(20).optional(),
});
export type CreateAnalysisRequest = z.input<typeof createAnalysisRequestSchema>;

export const StudioJobStatuses = ['queued', 'running', 'succeeded', 'failed'] as const;
export const studioJobStatusSchema = z.enum(StudioJobStatuses);

export const analysisSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  projectId: z.uuid(),
  status: studioJobStatusSchema,
  stage: z.string().nullable(),
  inputs: z.array(
    z.object({ assetId: z.uuid(), role: analysisInputRoleSchema, fileName: z.string().nullable() }),
  ),
  notes: z.string().nullable(),
  garmentHint: z.string().nullable(),
  audience: z.string().nullable(),
  mode: z.enum(['images', 'sketch']),
  size: z.string().nullable(),
  provider: aiProviderNameSchema,
  /** `AnalysisResult` from `@ai-designer/design-ai` (decomposition, details, matches…). */
  result: z.record(z.string(), z.unknown()).nullable(),
  /** component key → crop asset id (visual representation). */
  crops: z.record(z.string(), z.uuid()),
  error: z.object({ message: z.string(), kind: z.string().nullable() }).nullable(),
  designId: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const analysisParamsSchema = z.object({ orgId: z.uuid(), analysisId: z.uuid() });

export const createDesignFromAnalysisRequestSchema = z.object({
  name: z.string().trim().min(1, { message: 'Enter a name' }).max(120),
  /** component key → what to use: AI result, the matched library entry, or leave it out. */
  decisions: z.record(z.string(), z.enum(['ai', 'library', 'skip'])).default({}),
  /** component key → fabric key (null = no fabric). Missing keys use the AI suggestion. */
  fabricAssignments: z.record(z.string(), z.string().nullable()).default({}),
  /** Save newly identified components to the organization's library. */
  saveToLibrary: z.boolean().default(true),
  /** Sketch mode: the pattern spec the user reviewed (validated by the API, ADR-058). */
  patternSpec: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDesignFromAnalysisRequest = z.input<typeof createDesignFromAnalysisRequestSchema>;

export const createDesignFromAnalysisResponseSchema = z.object({
  design: designSchema,
  libraryEntriesCreated: z.number().int(),
  fabricsCreated: z.number().int(),
  notes: z.array(z.string()),
});

// ── tech packs ───────────────────────────────────────────────────────────────

export const createTechPackRequestSchema = z.object({
  /** Revision to document; defaults to the latest committed revision. */
  revisionId: z.uuid().optional(),
  provider: aiProviderNameSchema.optional(),
  /** Generate the mannequin and model images (more AI calls). */
  modelImages: z.boolean().default(true),
  /** Presentation presets for the mannequin / model images (ADR-057). */
  presentation: z
    .object({
      model: z.enum(['female', 'male', 'child', 'none']).default('female'),
      pose: z.enum(['standing_front', 'three_quarter', 'walking']).default('standing_front'),
      background: z.enum(['studio_white', 'light_grey', 'lifestyle']).default('studio_white'),
      view: z.enum(['front', 'back']).default('front'),
    })
    .default({
      model: 'female',
      pose: 'standing_front',
      background: 'studio_white',
      view: 'front',
    }),
});
export type CreateTechPackRequest = z.input<typeof createTechPackRequestSchema>;

export const techPackSummarySchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  designId: z.uuid(),
  revisionId: z.uuid(),
  revisionLabel: z.string(),
  status: studioJobStatusSchema,
  stage: z.string().nullable(),
  provider: aiProviderNameSchema,
  pdfAssetId: z.uuid().nullable(),
  /** none = not printed yet · printing · ready · failed (the document is still complete). */
  pdfStatus: z.enum(['none', 'printing', 'ready', 'failed']),
  pdfError: z.string().nullable(),
  error: z.object({ message: z.string(), kind: z.string().nullable() }).nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type TechPackSummary = z.infer<typeof techPackSummarySchema>;

export const techPackSchema = techPackSummarySchema.extend({
  /** `TechPackDocument` from `@ai-designer/design-ai`. */
  document: z.record(z.string(), z.unknown()).nullable(),
});
export type TechPack = z.infer<typeof techPackSchema>;

export const techPackListResponseSchema = z.object({ items: z.array(techPackSummarySchema) });
export const techPackParamsSchema = z.object({ orgId: z.uuid(), techPackId: z.uuid() });

// ── look previews (ADR-064) ──────────────────────────────────────────────────

export const LookViews = ['front', 'back', 'left', 'right'] as const;
export const lookViewSchema = z.enum(LookViews);
export type LookView = z.infer<typeof lookViewSchema>;
/**
 * model = the outfit worn by a real model (front, back, left, right) · sketch = a flat line drawing
 * of each garment on its own, no model or dummy (front and back only).
 */
export const lookStyleSchema = z.enum(['model', 'sketch']);
export type LookStyle = z.infer<typeof lookStyleSchema>;
/** Views each style can draw. */
export const LOOK_STYLE_VIEWS: Record<LookStyle, readonly LookView[]> = {
  model: LookViews,
  sketch: ['front', 'back'],
};

export const createLookRequestSchema = z
  .object({
    /** Revision whose patterns are drawn; defaults to the latest committed revision. */
    revisionId: z.uuid().optional(),
    provider: aiProviderNameSchema.optional(),
    style: lookStyleSchema.default('model'),
    /** Short note shown with the look ("longer sleeves", "final?"). */
    note: z.string().trim().max(200).optional(),
    /**
     * Which views to draw — each is an AI image (cost; a line sketch draws each garment of a set
     * separately), so the user chooses. Duplicates are dropped; the order is front, back, left, right.
     */
    views: z
      .array(lookViewSchema)
      .min(1, 'Choose at least one view')
      .max(LookViews.length)
      .default(['front'])
      .transform((v) => LookViews.filter((x) => v.includes(x))),
  })
  .superRefine((body, ctx) => {
    const allowed = LOOK_STYLE_VIEWS[body.style];
    const bad = body.views.filter((v) => !allowed.includes(v));
    if (bad.length)
      ctx.addIssue({
        code: 'custom',
        path: ['views'],
        message: `A ${body.style === 'sketch' ? 'line sketch' : 'model'} look draws only ${allowed.join(' and ')} views`,
      });
  });
export type CreateLookRequest = z.input<typeof createLookRequestSchema>;

export const lookViewImageSchema = z.object({
  view: lookViewSchema,
  /** Line sketches: the garment of the set this drawing shows (`main`, `shorts`…); null on a model. */
  garment: z.string().nullable().default(null),
  garmentName: z.string().nullable().default(null),
  assetId: z.uuid().nullable(),
  /** Why the view is missing (provider error), when `assetId` is null. */
  note: z.string().nullable(),
});
export type LookViewImage = z.infer<typeof lookViewImageSchema>;

export const lookSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  designId: z.uuid(),
  /** The committed patterns this look shows — restore it to get these patterns back. */
  revisionId: z.uuid(),
  revisionLabel: z.string(),
  revisionDisplayId: z.string(),
  status: studioJobStatusSchema,
  stage: z.string().nullable(),
  provider: aiProviderNameSchema,
  style: lookStyleSchema,
  note: z.string().nullable(),
  views: z.array(lookViewImageSchema),
  error: z.object({ message: z.string(), kind: z.string().nullable() }).nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
});
export type Look = z.infer<typeof lookSchema>;

export const lookListResponseSchema = z.object({ items: z.array(lookSchema) });
export const lookParamsSchema = z.object({ orgId: z.uuid(), lookId: z.uuid() });

// ── AI providers & models (ADR-057) ──────────────────────────────────────────

export const AiOperationKeys = [
  'image_analysis',
  'garment_reconstruction',
  'pattern_interpretation',
  'techpack_documentation',
  'image_generation',
] as const;
export const aiOperationSchema = z.enum(AiOperationKeys);
export type AiOperationKey = z.infer<typeof aiOperationSchema>;

export const aiModelCapabilitySchema = z.enum([
  'text',
  'vision',
  'multi_image',
  'structured_output',
  'image_generation',
  'image_editing',
]);

export const aiModelSchema = z.object({
  provider: aiProviderNameSchema,
  id: z.string(),
  displayName: z.string(),
  capabilities: z.array(aiModelCapabilitySchema),
  methods: z.array(z.string()),
  inputTokenLimit: z.number().nullable(),
  outputTokenLimit: z.number().nullable(),
  stage: z.enum(['stable', 'preview', 'experimental']),
});
export type AiModel = z.infer<typeof aiModelSchema>;

export const modelRefSchema = z.object({
  provider: aiProviderNameSchema,
  model: z.string().trim().min(1).max(200),
});
export type ModelRefBody = z.infer<typeof modelRefSchema>;

export const modelPreferenceSchema = z.union([z.literal('auto'), modelRefSchema]);

export const aiProviderConnectionSchema = z.object({
  provider: aiProviderNameSchema,
  /** organization = key saved in Settings; server = key from the server's .env; none = no key. */
  source: z.enum(['organization', 'server', 'builtin', 'none']),
  status: z.enum(['connected', 'invalid', 'error', 'not_configured']),
  keyHint: z.string().nullable(),
  checkedAt: isoDateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  models: z.array(aiModelSchema),
});
export type AiProviderConnection = z.infer<typeof aiProviderConnectionSchema>;

export const aiSettingsSchema = z.object({
  providers: z.array(aiProviderConnectionSchema),
  preferences: z.partialRecord(aiOperationSchema, modelPreferenceSchema),
  crossProviderFallback: z.boolean(),
  operations: z.array(
    z.object({
      operation: aiOperationSchema,
      label: z.string(),
      requirements: z.array(aiModelCapabilitySchema),
      compatible: z.array(modelRefSchema),
      /** The order models would be tried in now (preference, then automatic fallbacks). */
      effective: z.array(modelRefSchema),
    }),
  ),
  canManage: z.boolean(),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const keyedProviderSchema = z.enum(['gemini', 'openai']);

export const providerRequestSchema = z.object({ provider: keyedProviderSchema });

export const saveProviderKeyRequestSchema = z.object({
  provider: keyedProviderSchema,
  apiKey: z.string().trim().min(8, { message: 'Paste the full API key' }).max(500),
});

export const updateAiSettingsRequestSchema = z.object({
  preferences: z.partialRecord(aiOperationSchema, modelPreferenceSchema),
  crossProviderFallback: z.boolean(),
});

export const testModelRequestSchema = z.object({
  provider: aiProviderNameSchema,
  operation: aiOperationSchema,
  model: z.string().trim().min(1).max(200),
});

export const testModelResponseSchema = z.object({
  ok: z.boolean(),
  provider: aiProviderNameSchema,
  model: z.string(),
  operation: aiOperationSchema,
  /** listed | capability | live (what was checked) */
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() })),
  latencyMs: z.number().int(),
});
export type TestModelResponse = z.infer<typeof testModelResponseSchema>;
