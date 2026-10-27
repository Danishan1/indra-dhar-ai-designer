import {
  artifactDefinitionSchema,
  sequentialRandomBytes,
  templates,
  type GarmentDesignState,
} from '@ai-designer/garment-model';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { applyOperation, type ApplyContext, type ArtifactRevisionInfo } from './apply.js';
import { invert } from './invert.js';
import { applyEntityPatch } from './patch.js';
import { clientOperationSchema, type Operation } from './schema.js';
import { OPERATION_TYPES, selectStrategy } from './strategy.js';

const WHEN = '2026-10-26T10:00:00.000Z';
const lace: ArtifactRevisionInfo = {
  artifactRevisionId: 'rev-lace-2',
  artifactId: 'art-lace',
  category: 'lace',
  definition: artifactDefinitionSchema.parse({
    compatibleTargetTypes: ['sleeve', 'hem'],
    allowedPlacementRegions: ['hem', 'opening'],
    preferredPlacementRegions: ['hem'],
    repeatable: true,
    placementModes: ['follow_boundary'],
    shapeParams: { kind: 'border', params: { widthMm: 25 } },
  }),
  geometryCapability: 'G2',
  active: true,
};
const collarArtifact: ArtifactRevisionInfo = {
  artifactRevisionId: 'rev-collar-1',
  artifactId: 'art-collar',
  category: 'collar',
  definition: artifactDefinitionSchema.parse({ compatibleTargetTypes: ['collar'] }),
  geometryCapability: 'G2',
  active: true,
};
const stated = (value: string) => ({
  value,
  unit: null,
  status: 'confirmed' as const,
  sourceType: 'imported_data' as const,
  sourceRefs: [],
  confidence: null,
  reviewRequired: false,
  confirmedBy: 'platform-library',
  confirmedAt: WHEN,
});
const raglanSleeve: ArtifactRevisionInfo = {
  artifactRevisionId: 'rev-raglan-1',
  artifactId: 'art-raglan',
  category: 'sleeve',
  name: 'Long raglan sleeve',
  definition: artifactDefinitionSchema.parse({ compatibleTargetTypes: ['sleeve'] }),
  geometryCapability: 'G2',
  active: true,
  visual: { 'construction.sleeve_type': stated('raglan') },
};
const navyTwill: ArtifactRevisionInfo = {
  artifactRevisionId: 'rev-navy-1',
  artifactId: 'art-navy',
  category: 'fabric',
  name: 'Navy twill',
  definition: artifactDefinitionSchema.parse({
    compatibleTargetTypes: ['garment_body', 'sleeve'],
    repeatable: true,
    placementModes: ['tiled_fill'],
  }),
  geometryCapability: 'G2',
  active: true,
  visual: { 'appearance.color': stated('#1e3a8a'), 'appearance.pattern': stated('solid') },
};
const ctx = (over: Partial<ApplyContext> = {}): ApplyContext => ({
  actorUserId: 'user-1',
  now: WHEN,
  operationId: 'op-1',
  artifacts: new Map([
    [lace.artifactRevisionId, lace],
    [collarArtifact.artifactRevisionId, collarArtifact],
    ['rev-lace-3', { ...lace, artifactRevisionId: 'rev-lace-3' }],
    ['rev-old', { ...lace, artifactRevisionId: 'rev-old', active: false }],
    [raglanSleeve.artifactRevisionId, raglanSleeve],
    [
      'rev-raglan-2',
      {
        ...raglanSleeve,
        artifactRevisionId: 'rev-raglan-2',
        visual: { 'construction.sleeve_type': stated('dolman') },
      },
    ],
    [navyTwill.artifactRevisionId, navyTwill],
  ]),
  ...over,
});
const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const find = (s: GarmentDesignState, type: string, side?: string) =>
  s.components.find((c) => c.componentType === type && (side === undefined || c.side === side))!;
