import { type PatternSpecInput, validateDesignState } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { seamChecks } from './checks.js';
import { draftPattern } from './draft-pattern.js';
import { patternDesignState } from './state.js';

/** ADR-061: every family and detail drafts a valid, sewable pattern. */
const CASES: [string, PatternSpecInput, string[]][] = [
  [
    "boys' shirt + shorts set (sample 01)",
    {
      family: 'top',
      audience: 'boys',
      size: '8y',
      style: {
        topType: 'shirt',
        collar: 'shirt',
        closure: 'front_buttons',
        placket: 'separate',
        sleeve: 'short',
        hemShape: 'straight',
        darts: false,
      },
      garments: [
        {
          key: 'shorts',
          family: 'trousers',
          style: {
            length: 'above_knee',
            closure: 'fly_zip',
            waistband: true,
            waistbandType: 'fitted',
            beltLoops: 5,
            pockets: 'slant',
            backPockets: 'patch',
          },
        },
      ],
    },
    [
      'Collar stand',
      'Button placket',
      'Front leg',
      'Side front (pocket facing)',
      'Waistband',
      'Belt loop strip',
      'Fly facing',
      'Fly shield',
      'Back patch pocket',
    ],
  ],
  [
    "men's chinos: pleats, scoop pockets, welt back pockets, turn-ups",
    {
      family: 'trousers',
      audience: 'men',
      size: 'L',
      style: {
        pleats: 'double',
        pockets: 'scoop',
        backPockets: 'welt',
        turnUps: true,
        beltLoops: 7,
        closure: 'fly_zip',
      },
    },
    ['Welt', 'Welt pocket bag', 'Pocket bag'],
  ],
  [
    "kids' joggers: elastic + drawstring, cargo pockets",
    {
      family: 'trousers',
      audience: 'girls',
      size: '6y',
      style: {
        waistbandType: 'drawstring',
        closure: 'none',
        pockets: 'side_seam',
        cargoPockets: true,
        leg: 'tapered',
      },
    },
    ['Drawstring casing', 'Drawstring', 'Cargo pocket', 'Cargo flap'],
  ],
  [
    "kids' trousers with elastic back",
    {
      family: 'trousers',
      audience: 'boys',
      size: '10y',
      style: { waistbandType: 'elastic_back', closure: 'fly_zip' },
    },
    ['Waistband'],
  ],
  [
    'jumpsuit with back zip',
    {
      family: 'jumpsuit',
      audience: 'women',
      size: 'M',
      style: { sleeve: 'short', closure: 'back_zip', collar: 'none', neckline: 'v_neck' },
    },
    ['Bodice front', 'Front leg', 'Back leg'],
  ],
  [
    "girls' romper",
    {
      family: 'jumpsuit',
      audience: 'girls',
      size: '4y',
      style: { length: 'shorts', sleeve: 'cap', closure: 'back_zip', pockets: 'none' },
    },
    ['Bodice front', 'Front leg'],
  ],
  [
    "kids' dungarees",
    {
      family: 'dungarees',
      audience: 'boys',
      size: '6y',
      style: { length: 'full', pockets: 'patch' },
    },
    ['Front bib', 'Back bib', 'Strap', 'Bib pocket'],
  ],
  [
    'blazer: notched lapel, lining',
    {
      family: 'jacket',
      audience: 'men',
      size: 'L',
      style: {
        jacketType: 'blazer',
        collar: 'notched',
        closure: 'front_buttons',
        lining: true,
        sleeve: 'long',
        cuff: 'none',
        pockets: 'patch',
        pocketCount: 2,
      },
    },
    ['Top collar', 'Front facing', 'Front lining', 'Back neck facing'],
  ],
  [
    'hoodie: hood, kangaroo, ribs',
    {
      family: 'jacket',
      audience: 'women',
      size: 'M',
      style: {
        jacketType: 'hoodie',
        hood: true,
        ribbing: true,
        closure: 'none',
        collar: 'none',
        sleeve: 'long',
        cuff: 'none',
        pockets: 'kangaroo',
      },
    },
    ['Hood', 'Hem rib', 'Cuff rib', 'Kangaroo pocket'],
  ],
  [
    'zip bomber',
    {
      family: 'jacket',
      audience: 'men',
      size: 'M',
      style: {
        jacketType: 'bomber',
        ribbing: true,
        closure: 'front_zip',
        collar: 'none',
        neckline: 'crew',
        sleeve: 'long',
        cuff: 'none',
        lining: true,
      },
    },
    ['Hem rib', 'Front lining'],
  ],
  [
    'camp-collar shirt with chest pocket and back pleat',
    {
      family: 'top',
      audience: 'men',
      size: 'M',
      style: {
        topType: 'shirt',
        collar: 'camp',
        closure: 'front_buttons',
        yoke: true,
        backPleat: true,
        pockets: 'patch',
        sleeve: 'short',
      },
    },
    ['Camp collar', 'Back yoke', 'Chest pocket'],
  ],
  [
    'long-sleeve shirt with cuffs: sleeve plackets',
    {
      family: 'top',
      audience: 'women',
      size: 'S',
      style: {
        topType: 'shirt',
        collar: 'shirt',
        closure: 'front_buttons',
        sleeve: 'long',
        cuff: 'shirt',
        placket: 'hidden',
      },
    },
    ['Sleeve placket', 'Placket underlap', 'Cuff'],
  ],
  [
    "girls' frock with yoke and hem ruffle",
    {
      family: 'dress',
      audience: 'girls',
      size: '6y',
      style: {
        yoke: true,
        sleeve: 'short',
        sleeveStyle: 'puff',
        collar: 'peter_pan',
        closure: 'back_zip',
        ruffles: ['hem'],
      },
    },
    ['Front yoke', 'Skirt front', 'Hem ruffle'],
  ],
  [
    'tiered maxi dress',
    {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { skirt: 'tiered', tiers: 3, length: 'floor', sleeve: 'none', closure: 'back_zip' },
    },
    ['Tier 1', 'Tier 2', 'Tier 3'],
  ],
  [
    'wrap dress',
    {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { wrap: true, sleeve: 'elbow', skirt: 'a_line' },
    },
    ['Tie'],
  ],
  [
    'pleated skirt with elastic waist',
    {
      family: 'skirt',
      audience: 'girls',
      size: '8y',
      style: { skirt: 'pleated', waistbandType: 'elastic', closure: 'none' },
    },
    ['Elastic waistband', 'Skirt front'],
  ],
  [
    'peplum top',
    {
      family: 'top',
      audience: 'women',
      size: 'M',
      style: { peplum: true, sleeve: 'short', closure: 'back_zip' },
    },
    ['Peplum front', 'Peplum back'],
  ],
];

