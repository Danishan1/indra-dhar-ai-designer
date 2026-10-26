import { z } from 'zod';

import { coordinateSpaceSchema } from './placement.js';
import { propertyKeySchema, propertyValueSchema } from './property-value.js';

export const COMPONENT_ID_PATTERN = /^cmp_[a-z0-9]{8,32}$/;
export const componentIdSchema = z
  .string()
  .regex(COMPONENT_ID_PATTERN, { message: 'Invalid component id' });

/** Catalog keys are lowercase snake_case so the catalog can grow without schema changes (CMP-015…018). */
export const componentTypeKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const ComponentSides = ['left', 'right', 'center', 'none'] as const;
export const componentSideSchema = z.enum(ComponentSides);
export type ComponentSide = z.infer<typeof componentSideSchema>;

/**
 * Binds a reusable artifact to this component instance. The revision is always pinned (ART-004):
 * two components may bind the same revision and still keep independent properties (SPEC-003 AC-03).
 */
export const artifactBindingSchema = z.object({
  bindingId: z.string().regex(/^bnd_[a-z0-9]{8,32}$/),
  artifactId: z.string().trim().min(1).max(200),
  artifactRevisionId: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(80).nullable().default(null),
});
export type ArtifactBinding = z.infer<typeof artifactBindingSchema>;

export const geometryRefSchema = z.object({
  refId: z.string().trim().min(1).max(200),
  /** Immutable geometry revision or asset version (GEO-003). */
  geometryRevisionId: z.string().trim().min(1).max(200),
  coordinateSpace: coordinateSpaceSchema,
});
export type GeometryRef = z.infer<typeof geometryRefSchema>;

export const assetRefSchema = z.object({
  assetId: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(80).nullable().default(null),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

export const designComponentSchema = z.looseObject({
  componentId: componentIdSchema,
  componentType: componentTypeKeySchema,
  displayName: z.string().trim().min(1).max(120),
  parentComponentId: componentIdSchema.nullable().default(null),
  side: componentSideSchema.default('none'),
  properties: z.record(propertyKeySchema, propertyValueSchema).default({}),
  artifactBindings: z.array(artifactBindingSchema).default([]),
  geometryRefs: z.array(geometryRefSchema).default([]),
  assetRefs: z.array(assetRefSchema).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  /** Editor-only flags: not physical properties, excluded from semantic diff/hash (FR-EDT-024). */
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
});
export type DesignComponent = z.infer<typeof designComponentSchema>;
