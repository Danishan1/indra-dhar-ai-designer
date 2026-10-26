import { describe, expect, it } from 'vitest';

import { cloneWithNewIds } from './clone.js';
import {
  createBindingId,
  createComponentId,
  createConstraintId,
  createRelationshipId,
  createId,
  ID_PATTERN,
  sequentialRandomBytes,
} from './ids.js';
import { templates } from './templates/index.js';

describe('ids', () => {
  it('creates prefixed, well-formed, unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createComponentId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^cmp_[a-z0-9]{12}$/);
    expect(createRelationshipId()).toMatch(/^rel_/);
    expect(createConstraintId()).toMatch(/^cst_/);
    expect(createBindingId()).toMatch(/^bnd_/);
    expect(createId('component')).toMatch(ID_PATTERN);
  });

  it('is reproducible with a seeded generator', () => {
    const a = sequentialRandomBytes();
    const b = sequentialRandomBytes();
    expect(createComponentId(a)).toBe(createComponentId(b));
    expect(createComponentId(a)).not.toBe(createComponentId(a));
  });

  it('rejects biased bytes (≥ 252) and still produces an id', () => {
    let calls = 0;
    const rng = (n: number) => {
      calls += 1;
      return new Uint8Array(n).fill(calls === 1 ? 255 : 3);
    };
    expect(createComponentId(rng)).toBe('cmp_dddddddddddd');
  });
});

describe('cloneWithNewIds', () => {
  it('replaces every id and rewrites references; artifact pins stay', () => {
    const state = templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
    const sleeve = state.components.find((c) => c.componentType === 'sleeve')!;
    sleeve.artifactBindings.push({
      bindingId: 'bnd_aaaaaaaaaaaa',
      artifactId: 'art-1',
      artifactRevisionId: 'rev-9',
      role: null,
    });
    state.constraints.push({
      constraintId: 'cst_aaaaaaaaaaaa',
      constraintType: 'type_compatibility',
      scope: {},
      rule: {},
      severity: 'error',
      version: 1,
    });
    state.relationships.push({
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'attached_to',
      source: { entityType: 'design_component', entityId: sleeve.componentId },
      target: { entityType: 'design_component', entityId: state.components[0]!.componentId },
      placement: null,
      constraints: ['cst_aaaaaaaaaaaa'],
      status: 'confirmed',
      provenanceRefs: [],
    });

    const { state: copy, idMap } = cloneWithNewIds(state, { sourceRevisionId: 'rev-1' });
    const oldIds = state.components.map((c) => c.componentId);
    for (const c of copy.components) expect(oldIds).not.toContain(c.componentId);
    expect(new Set(copy.components.map((c) => c.componentId)).size).toBe(state.components.length);
    const copiedSleeve = copy.components.find(
      (c) => c.componentId === idMap.get(sleeve.componentId),
    )!;
    expect(copiedSleeve.artifactBindings[0]?.artifactRevisionId).toBe('rev-9');
    expect(copiedSleeve.artifactBindings[0]?.bindingId).not.toBe('bnd_aaaaaaaaaaaa');
    const parentIds = new Set(copy.components.map((c) => c.componentId));
    for (const c of copy.components)
      if (c.parentComponentId) expect(parentIds.has(c.parentComponentId)).toBe(true);
    const r = copy.relationships[0]!;
    expect(r.source.entityId).toBe(idMap.get(sleeve.componentId));
    expect(r.constraints[0]).toBe(copy.constraints[0]!.constraintId);
    expect(copy.provenance).toMatchObject({ createdFrom: 'duplicate', sourceRevisionId: 'rev-1' });
    // The original is untouched.
    expect(state.components.map((c) => c.componentId)).toEqual(oldIds);
  });
});