const op = (o: unknown) => clientOperationSchema.parse(o) as Operation;
function ok(state: GarmentDesignState, o: unknown, c: ApplyContext = ctx()) {
  const r = applyOperation(state, op(o), c);
  if (!r.ok) throw new Error(JSON.stringify(r.findings));
  return r;
}
function blocked(state: GarmentDesignState, o: unknown, c: ApplyContext = ctx()) {
  const r = applyOperation(state, op(o), c);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.findings.map((f) => f.ruleId);
}

describe('properties', () => {
  it('set_property stamps the person, converts lengths to mm and never mutates the input', () => {
    const s = shirt();
    const frozen = JSON.stringify(s);
    const sleeve = find(s, 'sleeve', 'left');
    const r = ok(s, {
      type: 'set_property',
      componentId: sleeve.componentId,
      key: 'dimension.sleeve_length',
      value: 25,
      unit: 'in',
    });
    expect(JSON.stringify(s)).toBe(frozen);
    expect(find(r.state, 'sleeve', 'left').properties['dimension.sleeve_length']).toMatchObject({
      value: 635,
      unit: 'mm',
      status: 'confirmed',
      sourceType: 'user_input',
      confirmedBy: 'user-1',
      confirmedAt: WHEN,
    });
    expect(r.changed).toEqual([{ entityType: 'design_component', entityId: sleeve.componentId }]);
    expect(Object.keys(r.after.components)).toEqual([sleeve.componentId]);
  });

  it('proposed values need review; invalid values and wrong keys are refused (state untouched)', () => {
    const s = shirt();
    const collar = find(s, 'collar');
    const r = ok(s, {
      type: 'set_property',
      componentId: collar.componentId,
      key: 'construction.collar_type',
      value: 'point',
      status: 'proposed',
    });
    expect(find(r.state, 'collar').properties['construction.collar_type']).toMatchObject({
      status: 'proposed',
      reviewRequired: true,
      confirmedBy: null,
    });
    expect(
      blocked(s, {
        type: 'set_property',
        componentId: collar.componentId,
        key: 'construction.collar_type',
        value: 'wing',
      }),
    ).toEqual(['property.enum_value_not_allowed']);
    expect(
      blocked(s, {
        type: 'set_property',
        componentId: collar.componentId,
        key: 'dimension.body_length',
        value: 1,
        unit: 'mm',
      }),
    ).toEqual(['property.not_allowed_for_type']);
    expect(
      blocked(s, {
        type: 'set_property',
        componentId: 'cmp_doesnotexist',
        key: 'appearance.color',
        value: '#000000',
      }),
    ).toEqual(['operation.target_missing']);
    expect(
      blocked(s, {
        type: 'set_property',
        componentId: collar.componentId,
        key: 'dimension.collar_height',
        value: 40,
      }),
    ).toEqual(['property.unit_missing']);
  });

  it('reviews: confirm a proposed value, reject it, mark not applicable or needs review', () => {
    const s = shirt();
    const collar = find(s, 'collar');
    const confirmed = ok(s, {
      type: 'set_property_status',
      componentId: collar.componentId,
      key: 'construction.collar_type',
      action: 'confirm',
    });
    expect(find(confirmed.state, 'collar').properties['construction.collar_type']).toMatchObject({
      status: 'confirmed',
      value: 'spread',
      confirmedBy: 'user-1',
      sourceType: 'template',
    });
    const rejected = ok(s, {
      type: 'set_property_status',
      componentId: collar.componentId,
      key: 'construction.collar_type',
      action: 'reject',
    });
    expect(find(rejected.state, 'collar').properties['construction.collar_type']).toMatchObject({
      status: 'missing',
      value: null,
    });
    const na = ok(s, {
      type: 'set_property_status',
      componentId: collar.componentId,
      key: 'dimension.collar_height',
      action: 'not_applicable',
    });
    expect(find(na.state, 'collar').properties['dimension.collar_height']!.status).toBe(
      'not_applicable',
    );
    expect(
      blocked(s, {
        type: 'set_property_status',
        componentId: collar.componentId,
        key: 'dimension.collar_height',
        action: 'confirm',
      }),
    ).toEqual(['property.promotion_refused']);
    const review = ok(s, {
      type: 'set_property_status',
      componentId: collar.componentId,
      key: 'construction.collar_type',
      action: 'needs_review',
    });
    expect(find(review.state, 'collar').properties['construction.collar_type']!.status).toBe(
      'needs_review',
    );
    const reset = ok(confirmed.state, {
      type: 'reset_property',
      componentId: collar.componentId,
      key: 'construction.collar_type',
    });
    expect(find(reset.state, 'collar').properties['construction.collar_type']!.status).toBe(
      'missing',
    );
  });
});