describe('garment families and details (ADR-061)', () => {
  for (const [name, spec, expected] of CASES)
    it(`drafts: ${name}`, () => {
      const draft = draftPattern(spec);
      const state = patternDesignState(draft, { createdFrom: 'ai' });
      const errors = validateDesignState(state).findings.filter((f) => f.outcome === 'error');
      expect(errors).toEqual([]);
      const names = state.patternPieces!.map((p) => p.name);
      for (const n of expected) expect(names, `missing ${n}`).toContain(n);
      const bad = seamChecks(state.patternPieces!, state.patternSpec).filter(
        (c) => c.status === 'error',
      );
      expect(bad).toEqual([]);
      for (const p of state.patternPieces!) {
        expect(p.outline.length).toBeGreaterThanOrEqual(3);
        expect(p.outline.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
      }
    });

  it('drafts a set as one design with a set garment per garment', () => {
    const draft = draftPattern(CASES[0]![1]);
    expect(draft.rootName).toBe('Shirt + Shorts set');
    const state = patternDesignState(draft, { createdFrom: 'ai' });
    const groups = state.components.filter((c) => c.componentType === 'set_garment');
    expect(groups.map((g) => g.displayName)).toEqual(['Shirt', 'Shorts']);
    const checks = seamChecks(state.patternPieces!, state.patternSpec);
    expect(checks.some((c) => c.label.startsWith('Shirt: '))).toBe(true);
    expect(checks.some((c) => c.label.startsWith('Shorts: Waist'))).toBe(true);
  });
});
