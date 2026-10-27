import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';
import { pageQuerySchema, pageSchema } from '../pagination.js';
import { projectStatusSchema } from '../projects/schemas.js';

/**
 * Designs, working copies and immutable revisions (I12, SPEC-006 §8.3–8.4, ADR-003/018).
 * The garment state itself is defined by `@ai-designer/garment-model`; here it travels as JSON and
 * the API validates it with that package.
 */

/** How a new design starts. Keys match `@ai-designer/garment-model` templates, plus `blank`. */
export const DesignTemplates = ['woven_shirt', 'knit_tshirt', 'blank'] as const;
export const designTemplateSchema = z.enum(DesignTemplates);
export type DesignTemplate = z.infer<typeof designTemplateSchema>;

/** Review/approval states arrive in I28; designs start as drafts. */
export const DesignStatuses = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED'] as const;
export const designStatusSchema = z.enum(DesignStatuses);
export type DesignStatus = z.infer<typeof designStatusSchema>;

const nameSchema = z.string().trim().min(1, { message: 'Enter a name' }).max(120);

export const createDesignRequestSchema = z.object({
  name: nameSchema,
  template: designTemplateSchema.default('woven_shirt'),
});
export type CreateDesignRequest = z.input<typeof createDesignRequestSchema>;

export const designSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  projectId: z.uuid(),
  name: z.string(),
  garmentType: z.string(),
  garmentCategory: z.string().nullable(),
  status: designStatusSchema,
  headRevisionId: z.uuid().nullable(),
  headRevisionNumber: z.number().int(),
  approvedRevisionId: z.uuid().nullable(),
  workingCopyVersion: z.number().int(),
  /** The working copy differs (semantically) from the latest revision. */
  hasUncommittedChanges: z.boolean(),
  duplicatedFromDesignId: z.uuid().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Design = z.infer<typeof designSchema>;

export const designListQuerySchema = pageQuerySchema;
export const designListResponseSchema = pageSchema(designSchema);

export const projectDesignsParamsSchema = z.object({ orgId: z.uuid(), projectId: z.uuid() });
export const designParamsSchema = z.object({ orgId: z.uuid(), designId: z.uuid() });
export const revisionParamsSchema = z.object({ orgId: z.uuid(), revisionId: z.uuid() });

// ── validation findings (shape of garment-model ValidationFinding) ──────────

export const designFindingSchema = z.object({
  ruleId: z.string(),
  outcome: z.enum(['valid', 'warning', 'error', 'not_evaluated', 'requires_manual_review']),
  entity: z.object({ entityType: z.string(), entityId: z.string() }).nullable(),
  path: z.string().nullable(),
  message: z.string(),
  resolution: z.string().nullable(),
});
export type DesignFinding = z.infer<typeof designFindingSchema>;

export const validationSummarySchema = z.object({
  errors: z.number().int(),
  warnings: z.number().int(),
  manualReview: z.number().int(),
  /** Informative notes (I20); absent on revisions committed before I20. */
  info: z.number().int().optional(),
  /** Constraint set the summary was computed with, e.g. `design-structure@1.0.0` (I20, CST-004). */
  constraintSet: z.string().optional(),
});
export type ValidationSummary = z.infer<typeof validationSummarySchema>;

// ── working copy ─────────────────────────────────────────────────────────────

/** A garment design state (validated server-side by `@ai-designer/garment-model`). */
export const designStateJsonSchema = z.record(z.string(), z.unknown());

export const workingCopySchema = z.object({
  designId: z.uuid(),
  version: z.number().int(),
  baseRevisionId: z.uuid().nullable(),
  restoredFromRevisionId: z.uuid().nullable(),
  schemaVersion: z.string(),
  /** Set when the stored state was written by an older schema and was upgraded for reading. */
  migratedFrom: z.string().nullable(),
  state: designStateJsonSchema,
  hasUncommittedChanges: z.boolean(),
  /** Non-blocking findings of the structural validation (warnings, manual review). */
  findings: z.array(designFindingSchema),
  lastModifiedBy: z.uuid().nullable(),
  updatedAt: isoDateTimeSchema,
});
export type WorkingCopy = z.infer<typeof workingCopySchema>;

// ── revisions ────────────────────────────────────────────────────────────────

export const commitRevisionRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  summary: z.string().trim().max(500).optional(),
  /** Commit even when nothing about the garment changed (metadata only). */
  allowNoChanges: z.boolean().default(false),
});

