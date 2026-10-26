import { z } from 'zod';

import { pageQuerySchema, pageSchema } from '../pagination.js';

/** What a file is for (03-domain-model.md). `export` and `generated_image` are created by the platform. */
export const AssetTypes = [
  'source_image',
  'sketch',
  'fabric_image',
  'artwork',
  'document',
  'generated_image',
  'svg',
  'texture',
  'model_3d',
  'export',
  'mask',
] as const;
export const assetTypeSchema = z.enum(AssetTypes);
export type AssetType = z.infer<typeof assetTypeSchema>;

/** pending_upload → quarantined (bytes stored, not yet checked) → ready | rejected. */
export const AssetStatuses = ['pending_upload', 'quarantined', 'ready', 'rejected'] as const;
export const assetStatusSchema = z.enum(AssetStatuses);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const AssetVariants = ['original', 'thumb_256', 'preview_1024'] as const;
export const assetVariantSchema = z.enum(AssetVariants);
export type AssetVariant = z.infer<typeof assetVariantSchema>;

export const ProvenanceSourceTypes = [
  'user_upload',
  'ai_job',
  'render',
  'export',
  'import',
  'derived',
] as const;

/** Media types the platform accepts, identified by magic bytes — never by extension or client MIME. */
export const MediaTypes = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
} as const;
export type AcceptedMediaType = (typeof MediaTypes)[keyof typeof MediaTypes];

const RASTER: AcceptedMediaType[] = [MediaTypes.png, MediaTypes.jpeg, MediaTypes.webp];

/**
 * Which uploads are accepted per asset type (AST-008, FR-SEC-176). Types absent here cannot be
 * uploaded by users (3D models arrive in I36; exports/generated images are platform-made).
 */
export const UPLOAD_RULES: Partial<Record<AssetType, readonly AcceptedMediaType[]>> = {
  source_image: RASTER,
  sketch: [...RASTER, MediaTypes.svg],
  fabric_image: RASTER,
  artwork: [...RASTER, MediaTypes.svg],
  texture: RASTER,
  mask: [MediaTypes.png],
  svg: [MediaTypes.svg],
  document: [MediaTypes.pdf],
};
export const uploadableAssetTypes = Object.keys(UPLOAD_RULES) as AssetType[];

export const provenanceSchema = z.object({
  sourceType: z.enum(ProvenanceSourceTypes),
  sourceEntityId: z.string().nullable().optional(),
  jobId: z.uuid().nullable().optional(),
  attempt: z.number().int().nullable().optional(),
  uploadedBy: z.uuid().nullable().optional(),
  originalFileName: z.string().nullable().optional(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const createUploadRequestSchema = z.object({
  assetType: assetTypeSchema,
  fileName: z.string().trim().min(1).max(255),
  /** Declared by the client; only used as a hint — the bytes decide (FR-SEC-177). */
  mediaType: z.string().max(128),
  sizeBytes: z.number().int().min(1),
  /** Optional lowercase hex SHA-256 of the file; verified by the worker. */
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  projectId: z.uuid().optional(),
});
export type CreateUploadRequest = z.input<typeof createUploadRequestSchema>;

export const assetSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  assetType: assetTypeSchema,
  status: assetStatusSchema,
  mediaType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  checksumSha256: z.string().nullable(),
  dimensions: z.object({ width: z.number(), height: z.number() }).nullable(),
  fileName: z.string().nullable(),
  projectId: z.uuid().nullable(),
  isDerived: z.boolean(),
  parentAssetId: z.uuid().nullable(),
  variant: assetVariantSchema,
  /** Variants that can be fetched (original + derivatives that exist). */
  variants: z.array(assetVariantSchema),
  provenance: provenanceSchema,
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
});
export type Asset = z.infer<typeof assetSchema>;

export const createUploadResponseSchema = z.object({
  asset: assetSchema,
  /** Send the raw bytes with PUT to this same-origin URL (Content-Type: application/octet-stream). */
  uploadUrl: z.string(),
  maxBytes: z.number().int(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const assetParamsSchema = z.object({ orgId: z.uuid(), assetId: z.uuid() });
export const assetVariantQuerySchema = z.object({
  variant: assetVariantSchema.default('original'),
});
export const assetUrlResponseSchema = z.object({ url: z.string(), expiresAt: z.string() });

export const assetListQuerySchema = pageQuerySchema.extend({
  projectId: z.uuid().optional(),
  type: assetTypeSchema.optional(),
  status: assetStatusSchema.optional(),
});
export const assetListResponseSchema = pageSchema(assetSchema);
