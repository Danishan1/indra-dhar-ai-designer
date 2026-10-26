import { z } from 'zod';

import { geometryRefSchema } from '../schema/component.js';
import {
  propertyKeySchema,
  propertyValueSchema,
  type PropertyValue,
} from '../schema/property-value.js';

/**
 * Reusable artifacts (SPEC-003 §11, I13): a stable artifact with immutable revisions. A revision's
 * `definition` says where and how it can be used (machine-readable, ART-012) and how to draw it;
 * its `properties` keep visual and physical/manufacturing facts apart (ART-008).
 */

/** Categories and their display-id prefixes (`SLV-0007`, `LAC-0012-R002`). */
export const ArtifactCategories = {
  sleeve: 'SLV',
  collar: 'COL',
  cuff: 'CUF',
  pocket: 'PKT',
  placket: 'PLK',
  neckline: 'NCK',
  fabric: 'FAB',
  lace: 'LAC',
  trim: 'TRM',
  embroidery: 'EMB',
  button: 'BTN',
  artwork: 'ART',
} as const;
export type ArtifactCategory = keyof typeof ArtifactCategories;
export const ARTIFACT_CATEGORY_KEYS = Object.keys(ArtifactCategories) as ArtifactCategory[];
export const artifactCategorySchema = z.enum(
  ARTIFACT_CATEGORY_KEYS as [ArtifactCategory, ...ArtifactCategory[]],
);

/**
 * How much geometry an artifact really has (SPEC-010 §29.5, levels from §8): the UI explains what
 * is possible instead of inventing geometry.
 */
export const GeometryCapabilities = ['G0', 'G1', 'G2'] as const;
export const geometryCapabilitySchema = z.enum(GeometryCapabilities);
export type GeometryCapability = z.infer<typeof geometryCapabilitySchema>;
export const GEOMETRY_CAPABILITY_LABELS: Record<GeometryCapability, string> = {
  G0: 'Image only',
  G1: 'Annotated image',
  G2: 'Editable 2D',
};

export const PlacementModes = [
  'attach',
  'follow_boundary',
  'fixed_position',
  'tiled_fill',
] as const;
export const placementModeSchema = z.enum(PlacementModes);
export type PlacementMode = z.infer<typeof placementModeSchema>;

/**
 * Parameters for the parametric 2D renderer (I16 reads and extends these). Values are plain
 * numbers/strings/booleans; ratios are 0–1 of the target component, lengths are millimetres.
 */
export const ShapeKinds = [
  'sleeve',
  'collar',
  'cuff',
  'pocket',
  'placket',
  'neckline',
  'border',
  'motif',
  'button',
  'swatch',
] as const;
export const parametricShapeParamsSchema = z.object({
  kind: z.enum(ShapeKinds),
  params: z.record(
    z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
    z.union([z.number().finite(), z.string().max(80), z.boolean()]),
  ),
});
export type ParametricShapeParams = z.infer<typeof parametricShapeParamsSchema>;

const componentTypeKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const regionKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

export const artifactDefinitionSchema = z.object({
  /** Component types this artifact can be used on (ART-012). */
  compatibleTargetTypes: z.array(componentTypeKey).min(1),
  /** Regions where it may be placed; null = anywhere on a compatible target. */
  allowedPlacementRegions: z.array(regionKey).nullable().default(null),
  /** Regions suggested first by the editor. */
  preferredPlacementRegions: z.array(regionKey).default([]),
  /** Can the same component use it more than once (e.g. buttons)? */
  repeatable: z.boolean().default(false),
  placementModes: z.array(placementModeSchema).min(1).default(['attach']),
  shapeParams: parametricShapeParamsSchema.nullable().default(null),
  /** Small inline SVG preview (built-in library); organization artifacts use `previewAssetId`. */
  previewSvg: z.string().max(20_000).nullable().default(null),
  geometryRefs: z.array(geometryRefSchema).default([]),
  /** 3D model asset (I36). */
  model3dRef: z.string().max(200).nullable().default(null),
});
export type ArtifactDefinition = z.infer<typeof artifactDefinitionSchema>;
export type ArtifactDefinitionInput = z.input<typeof artifactDefinitionSchema>;

/**
 * Properties are split (ART-008). A visual-only artifact is fine; physical facts default to
 * `missing` until someone records them with evidence.
 */
export const artifactPropertiesSchema = z.object({
  visual: z.record(propertyKeySchema, propertyValueSchema).default({}),
  physical: z.record(propertyKeySchema, propertyValueSchema).default({}),
});
export type ArtifactProperties = z.infer<typeof artifactPropertiesSchema>;

/** Never set by clients: derived from the revision (ART-014). */
export const ArtifactValidationStatuses = [
  'unvalidated',
  'design_asset_validated',
  'production_validated',
] as const;
export type ArtifactValidationStatus = (typeof ArtifactValidationStatuses)[number];

/**
 * - `production_validated` only when there is at least one physical property and every physical
 *   property is confirmed (ART-014).
 * - `design_asset_validated` when it can be drawn (preview, geometry or shape parameters).
 * - otherwise `unvalidated`.
 */
export function deriveValidationStatus(
  definition: ArtifactDefinition,
  properties: ArtifactProperties,
  hasPreviewAsset: boolean,
): ArtifactValidationStatus {
  const physical = Object.values(properties.physical) as PropertyValue[];
  if (physical.length > 0 && physical.every((p) => p.status === 'confirmed'))
    return 'production_validated';
  const drawable =
    hasPreviewAsset ||
    definition.previewSvg !== null ||
    definition.shapeParams !== null ||
    definition.geometryRefs.length > 0;
  return drawable ? 'design_asset_validated' : 'unvalidated';
}

/** G2 when there are vector geometry refs or renderer shape parameters; G0 for a picture only. */
export function deriveGeometryCapability(definition: ArtifactDefinition): GeometryCapability {
  if (
    definition.shapeParams !== null ||
    definition.geometryRefs.some((g) => g.coordinateSpace !== 'image_px')
  )
    return 'G2';
  if (definition.geometryRefs.length > 0) return 'G1';
  return 'G0';
}