export const revisionSummarySchema = z.object({
  id: z.uuid(),
  designId: z.uuid(),
  displayId: z.string(),
  revisionNumber: z.number().int(),
  parentRevisionIds: z.array(z.uuid()),
  restoredFromRevisionId: z.uuid().nullable(),
  contentHash: z.string(),
  schemaVersion: z.string(),
  changeSummary: z.string(),
  validationSummary: validationSummarySchema,
  artifactRevisionRefs: z.array(z.string()),
  sourceAssetRefs: z.array(z.string()),
  createdBy: z.uuid().nullable(),
  createdByName: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  /** Review status of this revision — always null until reviews arrive (I28). */
  reviewStatus: z.string().nullable(),
});
export type RevisionSummary = z.infer<typeof revisionSummarySchema>;

export const revisionSchema = revisionSummarySchema.extend({
  /** The snapshot exactly as committed (its schema version is `schemaVersion`). */
  snapshot: designStateJsonSchema,
  changeDiffSummary: z.record(z.string(), z.unknown()),
  /** The stored hash was recomputed and matched (FR-PRJ-023). */
  integrity: z.literal('verified'),
});
export type Revision = z.infer<typeof revisionSchema>;

export const revisionListResponseSchema = pageSchema(revisionSummarySchema);

export const commitRevisionResponseSchema = z.object({
  revision: revisionSummarySchema,
  workingCopyVersion: z.number().int(),
});

export const restoreRevisionRequestSchema = z.object({
  revisionId: z.uuid(),
  expectedVersion: z.number().int().min(1),
});

export const compareQuerySchema = z.object({
  from: z.uuid(),
  /** A revision id, or `working` for the current working copy. */
  to: z.union([z.uuid(), z.literal('working')]),
});

const compareSideSchema = z.object({
  kind: z.enum(['revision', 'working']),
  id: z.uuid().nullable(),
  label: z.string(),
});

/** One classified change (`classifyDiff` in garment-model, I19). */
export const diffEntrySchema = z.object({
  category: z.enum([
    'structural',
    'property',
    'artifact',
    'relationship',
    'metadata',
    'editor_hint',
  ]),
  kind: z.enum(['added', 'removed', 'changed']),
  componentId: z.string().nullable(),
  entityId: z.string(),
  field: z.string().nullable(),
  label: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  statusBefore: z.string().nullable(),
  statusAfter: z.string().nullable(),
  /** Only the appearance changed (FR-PRJ-031). */
  visualOnly: z.boolean(),
  /** A change to the garment (false for metadata and editor-only flags). */
  semantic: z.boolean(),
});
export type DiffEntry = z.infer<typeof diffEntrySchema>;

export const compareResponseSchema = z.object({
  from: compareSideSchema,
  to: compareSideSchema,
  /** Human-readable lines (same generator as revision change summaries). */
  summary: z.array(z.string()),
  /** Structural diff from `diffDesignStates` (components, properties, relationships, artifacts). */
  diff: z.record(z.string(), z.unknown()),
  /** The diff as labelled entries grouped by category (I19). */
  entries: z.array(diffEntrySchema),
  /** Components that differ (for highlighting; editor-only flags excluded). */
  changedComponentIds: z.array(z.string()),
  /** Something changed, but nothing about the garment itself. */
  metadataOnly: z.boolean(),
});
export type CompareResponse = z.infer<typeof compareResponseSchema>;

export const duplicateDesignRequestSchema = z.object({
  /** Project to copy into (same organization); defaults to the source design's project. */
  targetProjectId: z.uuid().optional(),
  name: nameSchema.optional(),
});

// ── editor (I15) ─────────────────────────────────────────────────────────────

/** Everything the editor needs to open a design in one request (SPEC-007 §5, I15). */
export const editorStateSchema = z.object({
  design: designSchema,
  project: z.object({
    id: z.uuid(),
    displayId: z.string(),
    name: z.string(),
    status: projectStatusSchema,
    /** Designs of completed / archived projects are read-only until reopened. */
    editable: z.boolean(),
  }),
  workingCopy: workingCopySchema,
  /** Latest committed revision (null only for designs created before their first commit). */
  headRevision: revisionSummarySchema.nullable(),
  /** Approved revision, when there is one (approvals arrive in I28). */
  approvedRevision: revisionSummarySchema.nullable(),
  /** What the current person may do here; the server still enforces every action. */
  capabilities: z.object({
    canEdit: z.boolean(),
    canCommit: z.boolean(),
    canRestore: z.boolean(),
    canGenerate: z.boolean(),
    /** Attach/replace library artifacts (`artifact.use`, I18). */
    canUseArtifacts: z.boolean().default(false),
    /** Save a component as a new private artifact (`artifact.create`). */
    canCreateArtifacts: z.boolean().default(false),
    /** Save straight into the organization library (`artifact.publish`). */
    canPublishArtifacts: z.boolean().default(false),
  }),
  /** Why editing is off (null when `canEdit`). */
  readOnlyReason: z.enum(['permission', 'project_status']).nullable(),
  userId: z.uuid(),
});
export type EditorState = z.infer<typeof editorStateSchema>;
