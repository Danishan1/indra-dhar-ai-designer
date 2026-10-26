import { describe, expect, it } from 'vitest';

import type { Placement } from './schema/placement.js';
import { placementSchema } from './schema/placement.js';
import type { DesignRelationship } from './schema/relationship.js';
import { byType, shirt } from './test-helpers.js';
import { validateDesignState } from './validation/structural.js';

const ruleList = (s: ReturnType<typeof shirt>, outcome: string) =>
  validateDesignState(s)
    .findings.filter((f) => f.outcome === outcome)
    .map((f) => f.ruleId);

const placement = (over: Partial<Placement> = {}): Placement => ({
  region: 'hem',
  anchor: 'edge',
  coordinateSpace: 'component_local',
  translation: null,
  rotationDeg: null,
  scale: null,
  orientation: 'follow_boundary',
  offset: { value: 0, unit: 'mm' },
  geometryRevisionId: null,
  calibrationRef: null,
  approximate: false,
  confidence: null,
  ...over,
});

function rel(over: Partial<DesignRelationship>): DesignRelationship {
  return {
    relationshipId: 'rel_aaaaaaaaaaaa',
    type: 'attached_to',
    source: { entityType: 'design_component', entityId: 'x' },
    target: { entityType: 'design_component', entityId: 'y' },
    placement: null,
    constraints: [],
    status: 'confirmed',
    provenanceRefs: [],
    ...over,
  };
}
const c = (id: string) => ({ entityType: 'design_component' as const, entityId: id });
const art = (id: string) => ({ entityType: 'artifact_revision' as const, entityId: id });