describe('components', () => {
  it('adds a component with missing properties and a generated id', () => {
    const s = shirt();
    const r = ok(s, {
      type: 'add_component',
      componentType: 'pocket',
      parentComponentId: find(s, 'front_body_panel').componentId,
      side: 'right',
    });
    const added = r.state.components.at(-1)!;
    expect(added).toMatchObject({ componentType: 'pocket', displayName: 'Pocket', side: 'right' });
    expect(Object.values(added.properties).every((p) => p.status === 'missing')).toBe(true);
    expect((r.operation as { componentId: string }).componentId).toBe(added.componentId);
    expect(
      blocked(s, {
        type: 'add_component',
        componentType: 'collar',
        parentComponentId: find(s, 'garment_body').componentId,
      }),
    ).toEqual(['component.duplicate_single']);
    expect(
      blocked(s, { type: 'add_component', componentType: 'wing', parentComponentId: null }),
    ).toEqual(['component.type_unknown']);
  });

  it('removing a component with dependents is blocked unless cascading (CMP-019)', () => {
    const s = shirt();
    const sleeve = find(s, 'sleeve', 'left');
    expect(blocked(s, { type: 'remove_component', componentId: sleeve.componentId })).toEqual([
      'operation.has_dependents',
    ]);
    const r = ok(s, { type: 'remove_component', componentId: sleeve.componentId, cascade: true });
    expect(r.state.components.find((c) => c.componentId === sleeve.componentId)).toBeUndefined();
    expect(
      r.state.components.find((c) => c.componentType === 'cuff' && c.side === 'left'),
    ).toBeUndefined();
    const pocket = find(s, 'pocket');
    expect(
      ok(s, { type: 'remove_component', componentId: pocket.componentId }).state.components,
    ).toHaveLength(s.components.length - 1);
  });

  it('renames, hides and locks', () => {
    const s = shirt();
    const id = find(s, 'collar').componentId;
    const r = ok(s, {
      type: 'batch',
      operations: [
        { type: 'rename_component', componentId: id, displayName: 'Band collar' },
        { type: 'set_component_visibility', componentId: id, visible: false },
        { type: 'set_component_lock', componentId: id, locked: true },
      ],
    });
    expect(find(r.state, 'collar')).toMatchObject({
      displayName: 'Band collar',
      visible: false,
      locked: true,
    });
  });
});

