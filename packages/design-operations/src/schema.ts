import {
  componentIdSchema,
  componentSideSchema,
  componentTypeKeySchema,
  designComponentSchema,
  designRelationshipSchema,
  entityRefSchema,
  placementSchema,
  propertyKeySchema,
  relationshipTypeSchema,
  unitSchema,
} from '@ai-designer/garment-model';
import { z } from 'zod';

/**
 * Design operations (SPEC-004 §7, SPEC-003 §16, I14). Every change to a working copy is one of these.
 * `ClientOperation` is what users may submit; `InternalOperation`s (exact restores) are only created
 * by the server (stored undo data, imports) because they can carry any provenance.
 */
export const OPERATION_SCHEMA_VERSION = '1';

const id = componentIdSchema;
const relId = z.string().regex(/^rel_[a-z0-9]{8,32}$/);
const bindingId = z.string().regex(/^bnd_[a-z0-9]{8,32}$/);
const uuidLike = z.string().trim().min(1).max(200);

/** A value typed by a person: the server stamps who/when; never AI-sourced. */
export const setPropertySchema = z.object({
  type: z.literal('set_property'),
  componentId: id,
  key: propertyKeySchema,
  value: z.json(),
  unit: unitSchema.nullable().default(null),
  /** `confirmed` (default: the person states it) or `proposed` (a suggestion to review). */
  status: z.enum(['confirmed', 'proposed']).default('confirmed'),
  note: z.string().max(500).nullable().default(null),
});

export const resetPropertySchema = z.object({
  type: z.literal('reset_property'),
  componentId: id,
  key: propertyKeySchema,
});

/** Review decisions on existing values (confirm / reject inferred values, mark not applicable). */
export const setPropertyStatusSchema = z.object({
  type: z.literal('set_property_status'),
  componentId: id,
  key: propertyKeySchema,
  action: z.enum(['confirm', 'reject', 'needs_review', 'not_applicable']),
});

export const addComponentSchema = z.object({
  type: z.literal('add_component'),
  /** Filled by the server when omitted (recorded in the stored operation). */
  componentId: id.optional(),
  componentType: componentTypeKeySchema,
  displayName: z.string().trim().min(1).max(120).optional(),
  parentComponentId: id.nullable(),
  side: componentSideSchema.default('none'),
});

export const removeComponentSchema = z.object({
  type: z.literal('remove_component'),
  componentId: id,
  /** Also remove child components and relationships that point at removed components (CMP-019). */
  cascade: z.boolean().default(false),
});

export const setComponentVisibilitySchema = z.object({
  type: z.literal('set_component_visibility'),
  componentId: id,
  visible: z.boolean(),
});

export const setComponentLockSchema = z.object({
  type: z.literal('set_component_lock'),
  componentId: id,
  locked: z.boolean(),
});

export const renameComponentSchema = z.object({
  type: z.literal('rename_component'),
  componentId: id,
  displayName: z.string().trim().min(1).max(120),
});

const placementRequestSchema = z.object({
  region: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/)
    .nullable()
    .default(null),
  anchor: z.string().trim().min(1).max(80).nullable().default(null),
  mode: z
    .enum(['attach', 'follow_boundary', 'fixed_position', 'tiled_fill'])
    .nullable()
    .default(null),
  offsetMm: z.number().finite().nullable().default(null),
});
export type PlacementRequest = z.infer<typeof placementRequestSchema>;

/** Pins an exact artifact revision on a component (ART-004); placed artifacts get a relationship. */
export const attachArtifactSchema = z.object({
  type: z.literal('attach_artifact'),
  componentId: id,
  artifactRevisionId: uuidLike,
  role: z.string().trim().min(1).max(80).nullable().default(null),
  placement: placementRequestSchema.nullable().default(null),
  /** Filled by the server when omitted. */
  bindingId: bindingId.optional(),
  relationshipId: relId.optional(),
});

/** Explicitly moves a binding to another revision (the only way designs pick up artifact updates). */
export const replaceArtifactSchema = z.object({
  type: z.literal('replace_artifact'),
  componentId: id,
  bindingId,
  artifactRevisionId: uuidLike,
});

export const detachArtifactSchema = z.object({
  type: z.literal('detach_artifact'),
  componentId: id,
  bindingId,
});

export const updatePlacementSchema = z.object({
  type: z.literal('update_placement'),
  relationshipId: relId,
  placement: placementRequestSchema.partial(),
});

