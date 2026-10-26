import { z } from 'zod';

import { lengthUnitSchema } from '../units.js';

/** SPEC-003 §14.1. Every geometry/placement value names its space (GEO-001, GEO-004). */
export const CoordinateSpaces = [
  'image_px',
  'image_normalized',
  'design_2d',
  'component_local',
  'world_3d',
  'pattern',
] as const;
export const coordinateSpaceSchema = z.enum(CoordinateSpaces);
export type CoordinateSpace = z.infer<typeof coordinateSpaceSchema>;

/** Spaces measured in image pixels/fractions: physical lengths need a calibration to be meaningful (GEO-002). */
export const IMAGE_SPACES: readonly CoordinateSpace[] = ['image_px', 'image_normalized'];

export const vec2Schema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const vec3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

export const PlacementOrientations = [
  'follow_boundary',
  'upright',
  'fixed_angle',
  'mirrored',
] as const;

export const placementSchema = z
  .object({
    /** Named region of the target ("hem", "left_chest"); free text is allowed so the catalog can grow. */
    region: z.string().trim().min(1).max(80).nullable().default(null),
    anchor: z.string().trim().min(1).max(80).nullable().default(null),
    coordinateSpace: coordinateSpaceSchema,
    translation: z.union([vec2Schema, vec3Schema]).nullable().default(null),
    rotationDeg: z.number().finite().nullable().default(null),
    scale: z.union([z.number().positive().finite(), vec2Schema]).nullable().default(null),
    orientation: z.enum(PlacementOrientations).nullable().default(null),
    offset: z
      .object({ value: z.number().finite(), unit: lengthUnitSchema })
      .nullable()
      .default(null),
    /** Immutable geometry revision / asset version this placement was computed against (GEO-003). */
    geometryRevisionId: z.string().trim().min(1).max(200).nullable().default(null),
    /** Scale source needed to turn image coordinates into millimetres (GEO-002). */
    calibrationRef: z.string().trim().min(1).max(200).nullable().default(null),
    /** A visual approximation, not a production-valid attachment (GEO-007, REL-008). */
    approximate: z.boolean(),
    confidence: z.number().min(0).max(1).nullable().default(null),
  })
  .superRefine((p, ctx) => {
    if (p.offset && IMAGE_SPACES.includes(p.coordinateSpace) && p.calibrationRef === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['calibrationRef'],
        message: 'A physical offset in image coordinates needs a calibration or scale source',
      });
    }
  });
export type Placement = z.infer<typeof placementSchema>;
