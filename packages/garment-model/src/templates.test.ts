import { describe, expect, it } from 'vitest';

import { contentHash } from './canonical/hash.js';
import { sequentialRandomBytes } from './ids.js';
import { GARMENT_CATEGORIES } from './registry/garment-categories.js';
import { TEMPLATE_KEYS, createKnitTshirt, createWovenShirt, templates } from './templates/index.js';
import { byType, shirt, tshirt } from './test-helpers.js';
import { validateDesignState } from './validation/structural.js';

describe('templates (AC7, ADR-008)', () => {
  it('exist for every registered category', () => {
    expect([...TEMPLATE_KEYS].sort()).toEqual(GARMENT_CATEGORIES.map((c) => c.key).sort());
  });

  it('woven shirt has the planned parts, addressable independently', () => {
    const s = shirt();
    const types = s.components.map((c) => c.componentType).sort();
    expect(types).toEqual(
      [
        'back_body_panel',
        'collar',
        'cuff',
        'cuff',
        'front_body_panel',
        'garment_body',
        'hem',
        'placket',
        'pocket',
        'sleeve',
        'sleeve',
      ].sort(),
    );
    expect(new Set(s.components.map((c) => c.componentId)).size).toBe(s.components.length);
    expect(byType(s, 'sleeve', 'left').componentId).not.toBe(
      byType(s, 'sleeve', 'right').componentId,
    );
    expect(byType(s, 'cuff', 'left').parentComponentId).toBe(
      byType(s, 'sleeve', 'left').componentId,
    );
    expect(s).toMatchObject({
      garmentType: 'shirt',
      garmentCategory: 'woven_shirt',
      schemaVersion: '1.0.0',
      provenance: { createdFrom: 'template', templateKey: 'woven_shirt' },
    });
  });

  it('pocket is optional', () => {
    expect(
      createWovenShirt({ chestPocket: false }).components.some((c) => c.componentType === 'pocket'),
    ).toBe(false);
  });

  it('knit T-shirt has body, panels, sleeves, neckline and hems', () => {
    const t = tshirt();
    expect(t.components.map((c) => c.componentType).sort()).toEqual([
      'back_body_panel',
      'front_body_panel',
      'garment_body',
      'hem',
      'hem',
      'hem',
      'neckline',
      'sleeve',
      'sleeve',
    ]);
    expect(t.garmentType).toBe('tshirt');
  });

  it('never invents confirmed values; suggestions are proposed template values that need review (PROP-005)', () => {
    for (const state of [shirt(), tshirt()]) {
      for (const c of state.components) {
        for (const [key, pv] of Object.entries(c.properties)) {
          expect(pv.status, `${c.displayName} ${key}`).not.toBe('confirmed');
          expect(pv.confirmedBy).toBeNull();
          if (pv.status === 'proposed') {
            expect(pv).toMatchObject({ sourceType: 'template', reviewRequired: true });
          } else {
            expect(pv).toMatchObject({ status: 'missing', value: null, reviewRequired: true });
          }
          // Dimensions, materials and colours are never guessed.
          if (
            key.startsWith('dimension.') ||
            key.startsWith('material.') ||
            key === 'appearance.color'
          )
            expect(pv.status).toBe('missing');
        }
      }
    }
  });

  it('validates with no errors and no manual-review noise', () => {
    for (const key of TEMPLATE_KEYS) {
      const r = validateDesignState(templates.create(key));
      expect(r.findings.filter((f) => f.outcome === 'error')).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  it('is deterministic with a seeded id generator, random otherwise', () => {
    expect(contentHash(createKnitTshirt({ randomBytes: sequentialRandomBytes() }))).toBe(
      contentHash(createKnitTshirt({ randomBytes: sequentialRandomBytes() })),
    );
    expect(contentHash(createKnitTshirt())).not.toBe(contentHash(createKnitTshirt()));
  });

  it('rejects unknown categories', () => {
    expect(() => templates.create('kurta')).toThrow(/No template/);
  });
});