export const addRelationshipSchema = z.object({
  type: z.literal('add_relationship'),
  relationshipId: relId.optional(),
  relationshipType: relationshipTypeSchema,
  source: entityRefSchema,
  target: entityRefSchema,
  placement: placementSchema.nullable().default(null),
  constraints: z.array(z.string()).default([]),
});

export const removeRelationshipSchema = z.object({
  type: z.literal('remove_relationship'),
  relationshipId: relId,
});

/** Operations that only an AI strategy could execute (registered so the router can refuse clearly). */
export const regenerateRegionSchema = z.object({
  type: z.literal('regenerate_region'),
  componentId: id,
  instruction: z.string().trim().min(1).max(2000),
});
export const interpretReferenceSchema = z.object({
  type: z.literal('interpret_reference'),
  assetId: uuidLike,
});

const singleClientOperations = [
  setPropertySchema,
  resetPropertySchema,
  setPropertyStatusSchema,
  addComponentSchema,
  removeComponentSchema,
  setComponentVisibilitySchema,
  setComponentLockSchema,
  renameComponentSchema,
  attachArtifactSchema,
  replaceArtifactSchema,
  detachArtifactSchema,
  updatePlacementSchema,
  addRelationshipSchema,
  removeRelationshipSchema,
  regenerateRegionSchema,
  interpretReferenceSchema,
] as const;

export const singleClientOperationSchema = z.discriminatedUnion('type', singleClientOperations);
export type SingleClientOperation = z.infer<typeof singleClientOperationSchema>;

/** Several operations applied as one step (one undo step); all or nothing. */
export const batchSchema = z.object({
  type: z.literal('batch'),
  operations: z.array(singleClientOperationSchema).min(1).max(100),
});

/** Undo/redo: apply the exact inverse the server stored for an earlier operation. */
export const revertOperationSchema = z.object({
  type: z.literal('revert_operation'),
  operationId: uuidLike,
});

export const clientOperationSchema = z.discriminatedUnion('type', [
  ...singleClientOperations,
  batchSchema,
  revertOperationSchema,
]);
export type ClientOperation = z.infer<typeof clientOperationSchema>;
export type ClientOperationInput = z.input<typeof clientOperationSchema>;

// ── internal operations (server-created only) ────────────────────────────────

/** Exact restore of entities: snapshot = put, null = delete (stored undo data). */
export const restoreEntitiesSchema = z.object({
  type: z.literal('restore_entities'),
  components: z.record(z.string(), designComponentSchema.nullable()).default({}),
  relationships: z.record(z.string(), designRelationshipSchema.nullable()).default({}),
});
/** Full-state replacement for imports and system tools (never from the editor). */
export const replaceStateSchema = z.object({
  type: z.literal('replace_state'),
  state: z.record(z.string(), z.unknown()),
});

export const internalOperationSchema = z.discriminatedUnion('type', [
  restoreEntitiesSchema,
  replaceStateSchema,
]);
export type InternalOperation = z.infer<typeof internalOperationSchema>;

export type Operation = Exclude<ClientOperation, { type: 'revert_operation' }> | InternalOperation;
export type OperationType = Operation['type'] | 'revert_operation';

// ── envelope (SPEC-004 §7.2) ─────────────────────────────────────────────────

export const preservationConstraintSchema = z.object({
  /** What should not change, e.g. `garment_silhouette`, `cmp_…`, `dimension.sleeve_length`. */
  target: z.string().trim().min(1).max(120),
  requirement: z.enum(['preserve', 'may_change']).default('preserve'),
});
export type PreservationConstraint = z.infer<typeof preservationConstraintSchema>;

export const executionPolicySchema = z.object({
  allowDeterministic: z.boolean().default(true),
  allowAi: z.boolean().default(false),
  requireUserReview: z.boolean().default(false),
});
export type ExecutionPolicy = z.infer<typeof executionPolicySchema>;

export const sourceRefSchema = z.object({
  entityType: z.enum(['asset', 'artifact_revision', 'design_revision']),
  entityId: uuidLike,
});

export const operationEnvelopeSchema = z.object({
  operation: clientOperationSchema,
  preservationConstraints: z.array(preservationConstraintSchema).max(50).default([]),
  sourceRefs: z.array(sourceRefSchema).max(50).default([]),
  executionPolicy: executionPolicySchema.default({
    allowDeterministic: true,
    allowAi: false,
    requireUserReview: false,
  }),
});
export type OperationEnvelope = z.infer<typeof operationEnvelopeSchema>;
