import { describe, expect, it } from 'vitest';

import { diffDesignStates } from './diff/diff-design-states.js';
import { createBindingId } from './ids.js';
import { userValue } from './schema/property-value.js';
import { byType, shirt, WHEN } from './test-helpers.js';

const binding = (rev: string, artifactId = 'art-1', id = 'bnd_aaaaaaaaaaaa') => ({
  bindingId: id,
  artifactId,
  artifactRevisionId: rev,
  role: null,
});

describe('diffDesignStates (AC5, DSN-011)', () => {
  it('reports no changes for identical states', () => {
    const d = diffDesignStates(shirt(), shirt());
    expect(d).toMatchObject({ hasChanges: false, hasSemanticChanges: false, metadataOnly: false });
  });

  it('detects added and removed components', () => {
    const a = shirt();
    const b = structuredClone(a);
    const removed = b.components.pop()!;
    b.components.push({
      ...structuredClone(byType(a, 'pocket')),
      componentId: 'cmp_zzzzzzzzzzzz',
      displayName: 'Second pocket',
    });
    const d = diffDesignStates(a, b);
    expect(d.components.removed.map((c) => c.componentId)).toEqual([removed.componentId]);
    expect(d.components.added.map((c) => c.componentId)).toEqual(['cmp_zzzzzzzzzzzz']);
    expect(d.hasSemanticChanges).toBe(true);
  });

  it('detects property changes with before/after, additions and removals', () => {
    const a = shirt();
    const b = structuredClone(a);
    const sleeve = byType(b, 'sleeve', 'left');
    sleeve.properties['dimension.sleeve_length'] = userValue(
      580,
      { confirmedBy: 'u1', confirmedAt: WHEN },
      'mm',
    );
    delete sleeve.properties['appearance.color'];
    sleeve.properties['ext.custom'] = { ...sleeve.properties['material.fabric_ref']! };
    const d = diffDesignStates(a, b);
    const ch = d.components.changed.find((c) => c.componentId === sleeve.componentId)!;
    expect(ch.properties.map((p) => [p.key, p.kind])).toEqual([
      ['appearance.color', 'removed'],
      ['dimension.sleeve_length', 'changed'],
      ['ext.custom', 'added'],
    ]);
    expect(ch.properties[1]).toMatchObject({
      before: { status: 'missing' },
      after: { value: 580, unit: 'mm', status: 'confirmed' },
    });
    expect(ch.semantic).toBe(true);
  });

  it('detects artifact revision changes: added, repinned, removed (ART-004)', () => {
    const a = shirt();
    byType(a, 'sleeve', 'left').artifactBindings = [binding('rev-1')];
    byType(a, 'sleeve', 'right').artifactBindings = [binding('rev-7', 'art-2', 'bnd_bbbbbbbbbbbb')];
    const b = structuredClone(a);
    byType(b, 'sleeve', 'left').artifactBindings = [binding('rev-2')];
    byType(b, 'sleeve', 'right').artifactBindings = [];
    byType(b, 'collar').artifactBindings = [binding('rev-3', 'art-3', createBindingId())];
    const d = diffDesignStates(a, b);
    expect(d.artifactRefs.repinned).toEqual([
      {
        componentId: byType(a, 'sleeve', 'left').componentId,
        artifactId: 'art-1',
        before: 'rev-1',
        after: 'rev-2',
      },
    ]);
    expect(d.artifactRefs.removed.map((r) => r.artifactRevisionId)).toEqual(['rev-7']);
    expect(d.artifactRefs.added.map((r) => r.artifactRevisionId)).toEqual(['rev-3']);
    expect(d.hasSemanticChanges).toBe(true);
  });

  it('treats a swapped artifact (different artifactId) as remove + add', () => {
    const a = shirt();
    byType(a, 'collar').artifactBindings = [binding('rev-1', 'art-1')];
    const b = structuredClone(a);
    byType(b, 'collar').artifactBindings = [binding('rev-1', 'art-9')];
    const d = diffDesignStates(a, b);
    expect(d.artifactRefs.repinned).toEqual([]);
    expect(d.artifactRefs.removed).toHaveLength(1);
    expect(d.artifactRefs.added).toHaveLength(1);
  });

  it('flags editor-flag and metadata changes as metadata-only (FR-EDT-024)', () => {
    const a = shirt();
    const b = structuredClone(a);
    byType(b, 'collar').visible = false;
    b.metadata = { season: 'SS27' };
    b.annotationsRef = 'ann-2';
    const d = diffDesignStates(a, b);
    expect(d.hasChanges).toBe(true);
    expect(d.hasSemanticChanges).toBe(false);
    expect(d.metadataOnly).toBe(true);
    expect(d.metadata.changedKeys).toEqual(['season']);
    expect(d.components.changed[0]).toMatchObject({
      semantic: false,
      flags: [{ field: 'visible', before: true, after: false }],
    });
  });

  it('metadataOnly is false once a semantic change is mixed in', () => {
    const a = shirt();
    const b = structuredClone(a);
    b.metadata = { season: 'SS27' };
    byType(b, 'collar').displayName = 'Collar!';
    expect(diffDesignStates(a, b)).toMatchObject({ metadataOnly: false, hasSemanticChanges: true });
  });

  it('detects relationship and constraint changes and design-level fields', () => {
    const a = shirt();
    const rel = {
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'attached_to' as const,
      source: {
        entityType: 'design_component' as const,
        entityId: byType(a, 'collar').componentId,
      },
      target: {
        entityType: 'design_component' as const,
        entityId: byType(a, 'garment_body').componentId,
      },
      placement: null,
      constraints: [],
      status: 'proposed' as const,
      provenanceRefs: [],
    };
    a.relationships = [rel];
    const b = structuredClone(a);
    b.relationships = [
      { ...rel, status: 'confirmed' },
      { ...rel, relationshipId: 'rel_bbbbbbbbbbbb' },
    ];
    b.constraints = [
      {
        constraintId: 'cst_aaaaaaaaaaaa',
        constraintType: 'type_compatibility',
        scope: {},
        rule: {},
        severity: 'error',
        version: 1,
      },
    ];
    b.garmentCategory = null;
    const d = diffDesignStates(a, b);
    expect(d.relationships.changed).toEqual([
      {
        relationshipId: 'rel_aaaaaaaaaaaa',
        fields: [{ field: 'status', before: 'proposed', after: 'confirmed' }],
      },
    ]);
    expect(d.relationships.added).toHaveLength(1);
    expect(d.constraints.added).toHaveLength(1);
    expect(d.state.fields).toEqual([
      { field: 'garmentCategory', before: 'woven_shirt', after: null },
    ]);
    const back = diffDesignStates(b, a);
    expect(back.relationships.removed).toHaveLength(1);
    expect(back.constraints.removed).toHaveLength(1);
  });

  it('ignores order-only differences in tags and refs', () => {
    const a = shirt();
    byType(a, 'collar').tags = ['a', 'b'];
    const b = structuredClone(a);
    byType(b, 'collar').tags = ['b', 'a'];
    expect(diffDesignStates(a, b).hasChanges).toBe(false);
  });

  it('two components bound to the same artifact revision keep independent properties (SPEC-003 AC-03)', () => {
    const a = shirt();
    byType(a, 'sleeve', 'left').artifactBindings = [binding('rev-1')];
    byType(a, 'sleeve', 'right').artifactBindings = [binding('rev-1', 'art-1', 'bnd_bbbbbbbbbbbb')];
    const b = structuredClone(a);
    byType(b, 'sleeve', 'left').properties['dimension.sleeve_length'] = userValue(
      600,
      { confirmedBy: 'u1', confirmedAt: WHEN },
      'mm',
    );
    const d = diffDesignStates(a, b);
    expect(d.components.changed.map((c) => c.componentId)).toEqual([
      byType(a, 'sleeve', 'left').componentId,
    ]);
    expect(byType(b, 'sleeve', 'right').properties['dimension.sleeve_length']!.status).toBe(
      'missing',
    );
  });
});
