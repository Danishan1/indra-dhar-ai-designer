import { describe, expect, it } from 'vitest';

import { changedComponentIds, classifyDiff } from './diff/classify-diff.js';
import { diffDesignStates } from './diff/diff-design-states.js';
import { userValue } from './schema/property-value.js';
import { byType, shirt, WHEN } from './test-helpers.js';

const classify = (a: ReturnType<typeof shirt>, b: ReturnType<typeof shirt>) =>
  classifyDiff(diffDesignStates(a, b), a, b);

describe('classifyDiff (I19, FR-PRJ-031, FR-EDT-094)', () => {
  it('returns nothing for identical states', () => {
    expect(classify(shirt(), shirt())).toEqual([]);
  });

  it('separates properties, visual-only changes, structure and editor hints', () => {
    const a = shirt();
    const b = structuredClone(a);
    const sleeve = byType(b, 'sleeve', 'left');
    sleeve.properties['dimension.sleeve_length'] = userValue(
      640,
      { confirmedBy: 'u1', confirmedAt: WHEN },
      'mm',
    );
    sleeve.properties['appearance.color'] = userValue('#1e3a8a', {
      confirmedBy: 'u1',
      confirmedAt: WHEN,
    });
    sleeve.visible = false;
    byType(b, 'collar').displayName = 'Band collar';
    b.metadata = { ...b.metadata, season: 'SS27' };

    const entries = classify(a, b);
    const cats = entries.map((e) => e.category);
    // Grouped in category order.
    expect(cats).toEqual([...cats].sort((x, y) => order(x) - order(y)));

    const length = entries.find((e) => e.field === 'dimension.sleeve_length')!;
    expect(length).toMatchObject({
      category: 'property',
      kind: 'changed',
      after: 640,
      statusAfter: 'confirmed',
      visualOnly: false,
      semantic: true,
      label: `${sleeve.displayName} · Sleeve length`,
    });
    expect(entries.find((e) => e.field === 'appearance.color')).toMatchObject({
      visualOnly: true,
      semantic: true,
    });
    expect(entries.find((e) => e.field === 'displayName')).toMatchObject({
      category: 'structural',
      before: 'Collar',
      after: 'Band collar',
    });
    // Editor flags and metadata are reported but never as design changes.
    expect(entries.find((e) => e.category === 'editor_hint')).toMatchObject({
      field: 'visible',
      semantic: false,
    });
    expect(entries.find((e) => e.category === 'metadata')).toMatchObject({
      entityId: 'season',
      kind: 'added',
      semantic: false,
    });
    expect(changedComponentIds(entries)).toEqual(
      [sleeve.componentId, byType(b, 'collar').componentId].sort(),
    );
  });

  it('a state with only editor-hint changes has no semantic entries', () => {
    const a = shirt();
    const b = structuredClone(a);
    byType(b, 'pocket').locked = true;
    const entries = classify(a, b);
    expect(entries).toHaveLength(1);
    expect(entries.every((e) => !e.semantic)).toBe(true);
    expect(changedComponentIds(entries)).toEqual([]);
  });

  it('reports added/removed components and re-pinned artifacts', () => {
    const a = shirt();
    a.components
      .find((c) => c.componentType === 'sleeve')!
      .artifactBindings.push({
        bindingId: 'bnd_aaaaaaaaaaaa',
        artifactId: 'art-1',
        artifactRevisionId: 'rev-1',
        role: null,
      });
    const b = structuredClone(a);
    b.components.find(
      (c) => c.componentType === 'sleeve',
    )!.artifactBindings[0]!.artifactRevisionId = 'rev-2';
    const pocket = b.components.findIndex((c) => c.componentType === 'pocket');
    const [removed] = b.components.splice(pocket, 1);
    const entries = classify(a, b);
    expect(entries.find((e) => e.category === 'artifact')).toMatchObject({
      kind: 'changed',
      before: 'rev-1',
      after: 'rev-2',
    });
    expect(entries.find((e) => e.kind === 'removed')).toMatchObject({
      category: 'structural',
      componentId: removed!.componentId,
    });
  });
});

function order(c: string) {
  return ['structural', 'property', 'artifact', 'relationship', 'metadata', 'editor_hint'].indexOf(
    c,
  );
}
