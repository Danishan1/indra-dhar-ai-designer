import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';
import { designFindingSchema } from '../designs/schemas.js';
import { pageQuerySchema, pageSchema } from '../pagination.js';

/**
 * Reusable artifacts (I13, SPEC-003 §11). Definitions and properties are validated server-side
 * with `@ai-designer/garment-model` (artifacts/artifact-schema.ts); here they travel as JSON.
 */

export const ArtifactCategoryKeys = [
  'sleeve',
  'collar',
  'cuff',
  'pocket',
  'placket',
  'neckline',
  'fabric',
  'lace',
  'trim',
  'embroidery',
  'button',
  'artwork',
] as const;
export const artifactCategorySchema = z.enum(ArtifactCategoryKeys);
export type ArtifactCategoryKey = z.infer<typeof artifactCategorySchema>;

export const ArtifactScopes = ['platform', 'organization', 'user'] as const;
export const artifactScopeSchema = z.enum(ArtifactScopes);
export type ArtifactScope = z.infer<typeof artifactScopeSchema>;
/** Scopes a member can create in (the platform library is maintained by the platform). */
export const writableArtifactScopeSchema = z.enum(['organization', 'user']);

export const ArtifactLifecycleStatuses = [
  'active',
  'deprecated',
  'deactivated',
  'deleted',
] as const;
export const artifactLifecycleStatusSchema = z.enum(ArtifactLifecycleStatuses);

export const geometryCapabilitySchema = z.enum(['G0', 'G1', 'G2']);
export const artifactValidationStatusSchema = z.enum([
  'unvalidated',
  'design_asset_validated',
  'production_validated',
]);

const jsonRecord = z.record(z.string(), z.unknown());
const nameSchema = z.string().trim().min(1, { message: 'Enter a name' }).max(120);
const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((tags) => [...new Set(tags)]);

export const artifactPropertiesJsonSchema = z.object({
  visual: jsonRecord.default({}),
  physical: jsonRecord.default({}),
});

export const artifactRevisionSchema = z.object({
  id: z.uuid(),
  artifactId: z.uuid(),
  displayId: z.string(),
  revisionNumber: z.number().int(),
  parentRevisionId: z.uuid().nullable(),
  definition: jsonRecord,
  properties: z.object({ visual: jsonRecord, physical: jsonRecord }),
  previewAssetId: z.uuid().nullable(),
  /** API path of a thumbnail (same-origin), or null when there is no preview. */
  previewUrl: z.string().nullable(),
  geometryCapability: geometryCapabilitySchema,
  validationStatus: artifactValidationStatusSchema,
  schemaVersion: z.string(),
  contentHash: z.string(),
  changeNote: z.string().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
});
export type ArtifactRevision = z.infer<typeof artifactRevisionSchema>;

export const artifactSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  category: artifactCategorySchema,
  artifactType: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  ownerScope: artifactScopeSchema,
  ownerUserId: z.uuid().nullable(),
  lifecycleStatus: artifactLifecycleStatusSchema,
  currentRevisionId: z.uuid().nullable(),
  currentRevisionNumber: z.number().int(),
  geometryCapability: geometryCapabilitySchema.nullable(),
  validationStatus: artifactValidationStatusSchema.nullable(),
  compatibleTargetTypes: z.array(z.string()),
  previewUrl: z.string().nullable(),
  derivedFromArtifactRevisionId: z.uuid().nullable(),
  version: z.number().int(),
  createdBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema.nullable(),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const artifactDetailSchema = artifactSchema.extend({
  /** Newest first. */
  revisions: z.array(artifactRevisionSchema),
});
export type ArtifactDetail = z.infer<typeof artifactDetailSchema>;

export const artifactListQuerySchema = pageQuerySchema.extend({
  category: artifactCategorySchema.optional(),
  scope: artifactScopeSchema.optional(),
  q: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(40).optional(),
  /** Only artifacts usable on this component type. */
  compatibleWith: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .optional(),
  /** Include deactivated/deprecated artifacts (hidden from browse by default, ART-010). */
  includeInactive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ArtifactListQuery = z.input<typeof artifactListQuerySchema>;
export const artifactListResponseSchema = pageSchema(artifactSchema);

export const createArtifactRequestSchema = z.object({
  category: artifactCategorySchema,
  artifactType: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .optional(),
  name: nameSchema,
  description: z.string().trim().max(2000).optional(),
  tags: tagsSchema.optional(),
  /** `user` = only you see it until it is published; `organization` needs `artifact.publish`. */
  scope: writableArtifactScopeSchema.default('user'),
  definition: jsonRecord,
  properties: artifactPropertiesJsonSchema.optional(),
  previewAssetId: z.uuid().optional(),
  changeNote: z.string().trim().max(500).optional(),
});
export type CreateArtifactRequest = z.input<typeof createArtifactRequestSchema>;

export const createArtifactRevisionRequestSchema = z.object({
  /** The revision you based your change on; a newer one makes this a conflict. */
  expectedCurrentRevisionId: z.uuid(),
  definition: jsonRecord,
  properties: artifactPropertiesJsonSchema.optional(),
  previewAssetId: z.uuid().nullable().optional(),
  changeNote: z.string().trim().max(500).optional(),
});
export type CreateArtifactRevisionRequest = z.input<typeof createArtifactRevisionRequestSchema>;

export const updateArtifactRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: nameSchema.optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  tags: tagsSchema.optional(),
});

