import { z } from 'zod';

export const EntityTypes = [
  'design_component',
  'artifact_revision',
  'design_revision',
  'asset',
  'relationship',
  'constraint',
] as const;
export const entityTypeSchema = z.enum(EntityTypes);
export type EntityType = z.infer<typeof entityTypeSchema>;

/**
 * Points at another entity. For `artifact_revision` the id IS the revision id (ART-004: references
 * never float to "latest").
 */
export const entityRefSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().trim().min(1).max(200),
});
export type EntityRef = z.infer<typeof entityRefSchema>;

export const componentRef = (componentId: string): EntityRef => ({
  entityType: 'design_component',
  entityId: componentId,
});
