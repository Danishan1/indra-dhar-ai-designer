import { z } from 'zod';

import { valueStatusSchema } from '../status.js';

import { entityRefSchema } from './entity-ref.js';
import { placementSchema } from './placement.js';

/** SPEC-003 §10.3. The registry (registry/relationship-types.ts) defines endpoints and cardinality. */
export const RelationshipTypes = [
  'attached_to',
  'contains',
  'overlays',
  'applied_to',
  'decorative_trim_applied_to',
  'embroidery_placed_on',
  'lining_for',
  'aligned_with',
  'derived_from',
  'constrained_by',
  'connected_to',
  'replaces',
  'references',
] as const;
export const relationshipTypeSchema = z.enum(RelationshipTypes);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const designRelationshipSchema = z.looseObject({
  relationshipId: z.string().regex(/^rel_[a-z0-9]{8,32}$/),
  type: relationshipTypeSchema,
  source: entityRefSchema,
  target: entityRefSchema,
  placement: placementSchema.nullable().default(null),
  /** Ids of constraints this relationship is subject to (REL-005). */
  constraints: z.array(z.string()).default([]),
  /** Same vocabulary as property values: an AI-proposed relationship is not confirmed (REL-007, REL-008). */
  status: valueStatusSchema,
  /** Operation / job / user ids that created it (REL-007). */
  provenanceRefs: z.array(z.string().min(1).max(200)).default([]),
});
export type DesignRelationship = z.infer<typeof designRelationshipSchema>;