export const duplicateArtifactRequestSchema = z.object({
  scope: writableArtifactScopeSchema.default('user'),
  name: nameSchema.optional(),
});

export const artifactParamsSchema = z.object({ orgId: z.uuid(), artifactId: z.uuid() });
export const artifactRevisionParamsSchema = z.object({
  orgId: z.uuid(),
  artifactRevisionId: z.uuid(),
});

export const compatibilityCheckRequestSchema = z.object({
  artifactRevisionId: z.uuid(),
  componentType: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  region: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .nullable()
    .optional(),
  existingUses: z.number().int().min(0).optional(),
});
export const compatibilityCheckResponseSchema = z.object({
  compatible: z.boolean(),
  findings: z.array(designFindingSchema),
});

export const whereUsedResponseSchema = z.object({
  /** Committed design revisions (this organization only) that pin a revision of the artifact. */
  items: z.array(
    z.object({
      designId: z.uuid(),
      designDisplayId: z.string(),
      designName: z.string(),
      projectId: z.uuid(),
      revisionId: z.uuid(),
      revisionDisplayId: z.string(),
      artifactRevisionIds: z.array(z.string()),
    }),
  ),
  /** Design drafts (working copies) that use it but are not committed yet. */
  draftCount: z.number().int(),
});
export type WhereUsed = z.infer<typeof whereUsedResponseSchema>;

// ── render info (I16) ────────────────────────────────────────────────────────

/** What the 2D renderer needs about artifact revisions a design uses (trims, fabrics). */
export const artifactRenderInfoQuerySchema = z.object({
  /** Comma-separated artifact revision ids (max 100). */
  ids: z
    .string()
    .transform((s) => [
      ...new Set(
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ])
    .pipe(z.array(z.uuid()).max(100)),
});

export const artifactRenderInfoSchema = z.object({
  artifactRevisionId: z.uuid(),
  artifactId: z.uuid(),
  name: z.string(),
  category: artifactCategorySchema,
  /** `definition.shapeParams` of the revision (parametric 2D shape), or null. */
  shapeParams: z
    .object({
      kind: z.string(),
      params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
    })
    .nullable(),
  /** Same-origin preview image (used as fabric texture), or null. */
  previewUrl: z.string().nullable(),
  /** e.g. `LAC-0001-R002` — the exact revision a design pins. */
  displayId: z.string(),
  revisionNumber: z.number().int(),
  /** Latest revision of the artifact ("Update to Rn" when newer, ART-005). */
  currentRevisionId: z.uuid().nullable(),
  currentRevisionNumber: z.number().int(),
  /** `active`, or deactivated/deprecated: pinned uses stay, new uses are refused (ART-010). */
  lifecycleStatus: artifactLifecycleStatusSchema,
  compatibleTargetTypes: z.array(z.string()),
  allowedPlacementRegions: z.array(z.string()).nullable(),
  preferredPlacementRegions: z.array(z.string()),
});
export type ArtifactRenderInfo = z.infer<typeof artifactRenderInfoSchema>;

export const artifactRenderInfoResponseSchema = z.object({
  /** Only revisions the caller may see; unknown or hidden ids are simply absent. */
  items: z.array(artifactRenderInfoSchema),
});

// ── save a design component as an artifact (I18) ─────────────────────────────

export const createArtifactFromComponentRequestSchema = z.object({
  designId: z.uuid(),
  componentId: z.string().regex(/^cmp_[a-z0-9]{8,32}$/),
  name: nameSchema,
  description: z.string().trim().max(2000).optional(),
  tags: tagsSchema.optional(),
  /** `user` = only you see it; `organization` needs `artifact.publish`. */
  scope: writableArtifactScopeSchema.default('user'),
});
export type CreateArtifactFromComponentRequest = z.input<
  typeof createArtifactFromComponentRequestSchema
>;