describe('artifacts (ART-004, SPEC-003 AC-04/05)', () => {
  it('attaching lace to a sleeve pins the exact revision and creates a placed relationship', () => {
    const s = shirt();
    const sleeve = find(s, 'sleeve', 'left');
    const r = ok(s, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: 'rev-lace-2',
      placement: { region: 'hem' },
    });
    const binding = find(r.state, 'sleeve', 'left').artifactBindings[0]!;
    expect(binding).toMatchObject({
      artifactId: 'art-lace',
      artifactRevisionId: 'rev-lace-2',
      role: 'lace',
    });
    const rel = r.state.relationships[0]!;
    expect(rel).toMatchObject({
      type: 'decorative_trim_applied_to',
      source: { entityType: 'artifact_revision', entityId: 'rev-lace-2' },
      target: { entityType: 'design_component', entityId: sleeve.componentId },
      placement: { region: 'hem', orientation: 'follow_boundary', approximate: true },
      status: 'needs_review',
      provenanceRefs: ['op-1'],
    });
    // No boundary geometry yet → approximate and flagged for review, never silently valid (AC-05).
    expect(r.findings.map((f) => [f.ruleId, f.outcome])).toContainEqual([
      'placement.approximate',
      'requires_manual_review',
    ]);
  });

  it('with boundary geometry the placement is confirmed', () => {
    const s = shirt();
    find(s, 'sleeve', 'left').geometryRefs = [
      { refId: 'g1', geometryRevisionId: 'geo-1', coordinateSpace: 'design_2d' },
    ];
    const r = ok(s, {
      type: 'attach_artifact',
      componentId: find(s, 'sleeve', 'left').componentId,
      artifactRevisionId: 'rev-lace-2',
    });
    expect(r.state.relationships[0]).toMatchObject({
      status: 'confirmed',
      placement: { region: 'hem', approximate: false, geometryRevisionId: 'geo-1' },
    });
  });

  it('refuses incompatible targets, regions, unknown and deactivated artifacts', () => {
    const s = shirt();
    expect(
      blocked(s, {
        type: 'attach_artifact',
        componentId: find(s, 'collar').componentId,
        artifactRevisionId: 'rev-lace-2',
      }),
    ).toEqual(['artifact.target_incompatible']);
    expect(
      blocked(s, {
        type: 'attach_artifact',
        componentId: find(s, 'sleeve', 'left').componentId,
        artifactRevisionId: 'rev-lace-2',
        placement: { region: 'cap' },
      }),
    ).toEqual(['artifact.region_not_allowed']);
    expect(
      blocked(s, {
        type: 'attach_artifact',
        componentId: find(s, 'sleeve', 'left').componentId,
        artifactRevisionId: 'nope',
      }),
    ).toEqual(['operation.artifact_unknown']);
    expect(
      blocked(s, {
        type: 'attach_artifact',
        componentId: find(s, 'sleeve', 'left').componentId,
        artifactRevisionId: 'rev-old',
      }),
    ).toEqual(['artifact.inactive']);
  });

  it('component artifacts bind without a relationship; replace and detach keep things consistent', () => {
    const s = shirt();
    const collar = find(s, 'collar');
    const r = ok(s, {
      type: 'attach_artifact',
      componentId: collar.componentId,
      artifactRevisionId: 'rev-collar-1',
    });
    expect(r.state.relationships).toHaveLength(0);
    const sleeve = find(s, 'sleeve', 'left');
    const a = ok(s, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: 'rev-lace-2',
    });
    const bindingId = find(a.state, 'sleeve', 'left').artifactBindings[0]!.bindingId;
    const replaced = ok(a.state, {
      type: 'replace_artifact',
      componentId: sleeve.componentId,
      bindingId,
      artifactRevisionId: 'rev-lace-3',
    });
    expect(find(replaced.state, 'sleeve', 'left').artifactBindings[0]!.artifactRevisionId).toBe(
      'rev-lace-3',
    );
    expect(replaced.state.relationships[0]!.source.entityId).toBe('rev-lace-3');
    const detached = ok(replaced.state, {
      type: 'detach_artifact',
      componentId: sleeve.componentId,
      bindingId,
    });
    expect(find(detached.state, 'sleeve', 'left').artifactBindings).toEqual([]);
    expect(detached.state.relationships).toEqual([]);
  });

  it('update_placement moves within allowed regions only', () => {
    const s = shirt();
    const sleeve = find(s, 'sleeve', 'left');
    const a = ok(s, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: 'rev-lace-2',
    });
    const relId = a.state.relationships[0]!.relationshipId;
    const moved = ok(a.state, {
      type: 'update_placement',
      relationshipId: relId,
      placement: { region: 'opening', offsetMm: 5 },
    });
    expect(moved.state.relationships[0]!.placement).toMatchObject({
      region: 'opening',
      offset: { value: 5, unit: 'mm' },
    });
    expect(
      blocked(a.state, {
        type: 'update_placement',
        relationshipId: relId,
        placement: { region: 'cap' },
      }),
    ).toEqual(['artifact.region_not_allowed']);
  });

  it('relationships can be added and removed without touching their endpoints (REL-006)', () => {
    const s = shirt();
    const r = ok(s, {
      type: 'add_relationship',
      relationshipType: 'attached_to',
      source: { entityType: 'design_component', entityId: find(s, 'collar').componentId },
      target: { entityType: 'design_component', entityId: find(s, 'garment_body').componentId },
    });
    const id = r.state.relationships[0]!.relationshipId;
    const removed = ok(r.state, { type: 'remove_relationship', relationshipId: id });
    expect(removed.state.relationships).toEqual([]);
    expect(removed.state.components).toHaveLength(s.components.length);
    expect(
      blocked(s, {
        type: 'add_relationship',
        relationshipType: 'attached_to',
        source: { entityType: 'design_component', entityId: 'cmp_nothere00001' },
        target: { entityType: 'design_component', entityId: find(s, 'collar').componentId },
      }),
    ).toEqual(['relationship.endpoint_missing']);
  });
});