describe('relationships (REL-001…008)', () => {
  it('accepts a valid attachment between components', () => {
    const s = shirt();
    s.relationships = [
      rel({
        source: c(byType(s, 'collar').componentId),
        target: c(byType(s, 'garment_body').componentId),
      }),
    ];
    expect(validateDesignState(s).ok).toBe(true);
    expect(ruleList(s, 'requires_manual_review')).toEqual([]);
  });

  it('supports artifact-revision → component relationships with placement (REL-003, REL-004)', () => {
    const s = shirt();
    const cuff = byType(s, 'sleeve', 'left');
    s.relationships = [
      rel({
        type: 'decorative_trim_applied_to',
        source: art('LAC-0012-R002'),
        target: c(cuff.componentId),
        placement: placement(),
      }),
    ];
    expect(validateDesignState(s).ok).toBe(true);
    s.relationships = [
      rel({
        type: 'decorative_trim_applied_to',
        source: art('LAC-0012-R002'),
        target: c(cuff.componentId),
      }),
    ];
    expect(ruleList(s, 'error')).toContain('relationship.placement_required');
  });

  it('validates endpoints (REL-002)', () => {
    const s = shirt();
    s.relationships = [
      rel({ source: c('cmp_nothere00001'), target: c(byType(s, 'collar').componentId) }),
    ];
    expect(ruleList(s, 'error')).toContain('relationship.endpoint_missing');
    s.relationships = [
      rel({
        type: 'applied_to',
        source: c(byType(s, 'collar').componentId),
        target: c(byType(s, 'garment_body').componentId),
        placement: placement(),
      }),
    ];
    expect(ruleList(s, 'error')).toContain('relationship.endpoint_type_not_allowed');
    s.relationships = [
      rel({
        type: 'applied_to',
        source: art('r1'),
        target: c(byType(s, 'collar').componentId),
        placement: placement(),
      }),
    ];
    expect(validateDesignState(s, undefined, { knownArtifactRevisions: new Set(['r1']) }).ok).toBe(
      true,
    );
    expect(
      validateDesignState(s, undefined, { knownArtifactRevisions: new Set() }).findings.map(
        (f) => f.ruleId,
      ),
    ).toContain('relationship.endpoint_missing');
  });

  it('rejects self references, kind mismatch and unknown constraints', () => {
    const s = shirt();
    const id = byType(s, 'collar').componentId;
    s.relationships = [rel({ source: c(id), target: c(id), constraints: ['cst_missing00001'] })];
    expect(ruleList(s, 'error')).toEqual(
      expect.arrayContaining(['relationship.self_reference', 'relationship.constraint_missing']),
    );
    s.relationships = [rel({ type: 'replaces', source: c(id), target: art('r1') })];
    expect(ruleList(s, 'error')).toContain('relationship.kind_mismatch');
  });

  it('enforces cardinality and warns on duplicates (including symmetric reversals)', () => {
    const s = shirt();
    const [a, b, d] = [byType(s, 'collar'), byType(s, 'hem'), byType(s, 'garment_body')].map(
      (x) => x.componentId,
    ) as [string, string, string];
    s.relationships = [
      rel({ relationshipId: 'rel_000000000001', type: 'lining_for', source: c(a), target: c(b) }),
      rel({ relationshipId: 'rel_000000000002', type: 'lining_for', source: c(a), target: c(d) }),
    ];
    expect(ruleList(s, 'error')).toContain('relationship.cardinality_source');
    s.relationships = [
      rel({ relationshipId: 'rel_000000000001', type: 'aligned_with', source: c(a), target: c(b) }),
      rel({ relationshipId: 'rel_000000000002', type: 'aligned_with', source: c(b), target: c(a) }),
    ];
    expect(ruleList(s, 'warning')).toContain('relationship.duplicate');
  });

  it('keeps approximate and AI-proposed relationships visibly distinct (REL-007, REL-008)', () => {
    const s = shirt();
    s.relationships = [
      rel({
        type: 'overlays',
        source: art('r1'),
        target: c(byType(s, 'collar').componentId),
        placement: placement({ approximate: true }),
        status: 'proposed',
        provenanceRefs: ['job-1'],
      }),
    ];
    expect(ruleList(s, 'warning')).toContain('relationship.placement_approximate');
    expect(ruleList(s, 'requires_manual_review')).toContain('relationship.needs_review');
  });

  it('constrained_by points at constraints that exist', () => {
    const s = shirt();
    s.constraints = [
      {
        constraintId: 'cst_aaaaaaaaaaaa',
        constraintType: 'allowed_placement_regions',
        scope: { componentType: 'sleeve' },
        rule: { regions: ['hem'] },
        severity: 'warning',
        version: 1,
      },
    ];
    s.relationships = [
      rel({
        type: 'constrained_by',
        source: c(byType(s, 'sleeve', 'left').componentId),
        target: { entityType: 'constraint', entityId: 'cst_aaaaaaaaaaaa' },
      }),
    ];
    expect(validateDesignState(s).ok).toBe(true);
    s.relationships[0]!.target.entityId = 'cst_bbbbbbbbbbbb';
    expect(ruleList(s, 'error')).toContain('relationship.endpoint_missing');
  });

  it('reports duplicate ids', () => {
    const s = shirt();
    const r = rel({
      source: c(byType(s, 'collar').componentId),
      target: c(byType(s, 'garment_body').componentId),
    });
    s.relationships = [r, r];
    s.constraints = [
      {
        constraintId: 'cst_aaaaaaaaaaaa',
        constraintType: 'type_compatibility',
        scope: {},
        rule: {},
        severity: 'info',
        version: 1,
      },
      {
        constraintId: 'cst_aaaaaaaaaaaa',
        constraintType: 'type_compatibility',
        scope: {},
        rule: {},
        severity: 'info',
        version: 1,
      },
    ];
    expect(ruleList(s, 'error').filter((x) => x === 'id.duplicate')).toHaveLength(2);
  });
});

describe('placement (GEO-001…007)', () => {
  it('requires a coordinate space and an approximate flag', () => {
    expect(placementSchema.safeParse({ approximate: false }).success).toBe(false);
    expect(placementSchema.safeParse({ coordinateSpace: 'design_2d' }).success).toBe(false);
    expect(
      placementSchema.safeParse({ coordinateSpace: 'design_2d', approximate: true }).success,
    ).toBe(true);
  });

  it('refuses a physical offset in image coordinates without a calibration (GEO-002)', () => {
    const bad = placementSchema.safeParse({
      coordinateSpace: 'image_px',
      approximate: true,
      offset: { value: 5, unit: 'mm' },
    });
    expect(bad.success).toBe(false);
    const ok = placementSchema.safeParse({
      coordinateSpace: 'image_px',
      approximate: true,
      offset: { value: 5, unit: 'mm' },
      calibrationRef: 'asset-scale-1',
    });
    expect(ok.success).toBe(true);
  });
});
