import { z } from 'zod';

import { isoDateTimeSchema } from '../common.js';
import { pageQuerySchema, pageSchema } from '../pagination.js';

import { LifecycleActions, ProjectStatuses, VisibleProjectStatuses } from './lifecycle.js';

export const projectStatusSchema = z.enum(ProjectStatuses);
export const lifecycleActionSchema = z.enum(LifecycleActions);
export const ProjectVisibilities = ['organization', 'restricted'] as const;
export const projectVisibilitySchema = z.enum(ProjectVisibilities);
export type ProjectVisibility = z.infer<typeof projectVisibilitySchema>;

/** Actions a project-level grant can carry (the PDP checks them like role permissions). */
export const ProjectGrantActions = ['project.view', 'project.edit'] as const;
export const projectGrantActionSchema = z.enum(ProjectGrantActions);

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();
const tagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(20)
  .transform((tags) => [...new Set(tags)]);

/** Editable project metadata (FR-PRJ-002). */
const metadataShape = {
  description: optionalText(2000),
  productCategory: optionalText(80),
  season: optionalText(80),
  brand: optionalText(120),
  targetMarket: optionalText(120),
  styleNumber: optionalText(80),
  tags: tagsSchema.optional(),
};

export const createProjectRequestSchema = z.object({
  name: text(120).min(1, 'Give the project a name'),
  ...metadataShape,
  visibility: projectVisibilitySchema.default('organization'),
});
export type CreateProjectRequest = z.input<typeof createProjectRequestSchema>;

export const updateProjectRequestSchema = z.object({
  /** Optimistic concurrency (API-003): the version the client last saw. */
  expectedVersion: z.number().int().min(1),
  name: text(120).min(1).optional(),
  ...metadataShape,
});
export type UpdateProjectRequest = z.input<typeof updateProjectRequestSchema>;

export const updateVisibilityRequestSchema = z.object({
  expectedVersion: z.number().int().min(1),
  visibility: projectVisibilitySchema,
});

export const lifecycleRequestSchema = z.object({
  reason: text(500).optional(),
});
export type LifecycleRequest = z.input<typeof lifecycleRequestSchema>;

export const duplicateProjectRequestSchema = z.object({
  name: text(120).min(1).optional(),
});

export const projectSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  visibility: projectVisibilitySchema,
  productCategory: z.string().nullable(),
  season: z.string().nullable(),
  brand: z.string().nullable(),
  targetMarket: z.string().nullable(),
  styleNumber: z.string().nullable(),
  tags: z.array(z.string()),
  /** Set from I12 on (designs); null until then. */
  defaultDesignId: z.uuid().nullable(),
  /** Reason given for the last hold / reopen / archive (FR-PRJ-083, 086). */
  statusReason: z.string().nullable(),
  version: z.number().int(),
  createdBy: z.uuid().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema.nullable(),
  archivedAt: isoDateTimeSchema.nullable(),
  /** Copies show where they came from; approval status is never copied (FR-PRJ-007). */
  duplicatedFromId: z.uuid().nullable(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectSortSchema = z.enum(['updated_desc', 'created_desc', 'name_asc']);
export type ProjectSort = z.infer<typeof projectSortSchema>;

export const projectListQuerySchema = pageQuerySchema.extend({
  /** Omitted = active work (everything except archived). */
  status: z.enum(VisibleProjectStatuses).optional(),
  category: z.string().trim().max(80).optional(),
  season: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(120).optional(),
  /** Matches name, style number, brand, category and season (FR-PRJ-013). */
  q: z.string().trim().max(120).optional(),
  sort: projectSortSchema.default('updated_desc'),
});
export type ProjectListQuery = z.input<typeof projectListQuerySchema>;
export const projectListResponseSchema = pageSchema(projectSchema);

export const projectParamsSchema = z.object({ orgId: z.uuid(), projectId: z.uuid() });
export const revokeProjectGrantQuerySchema = z.object({ userId: z.uuid() });

export const deleteProjectQuerySchema = z.object({
  /** Confirms deletion although dependents exist (FR-PRJ-091). */
  acknowledgeDependents: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(false),
});

export const dependentSchema = z.object({
  type: z.string(),
  label: z.string(),
  count: z.number().int().min(0),
});
export const dependentsResponseSchema = z.object({
  items: z.array(dependentSchema),
  total: z.number().int().min(0),
});

export const createProjectGrantRequestSchema = z.object({
  userId: z.uuid(),
  actions: z.array(projectGrantActionSchema).min(1),
  expiresAt: isoDateTimeSchema.nullable().optional(),
});
export const projectGrantSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  actions: z.array(projectGrantActionSchema),
  expiresAt: isoDateTimeSchema.nullable(),
  grantedBy: z.uuid(),
  createdAt: isoDateTimeSchema,
});
export type ProjectGrant = z.infer<typeof projectGrantSchema>;
export const projectGrantListResponseSchema = z.object({ items: z.array(projectGrantSchema) });
