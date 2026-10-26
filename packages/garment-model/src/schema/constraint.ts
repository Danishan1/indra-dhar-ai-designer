import { z } from 'zod';

/** SPEC-003 §15.2 categories. Versioned business rule sets arrive in I20; this is the shape. */
export const ConstraintTypes = [
  'type_compatibility',
  'allowed_placement_regions',
  'component_dependency',
  'geometric_bounds',
  'required_property_presence',
  'mutually_exclusive_options',
  'material_compatibility',
  'rendering_capability',
  'production_specification_completeness',
  'organization_permission',
] as const;
export const constraintTypeSchema = z.enum(ConstraintTypes);
export type ConstraintType = z.infer<typeof constraintTypeSchema>;

export const ConstraintSeverities = ['error', 'warning', 'info'] as const;
export const constraintSeveritySchema = z.enum(ConstraintSeverities);

export const constraintSchema = z.object({
  constraintId: z.string().regex(/^cst_[a-z0-9]{8,32}$/),
  constraintType: constraintTypeSchema,
  /** What the rule applies to (CST-001): entity types, component types, ids… */
  scope: z.record(z.string(), z.json()),
  rule: z.record(z.string(), z.json()),
  severity: constraintSeveritySchema,
  /** Version of this constraint definition, so validation is repeatable (CST-004). */
  version: z.number().int().min(1),
});
export type Constraint = z.infer<typeof constraintSchema>;
