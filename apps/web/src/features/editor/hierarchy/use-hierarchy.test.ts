import { sequentialRandomBytes, templates } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { addableChildren, buildTree, flattenTree } from './use-hierarchy';

const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });

describe('hierarchy tree', () => {
  it('nests by parent with garment-type ordering, left before right (AC1)', () => {
    const s = shirt();
    const tree = buildTree(s.components);
    expect(tree).toHaveLength(1);
    const names = flattenTree(tree, new Set()).map(
      (n) => `${'-'.repeat(n.depth)}${n.component.displayName}`,
    );
    expect(names).toEqual([
      '-Shirt body',
      '--Front panel',
      '---Front placket',
      '---Chest pocket',
      '--Back panel',
      '--Left sleeve',
      '---Left cuff',
      '--Right sleeve',
      '---Right cuff',
      '--Collar',
      '--Body hem',
    ]);
    // Collapsing hides children; orphans are kept as roots.
    const body = tree[0]!.component.componentId;
    expect(flattenTree(tree, new Set([body]))).toHaveLength(1);
    const orphan = {
      ...s.components[3]!,
      componentId: 'cmp_orphan000001',
      parentComponentId: 'cmp_missing00001',
    };
    expect(buildTree([...s.components, orphan]).map((n) => n.component.componentId)).toContain(
      'cmp_orphan000001',
    );
  });

  it('offers only component types the catalog allows, respecting repeatability', () => {
    const s = shirt();
    const body = s.components.find((c) => c.componentType === 'garment_body')!;
    const add = addableChildren(body, s.components);
    const sleeveLeft = add.find((a) => a.type === 'sleeve' && a.side === 'left')!;
    expect(sleeveLeft.disabledReason).toMatch(/already a left sleeve/);
    expect(add.find((a) => a.type === 'collar')?.disabledReason).toMatch(/Only one collar/);
    expect(add.find((a) => a.type === 'cuff')).toBeUndefined();
    const sleeve = s.components.find((c) => c.componentType === 'sleeve')!;
    expect(addableChildren(sleeve, s.components).map((a) => a.type)).toContain('pocket');
  });
});
