import { z } from 'zod';

import { designComponentSchema } from './component.js';
import { constraintSchema } from './constraint.js';
import { designRelationshipSchema } from './relationship.js';

export const SCHEMA_VERSION = '1.0.0';

export const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, { message: 'Use a version like 1.0.0' });

export const StateOrigins = ['template', 'user', 'ai', 'import', 'duplicate'] as const;

export const stateProvenanceSchema = z.object({
  createdFrom: z.enum(StateOrigins),
  templateKey: z.string().max(80).nullable().default(null),
  /** Revision this state was copied from, if any. */
  sourceRevisionId: z.string().max(200).nullable().default(null),
});

/**
 * The root snapshot stored in `WorkingCopy.state` and `DesignRevision.snapshot` (I12).
 * It is the source of truth: images, SVG and 3D are derived from it.
 */
export const garmentDesignStateSchema = z.looseObject({
  schemaVersion: semverSchema,
  /** Family, e.g. `shirt`, `tshirt`. */
  garmentType: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  /** Registered category key, or null while unknown (DSN-003). */
  garmentCategory: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .nullable()
    .default(null),
  components: z.array(designComponentSchema).default([]),
  relationships: z.array(designRelationshipSchema).default([]),
  constraints: z.array(constraintSchema).default([]),
  annotationsRef: z.string().max(200).nullable().default(null),
  /** Descriptive data; never manufacturing evidence unless explicitly designated (DSN-007). */
  metadata: z.record(z.string(), z.json()).default({}),
  provenance: stateProvenanceSchema,
});
export type GarmentDesignState = z.infer<typeof garmentDesignStateSchema>;
export type GarmentDesignStateInput = z.input<typeof garmentDesignStateSchema>;

export function parseDesignState(input: unknown): GarmentDesignState {
  return garmentDesignStateSchema.parse(input);
}
