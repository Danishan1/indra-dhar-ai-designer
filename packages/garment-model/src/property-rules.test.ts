import { describe, expect, it } from 'vitest';

import { sequentialRandomBytes } from './ids.js';
import { evaluatePropertyRules, lengthMm } from './registry/property-rules.js';
import { proposedFromTemplate } from './schema/property-value.js';
import { templates } from './templates/index.js';

const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const find = (s: ReturnType<typeof shirt>, type: string) =>
  s.components.find((c) => c.componentType === type)!;

describe('property dependency rules', () => {
  it('disables cuff properties on short sleeves and reports set values as conflicts', () => {
    const s = shirt();
    const cuff = find(s, 'cuff');
    const sleeve = s.components.find((c) => c.componentId === cuff.parentComponentId)!;
    expect(evaluatePropertyRules(s, cuff).disabled.size).toBe(0);
    sleeve.properties['dimension.sleeve_length'] = proposedFromTemplate(25, 'cm');
    const r = evaluatePropertyRules(s, cuff);
    expect(r.disabled.get('construction.cuff_type')?.ruleId).toBe('cuff.short_sleeve');
    expect(r.disabled.has('dimension.cuff_width')).toBe(true);
    expect(r.conflicts.map((c) => c.key)).toEqual(['construction.cuff_type']);
  });

  it('sleeveless disables the whole cuff and the sleeve length', () => {
    const s = shirt();
    const sleeve = find(s, 'sleeve');
    sleeve.properties['construction.sleeve_type'] = proposedFromTemplate('sleeveless');
    expect(evaluatePropertyRules(s, sleeve).disabled.has('dimension.sleeve_length')).toBe(true);
    const cuff = s.components.find((c) => c.parentComponentId === sleeve.componentId)!;
    const r = evaluatePropertyRules(s, cuff);
    expect([...r.disabled.keys()].sort()).toEqual(Object.keys(cuff.properties).sort());
    expect(r.disabled.get('construction.cuff_type')?.ruleId).toBe('cuff.sleeveless');
  });

  it('closure and placket/pocket/collar "none" disable dependent values', () => {
    const s = shirt();
    const placket = find(s, 'placket');
    placket.properties['construction.closure_type'] = proposedFromTemplate('zip');
    expect(evaluatePropertyRules(s, placket).disabled.has('construction.button_count')).toBe(true);
    placket.properties['construction.placket_type'] = proposedFromTemplate('none');
    expect(evaluatePropertyRules(s, placket).disabled.has('dimension.placket_width')).toBe(true);
    const pocket = find(s, 'pocket');
    pocket.properties['construction.pocket_type'] = proposedFromTemplate('none');
    expect(evaluatePropertyRules(s, pocket).conflicts.map((c) => c.key)).toEqual([
      'placement.pocket_position',
    ]);
    const collar = find(s, 'collar');
    collar.properties['construction.collar_type'] = proposedFromTemplate('none');
    expect(evaluatePropertyRules(s, collar).disabled.has('dimension.collar_height')).toBe(true);
  });

  it('reads lengths in any unit', () => {
    expect(lengthMm(proposedFromTemplate(2, 'in'))).toBeCloseTo(50.8);
    expect(lengthMm(undefined)).toBeNull();
  });
});
