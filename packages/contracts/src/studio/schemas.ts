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
  audience: z.enum(['men', 'women', 'kids', 'unisex']).optional(),
  provider: aiProviderNameSchema.optional(),
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
