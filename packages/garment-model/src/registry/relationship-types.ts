import type { EntityType } from '../schema/entity-ref.js';
import type { RelationshipType } from '../schema/relationship.js';

export interface RelationshipTypeDef {
  type: RelationshipType;
  label: string;
  allowedSources: readonly EntityType[];
  allowedTargets: readonly EntityType[];
  /** The relationship is meaningless without structured placement (REL-004), e.g. lace on a hem. */
  requiresPlacement: boolean;
  /** Max relationships of this type leaving one source entity (undefined = unlimited). */
  maxPerSource?: number;
  /** Max relationships of this type pointing at one target entity. */
  maxPerTarget?: number;
  /** A→B means B→A; duplicates in either direction are the same relationship. */
  symmetric?: boolean;
  /** Both ends must be the same entity kind (derived_from, replaces). */
  sameKind?: boolean;
}

const C: EntityType = 'design_component';
const AR: EntityType = 'artifact_revision';
const ALL: readonly EntityType[] = [
  'design_component',
  'artifact_revision',
  'design_revision',
  'asset',
  'relationship',
  'constraint',
];

const r = (d: RelationshipTypeDef): RelationshipTypeDef => Object.freeze(d);

/** SPEC-003 §10.3 with endpoint and cardinality rules (REL-002…005). */
export const RELATIONSHIP_TYPES: readonly RelationshipTypeDef[] = Object.freeze([
  r({
    type: 'attached_to',
    label: 'Attached to',
    allowedSources: [C],
    allowedTargets: [C],
    requiresPlacement: false,
  }),
  r({
    type: 'contains',
    label: 'Contains',
    allowedSources: [C],
    allowedTargets: [C],
    requiresPlacement: false,
  }),
  r({
    type: 'overlays',
    label: 'Overlays',
    allowedSources: [C, AR],
    allowedTargets: [C],
    requiresPlacement: true,
  }),
  r({
    type: 'applied_to',
    label: 'Applied to',
    allowedSources: [AR],
    allowedTargets: [C],
    requiresPlacement: true,
  }),
  r({
    type: 'decorative_trim_applied_to',
    label: 'Trim applied to',
    allowedSources: [AR],
    allowedTargets: [C],
    requiresPlacement: true,
  }),
  r({
    type: 'embroidery_placed_on',
    label: 'Embroidery placed on',
    allowedSources: [AR],
    allowedTargets: [C],
    requiresPlacement: true,
  }),
  r({
    type: 'lining_for',
    label: 'Lining for',
    allowedSources: [C],
    allowedTargets: [C],
    requiresPlacement: false,
    maxPerSource: 1,
  }),
  r({
    type: 'aligned_with',
    label: 'Aligned with',
    allowedSources: [C],
    allowedTargets: [C],
    requiresPlacement: false,
    symmetric: true,
  }),
  r({
    type: 'derived_from',
    label: 'Derived from',
    allowedSources: [C, AR, 'design_revision'],
    allowedTargets: [C, AR, 'design_revision'],
    requiresPlacement: false,
    maxPerSource: 1,
    sameKind: true,
  }),
  r({
    type: 'constrained_by',
    label: 'Constrained by',
    allowedSources: [C, 'relationship'],
    allowedTargets: ['constraint'],
    requiresPlacement: false,
  }),
  r({
    type: 'connected_to',
    label: 'Connected to',
    allowedSources: [C],
    allowedTargets: [C],
    requiresPlacement: false,
    symmetric: true,
  }),
  r({
    type: 'replaces',
    label: 'Replaces',
    allowedSources: [C, AR],
    allowedTargets: [C, AR],
    requiresPlacement: false,
    maxPerSource: 1,
    sameKind: true,
  }),
  r({
    type: 'references',
    label: 'References',
    allowedSources: ALL,
    allowedTargets: ALL,
    requiresPlacement: false,
  }),
]);