describe('batches, inverses and patches', () => {
  it('a batch is all or nothing', () => {
    const s = shirt();
    const id = find(s, 'collar').componentId;
    const r = applyOperation(
      s,
      op({
        type: 'batch',
        operations: [
          { type: 'rename_component', componentId: id, displayName: 'New' },
          { type: 'set_property', componentId: id, key: 'construction.collar_type', value: 'wing' },
        ],
      }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(find(s, 'collar').displayName).toBe('Collar');
  });

  it('AI-only operations are refused by the applier', () => {
    const s = shirt();
    expect(
      blocked(s, {
        type: 'regenerate_region',
        componentId: find(s, 'collar').componentId,
        instruction: 'more pointy',
      }),
    ).toEqual(['operation.ai_required']);
  });

  it('invert(prev, next) undoes any operation exactly (property-based)', () => {
    const s = shirt();
    const ids = s.components.map((c) => c.componentId);
    const sleeve = find(s, 'sleeve', 'left').componentId;
    const ops = fc.constantFrom<unknown>(
      { type: 'rename_component', componentId: ids[2], displayName: 'Renamed' },
      {
        type: 'set_property',
        componentId: sleeve,
        key: 'dimension.sleeve_length',
        value: 600,
        unit: 'mm',
      },
      { type: 'remove_component', componentId: sleeve, cascade: true },
      { type: 'attach_artifact', componentId: sleeve, artifactRevisionId: 'rev-lace-2' },
      { type: 'set_component_visibility', componentId: ids[0], visible: false },
      {
        type: 'add_component',
        componentType: 'pocket',
        parentComponentId: find(s, 'front_body_panel').componentId,
      },
      {
        type: 'set_property_status',
        componentId: find(s, 'collar').componentId,
        key: 'construction.collar_type',
        action: 'confirm',
      },
    );
    fc.assert(
      fc.property(fc.array(ops, { minLength: 1, maxLength: 3 }), (sequence) => {
        let state = s;
        const history: GarmentDesignState[] = [];
        for (const o of sequence) {
          const r = applyOperation(state, op(o), ctx());
          if (!r.ok) continue;
          history.push(state);
          state = r.state;
          // The response patch reproduces the result from the previous state.
          expect(sortState(applyEntityPatch(history.at(-1)!, r.after))).toEqual(sortState(state));
        }
        // Undo everything in reverse order.
        for (let i = history.length - 1; i >= 0; i--) {
          const prev = history[i]!;
          const undo = applyOperation(state, invert(prev, state), ctx());
          if (!undo.ok) throw new Error(JSON.stringify(undo.findings));
          state = undo.state;
          expect(sortState(state)).toEqual(sortState(prev));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('replace_state swaps everything and inverts to the previous state', () => {
    const s = shirt();
    const t = templates.create('knit_tshirt', { randomBytes: sequentialRandomBytes() });
    const r = applyOperation(
      s,
      { type: 'replace_state', state: t as unknown as Record<string, unknown> },
      ctx(),
    );
    if (!r.ok) throw new Error('failed');
    expect(r.state.garmentCategory).toBe('knit_tshirt');
    const back = invert(s, r.state);
    expect(back.type).toBe('replace_state');
    const undone = applyOperation(r.state, back, ctx());
    expect(undone.ok && undone.state).toEqual(s);
  });
});

describe('strategy selection (STR-001…005)', () => {
  const policy = { allowDeterministic: true, allowAi: false, requireUserReview: false };
  it('picks deterministic strategies for every deterministic type, with a rationale', () => {
    for (const t of OPERATION_TYPES.filter((d) => d.invertible)) {
      const choice = selectStrategy(t.type, policy);
      expect(choice.strategy, t.type).not.toBeNull();
      expect(choice.rationale).toMatch(/no AI needed/);
    }
    expect(selectStrategy('attach_artifact', policy).strategy).toBe('rule_based_composition');
  });

  it('refuses AI-only operations clearly (STR-004)', () => {
    expect(selectStrategy('regenerate_region', policy)).toMatchObject({
      strategy: null,
      reason: 'policy_forbids',
    });
    expect(selectStrategy('regenerate_region', { ...policy, allowAi: true })).toMatchObject({
      strategy: null,
      reason: 'no_engine_available',
    });
    expect(
      selectStrategy(
        'regenerate_region',
        { ...policy, allowAi: true },
        new Set(['targeted_image_edit']),
      ),
    ).toMatchObject({ strategy: 'targeted_image_edit' });
    expect(
      selectStrategy('rename_component', { ...policy, allowDeterministic: false }),
    ).toMatchObject({ strategy: null });
  });
});

function sortState(s: GarmentDesignState) {
  return {
    ...s,
    components: [...s.components].sort((a, b) => (a.componentId < b.componentId ? -1 : 1)),
    relationships: [...s.relationships].sort((a, b) =>
      a.relationshipId < b.relationshipId ? -1 : 1,
    ),
  };
}

describe('component and fabric artifacts (I18)', () => {
  it('copies stated visual values as proposals sourced from the pinned revision; sleeves stay independent', () => {
    const s = shirt();
    const left = find(s, 'sleeve', 'left');
    const right = find(s, 'sleeve', 'right');
    let r = ok(s, {
      type: 'attach_artifact',
      componentId: left.componentId,
      artifactRevisionId: 'rev-raglan-1',
    });
    let l = find(r.state, 'sleeve', 'left');
    expect(l.properties['construction.sleeve_type']).toMatchObject({
      value: 'raglan',
      status: 'proposed',
      sourceType: 'artifact_revision',
      sourceRefs: [
        { entityId: 'art-raglan', revisionId: 'rev-raglan-1', note: 'Long raglan sleeve' },
      ],
    });
    r = ok(r.state, {
      type: 'attach_artifact',
      componentId: right.componentId,
      artifactRevisionId: 'rev-raglan-1',
    });
    // Independent properties: editing one sleeve does not touch the other (SPEC-003 AC-03).
    r = ok(r.state, {
      type: 'set_property',
      componentId: right.componentId,
      key: 'dimension.sleeve_length',
      value: 300,
      unit: 'mm',
    });
    expect(find(r.state, 'sleeve', 'left').properties['dimension.sleeve_length']?.value).toBeNull();
    // Replacing with a newer revision re-applies its values; the old pin is gone.
    l = find(r.state, 'sleeve', 'left');
    const binding = l.artifactBindings[0]!;
    r = ok(r.state, {
      type: 'replace_artifact',
      componentId: left.componentId,
      bindingId: binding.bindingId,
      artifactRevisionId: 'rev-raglan-2',
    });
    l = find(r.state, 'sleeve', 'left');
    expect(l.properties['construction.sleeve_type']?.value).toBe('dolman');
    expect(l.artifactBindings[0]?.artifactRevisionId).toBe('rev-raglan-2');
    expect(find(r.state, 'sleeve', 'right').artifactBindings[0]?.artifactRevisionId).toBe(
      'rev-raglan-1',
    );
  });

  it('never overrides a confirmed value, and says so', () => {
    const s = shirt();
    const left = find(s, 'sleeve', 'left');
    let r = ok(s, {
      type: 'set_property',
      componentId: left.componentId,
      key: 'construction.sleeve_type',
      value: 'set_in',
    });
    r = ok(r.state, {
      type: 'attach_artifact',
      componentId: left.componentId,
      artifactRevisionId: 'rev-raglan-1',
    });
    expect(find(r.state, 'sleeve', 'left').properties['construction.sleeve_type']).toMatchObject({
      value: 'set_in',
      status: 'confirmed',
    });
    expect(r.findings.map((f) => f.ruleId)).toContain('artifact.kept_confirmed_values');
  });

  it('a fabric becomes the fabric reference (confirmed by the person) and leaves with the binding', () => {
    const s = shirt();
    const body = find(s, 'garment_body');
    let r = ok(s, {
      type: 'attach_artifact',
      componentId: body.componentId,
      artifactRevisionId: 'rev-navy-1',
    });
    let b = find(r.state, 'garment_body');
    expect(b.properties['material.fabric_ref']).toMatchObject({
      value: { entityType: 'artifact_revision', entityId: 'rev-navy-1' },
      status: 'confirmed',
      confirmedBy: 'user-1',
    });
    expect(b.properties['appearance.color']).toMatchObject({
      value: '#1e3a8a',
      status: 'proposed',
    });
    expect(r.state.relationships).toHaveLength(0);
    r = ok(r.state, {
      type: 'detach_artifact',
      componentId: body.componentId,
      bindingId: b.artifactBindings[0]!.bindingId,
    });
    b = find(r.state, 'garment_body');
    expect(b.properties['material.fabric_ref']?.status).toBe('missing');
    expect(b.properties['appearance.color']?.value).toBe('#1e3a8a');
  });

  it('placement rotation and scale are stored and updated reproducibly (GEO-005)', () => {
    const s = shirt();
    const sleeve = find(s, 'sleeve', 'left');
    let r = ok(s, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: 'rev-lace-2',
      placement: { region: 'hem', rotationDeg: 15, scale: 1.5 },
    });
    const rel = r.state.relationships[0]!;
    expect(rel.placement).toMatchObject({ region: 'hem', rotationDeg: 15, scale: 1.5 });
    r = ok(r.state, {
      type: 'update_placement',
      relationshipId: rel.relationshipId,
      placement: { scale: 0.5, offsetMm: 4 },
    });
    expect(r.state.relationships[0]!.placement).toMatchObject({
      rotationDeg: 15,
      scale: 0.5,
      offset: { value: 4, unit: 'mm' },
    });
    const again = ok(s, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: 'rev-lace-2',
      placement: { region: 'hem', rotationDeg: 15, scale: 1.5 },
      bindingId: r.state.components.find((c) => c.componentId === sleeve.componentId)!
        .artifactBindings[0]!.bindingId,
      relationshipId: rel.relationshipId,
    });
    expect(again.state.relationships[0]!.placement).toEqual(rel.placement);
    expect(() =>
      op({
        type: 'update_placement',
        relationshipId: rel.relationshipId,
        placement: { scale: 50 },
      }),
    ).toThrow();
  });
});
