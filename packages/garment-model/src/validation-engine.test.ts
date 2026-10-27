import { describe, expect, it } from 'vitest';

import type { GarmentDesignState } from './schema/design-state.js';
import { proposedFromTemplate, userValue } from './schema/property-value.js';
import { byType, shirt, tshirt, WHEN } from './test-helpers.js';
import { DESIGN_STRUCTURE_V1 } from './validation/constraint-sets/design-structure.js';
import { defaultSeverity, findingIdOf, runDesignValidation } from './validation/engine.js';

const run = (s: GarmentDesignState) => runDesignValidation(s, DESIGN_STRUCTURE_V1);
const ruleIds = (s: GarmentDesignState) => run(s).findings.map((f) => f.ruleId);
const by = { confirmedBy: 'u1', confirmedAt: WHEN };
const setMm = (
  s: GarmentDesignState,
  type: string,
  side: string | undefined,
  key: string,
  mm: number,
) => {
  byType(s, type, side).properties[key] = userValue(mm, by, 'mm');
};

describe('design-structure@1.0.0 engine (I20)', () => {
  it('a fresh template has no errors or warnings, only informative notes', () => {
    for (const s of [shirt(), tshirt()]) {
      const r = run(s);
      expect(r.constraintSetRef).toBe('design-structure@1.0.0');
      expect(r.counts).toMatchObject({ errors: 0, warnings: 0, manualReview: 0 });
      expect(r.findings.every((f) => f.severity === 'info')).toBe(true);
      expect(r.evaluatedRules).toContain('dependency.cuff_requires_sleeve@1.0.0');
    }
  });

  it('is repeatable: same state + same set version ⇒ identical findings and order (CST-004)', () => {
    const s = shirt();
    setMm(s, 'sleeve', 'left', 'dimension.sleeve_length', 2000);
    expect(run(structuredClone(s))).toEqual(run(s));
    const ids = run(s).findings.map((f) => f.findingId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^vf_[0-9a-f]{16}$/.test(id))).toBe(true);
  });

  it('every finding names rule, entity, explanation and resolution (CST-002)', () => {
    const s = shirt();
    byType(s, 'sleeve', 'left').properties['construction.sleeve_type'] = userValue(
      'sleeveless',
      by,
    );
    const f = run(s).findings.find((x) => x.ruleId === 'dependency.cuff_requires_sleeve')!;
    expect(f).toMatchObject({
      outcome: 'error',
      severity: 'blocking',
      category: 'dependency',
      ruleVersion: '1.0.0',
      entity: { entityType: 'design_component', entityId: byType(s, 'cuff', 'left').componentId },
    });
    expect(f.message).toContain('sleeveless');
    expect(f.resolution).toContain('Remove');
  });

  it('dependency: required components and sided pairs', () => {
    const s = shirt();
    s.components = s.components.filter((c) => c.componentType !== 'back_body_panel');
    const right = byType(s, 'sleeve', 'right');
    s.components = s.components.filter(
      (c) => c.componentId !== right.componentId && c.parentComponentId !== right.componentId,
    );
    const r = run(s);
    expect(r.findings.find((f) => f.ruleId === 'dependency.required_component')).toMatchObject({
      severity: 'blocking',
      message: expect.stringContaining('back body panel'),
    });
    expect(
      r.findings.filter((f) => f.ruleId === 'dependency.sided_pair').map((f) => f.entity?.entityId),
    ).toEqual(
      expect.arrayContaining([
        byType(s, 'sleeve', 'left').componentId,
        byType(s, 'cuff', 'left').componentId,
      ]),
    );
    expect(ruleIds(shirt())).not.toContain('dependency.sided_pair');
  });

  it('geometric bounds: unusual is a warning, impossible is blocking, inapplicable is skipped', () => {
    const s = shirt();
    setMm(s, 'sleeve', 'left', 'dimension.sleeve_length', 760);
    setMm(s, 'sleeve', 'right', 'dimension.sleeve_length', 1200);
    const f = run(s).findings.filter((x) => x.ruleId === 'bounds.dimension_range');
    expect(f.map((x) => x.severity).sort()).toEqual(['blocking', 'warning']);
    expect(f.find((x) => x.severity === 'blocking')!.message).toContain('1200 mm');
    // Sleeveless: the length no longer applies, so it is a conflict, not a range problem.
    byType(s, 'sleeve', 'right').properties['construction.sleeve_type'] = userValue(
      'sleeveless',
      by,
    );
    const after = run(s).findings;
    expect(after.filter((x) => x.ruleId === 'bounds.dimension_range')).toHaveLength(1);
    expect(after.some((x) => x.ruleId === 'exclusive.conflicting_value')).toBe(true);
  });

  it('mutually exclusive: collar and hood; required defining options', () => {
    const s = shirt();
    const body = byType(s, 'garment_body');
    s.components.push({
      ...structuredClone(byType(s, 'collar')),
      componentId: 'cmp_hood00000001',
      componentType: 'hood',
      displayName: 'Hood',
      parentComponentId: body.componentId,
      properties: {},
    });
    expect(ruleIds(s)).toContain('exclusive.collar_and_hood');
    delete byType(s, 'collar').properties['construction.collar_type'];
    const r = run(s);
    expect(r.findings.find((f) => f.ruleId === 'required.defining_property')).toMatchObject({
      severity: 'warning',
      message: 'Collar: Collar type is not chosen',
    });
  });

  it('material compatibility and approximate placements stay visible (§15.3)', () => {
    const s = tshirt();
    const sleeve = byType(s, 'sleeve', 'left');
    sleeve.artifactBindings.push({
      bindingId: 'bnd_aaaaaaaaaaaa',
      artifactId: 'art-1',
      artifactRevisionId: 'rev-1',
      role: 'lace',
    });
    s.relationships.push({
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'decorative_trim_applied_to',
      source: { entityType: 'artifact_revision', entityId: 'rev-1' },
      target: { entityType: 'design_component', entityId: sleeve.componentId },
      placement: {
        region: 'hem',
        anchor: null,
        coordinateSpace: 'component_local',
        translation: null,
        rotationDeg: null,
        scale: null,
        orientation: 'follow_boundary',
        offset: null,
        geometryRevisionId: null,
        calibrationRef: null,
        approximate: true,
        confidence: null,
      },
      constraints: [],
      status: 'confirmed',
      provenanceRefs: [],
    });
    const r = run(s);
    expect(r.findings.find((f) => f.ruleId === 'material.trim_on_knit')?.severity).toBe('warning');
    const review = r.findings.find((f) => f.ruleId === 'rendering.approximate_placement')!;
    expect(review).toMatchObject({ outcome: 'requires_manual_review', severity: 'warning' });
    expect(r.counts.manualReview).toBe(1);
    // A woven shirt takes lace without a material warning.
    expect(ruleIds(shirt())).not.toContain('material.trim_on_knit');
  });

  it('unconfirmed production-critical values are informative only', () => {
    const s = shirt();
    byType(s, 'sleeve', 'left').properties['dimension.sleeve_length'] = proposedFromTemplate(
      620,
      'mm',
    );
    const f = run(s).findings.find(
      (x) =>
        x.ruleId === 'values.unconfirmed_critical' &&
        x.entity?.entityId === byType(s, 'sleeve', 'left').componentId,
    )!;
    expect(f.severity).toBe('info');
    expect(f.message).toContain('Sleeve length (proposed)');
  });

  it('a broken shape yields only schema findings; severities follow outcomes', () => {
    const r = runDesignValidation({ nope: true }, DESIGN_STRUCTURE_V1);
    expect(r.shapeInvalid).toBe(true);
    expect(r.counts.errors).toBeGreaterThan(0);
    expect(r.findings.every((f) => f.category === 'structural')).toBe(true);
    expect(defaultSeverity('requires_manual_review')).toBe('warning');
    expect(defaultSeverity('not_evaluated')).toBe('info');
    expect(findingIdOf({ ruleId: 'a', entity: null, path: null })).toBe(
      findingIdOf({ ruleId: 'a', entity: null, path: null }),
    );
  });
});
