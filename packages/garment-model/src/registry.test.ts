import { describe, expect, it } from 'vitest';

import {
  allowedPropertyKeys,
  defaultCatalog,
  extendCatalog,
  isEnumValueAllowed,
} from './registry/catalog.js';
import { COMPONENT_TYPES } from './registry/component-types.js';
import { GARMENT_CATEGORIES } from './registry/garment-categories.js';
import { PROPERTY_DEFINITIONS, PROPERTY_KEYS } from './registry/property-definitions.js';
import { RELATIONSHIP_TYPES } from './registry/relationship-types.js';
import { PROPERTY_KEY_PATTERN, dataTypeValueSchemas } from './schema/property-value.js';
import { RelationshipTypes } from './schema/relationship.js';

describe('registries are self-consistent (AC2, AC3)', () => {
  it('covers the SPEC-003 §8.2 component catalog', () => {
    const types = COMPONENT_TYPES.map((c) => c.type);
    for (const t of [
      'garment_body',
      'front_body_panel',
      'back_body_panel',
      'sleeve',
      'cuff',
      'collar',
      'neckline',
      'placket',
      'pocket',
      'waistband',
      'hem',
      'yoke',
      'hood',
      'lining',
      'facing',
      'gusset',
      'seam_group',
      'decorative_region',
      'artwork_placement_region',
      'custom',
    ]) {
      expect(types).toContain(t);
    }
    expect(new Set(types).size).toBe(types.length);
  });

  it('every property a component type allows is defined', () => {
    for (const c of COMPONENT_TYPES) {
      if (c.allowedProperties === '*') continue;
      for (const key of c.allowedProperties)
        expect(PROPERTY_KEYS, `${c.type} → ${key}`).toContain(key);
    }
  });

  it('every allowed parent is a registered type, and only body/custom may be root', () => {
    const types = new Set(COMPONENT_TYPES.map((c) => c.type));
    for (const c of COMPONENT_TYPES) {
      if (c.allowedParents !== '*')
        for (const p of c.allowedParents) expect(types.has(p), `${c.type} → ${p}`).toBe(true);
    }
    expect(
      COMPONENT_TYPES.filter((c) => c.rootAllowed)
        .map((c) => c.type)
        .sort(),
    ).toEqual(['custom', 'garment_body']);
  });

  it('every category in a component type exists', () => {
    const cats = new Set(GARMENT_CATEGORIES.map((c) => c.key));
    for (const c of COMPONENT_TYPES)
      if (c.garmentCategories !== '*')
        for (const k of c.garmentCategories) expect(cats.has(k)).toBe(true);
  });

  it('properties are well formed: namespaced keys, enums have values, dimensions are lengths', () => {
    for (const p of PROPERTY_DEFINITIONS) {
      expect(p.key).toMatch(PROPERTY_KEY_PATTERN);
      expect(p.key.startsWith('ext.')).toBe(false);
      if (p.dataType === 'enum') expect(p.enumValues?.length).toBeGreaterThan(1);
      else expect(p.enumValues).toBeUndefined();
      if (p.dataType === 'dimension') expect(p.unitKind).toBe('length');
      expect(dataTypeValueSchemas[p.dataType]).toBeDefined();
    }
    for (const key of [
      'appearance.color',
      'construction.sleeve_type',
      'dimension.sleeve_length',
      'construction.cuff_type',
      'construction.collar_type',
      'construction.neckline_type',
      'construction.placket_type',
      'construction.pocket_type',
      'placement.pocket_position',
      'material.fabric_ref',
      'material.composition',
      'material.gsm',
      'construction.hem_type',
      'dimension.body_length',
      'dimension.chest_width',
      'appearance.silhouette',
    ]) {
      expect(PROPERTY_KEYS).toContain(key);
    }
  });

  it('every §10.3 relationship type has endpoint rules, and every endpoint type is real', () => {
    expect(RELATIONSHIP_TYPES.map((r) => r.type).sort()).toEqual([...RelationshipTypes].sort());
    for (const r of RELATIONSHIP_TYPES) {
      expect(r.allowedSources.length).toBeGreaterThan(0);
      expect(r.allowedTargets.length).toBeGreaterThan(0);
    }
    const placementTypes = RELATIONSHIP_TYPES.filter((r) => r.requiresPlacement).map((r) => r.type);
    expect(placementTypes).toEqual(
      expect.arrayContaining(['decorative_trim_applied_to', 'embroidery_placed_on', 'applied_to']),
    );
  });

  it('manufacturing-critical properties are flagged (PROP-006)', () => {
    const crit = (k: string) => defaultCatalog.properties.get(k)?.manufacturingCritical;
    expect(crit('material.gsm')).toBe(true);
    expect(crit('dimension.sleeve_length')).toBe(true);
    expect(crit('appearance.color')).toBe(false);
  });
});

describe('extendCatalog (PROP-004, §4.4)', () => {
  it('registers enum values, new types, properties and categories without touching the core', () => {
    const ext = extendCatalog(defaultCatalog, {
      enumExtensions: { 'construction.collar_type': ['wing'] },
      componentTypes: [
        {
          type: 'epaulette',
          label: 'Epaulette',
          defaultDisplayName: 'Epaulette',
          allowedParents: ['garment_body'],
          rootAllowed: false,
          repeatability: 'sided',
          allowedProperties: ['appearance.color'],
          garmentCategories: '*',
        },
      ],
      properties: [
        {
          key: 'ext.shank_button',
          label: 'Shank button',
          dataType: 'boolean',
          unitKind: null,
          manufacturingCritical: false,
          ui: { control: 'toggle', group: 'Extras' },
        },
      ],
      categories: [{ key: 'kurta', label: 'Kurta', garmentType: 'kurta', fabricBase: 'woven' }],
    });
    expect(isEnumValueAllowed(ext, 'construction.collar_type', 'wing')).toBe(true);
    expect(isEnumValueAllowed(defaultCatalog, 'construction.collar_type', 'wing')).toBe(false);
    expect(isEnumValueAllowed(ext, 'construction.collar_type', 'spread')).toBe(true);
    expect(ext.componentTypes.has('epaulette')).toBe(true);
    expect(defaultCatalog.componentTypes.has('epaulette')).toBe(false);
    expect(ext.categories.has('kurta')).toBe(true);
    expect(allowedPropertyKeys(ext, 'epaulette')).toEqual(['appearance.color']);
    expect(allowedPropertyKeys(ext, 'custom')).toContain('ext.shank_button');
    expect(allowedPropertyKeys(ext, 'nope')).toEqual([]);
  });

  it('refuses to redefine or to extend a non-enum', () => {
    expect(() => extendCatalog(defaultCatalog, { categories: [GARMENT_CATEGORIES[0]!] })).toThrow(
      /already registered/,
    );
    expect(() =>
      extendCatalog(defaultCatalog, { enumExtensions: { 'dimension.body_length': ['x'] } }),
    ).toThrow(/not a registered enum/);
    expect(() => extendCatalog(defaultCatalog, { componentTypes: [COMPONENT_TYPES[0]!] })).toThrow(
      /already registered/,
    );
    expect(() => extendCatalog(defaultCatalog, { properties: [PROPERTY_DEFINITIONS[0]!] })).toThrow(
      /already registered/,
    );
    expect(isEnumValueAllowed(defaultCatalog, 'dimension.body_length', 'x')).toBe(false);
  });
});
