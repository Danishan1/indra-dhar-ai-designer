import { describe, expect, it } from 'vitest';

import { defaultCatalog, extendCatalog } from './registry/catalog.js';
import { hasBlockingFindings } from './schema/finding.js';
import { missingValue, proposedFromTemplate, userValue } from './schema/property-value.js';
import { byType, shirt, tshirt, WHEN } from './test-helpers.js';
import { validateDesignState } from './validation/structural.js';

const rules = (r: ReturnType<typeof validateDesignState>, outcome?: string) =>
  r.findings
    .filter((f) => !outcome || f.outcome === outcome)
    .map((f) => f.ruleId)
    .sort();

describe('validateDesignState', () => {
  it('accepts both templates with no errors (AC7)', () => {
    for (const s of [shirt(), tshirt()]) {
      const r = validateDesignState(s);
      expect(r.ok).toBe(true);
      expect(rules(r, 'error')).toEqual([]);
      expect(r.state).not.toBeNull();
    }
  });

  it('reports schema problems as findings', () => {
    const r = validateDesignState({ schemaVersion: '1', components: 'x' });
    expect(r.ok).toBe(false);
    expect(r.state).toBeNull();
    expect(rules(r)).toContain('schema.invalid');
    expect(r.findings.every((f) => f.path !== null)).toBe(true);
  });

  it('flags unknown/mismatched categories', () => {
    const a = shirt();
    a.garmentCategory = 'spaceship';
    expect(rules(validateDesignState(a), 'error')).toContain('category.unknown');
    const b = shirt();
    b.garmentType = 'tshirt';
    expect(rules(validateDesignState(b), 'error')).toContain('category.type_mismatch');
  });

  describe('hierarchy and repeatability (CMP-015…018)', () => {
    it('left and right sleeves are independent; a second left sleeve is an error', () => {
      const s = shirt();
      const left = byType(s, 'sleeve', 'left');
      s.components.push({ ...structuredClone(left), componentId: 'cmp_dupleftsleeve' });
      expect(rules(validateDesignState(s), 'error')).toContain('component.duplicate_sided');
    });

    it('allows several pockets but only one collar', () => {
      const s = shirt();
      s.components.push({
        ...structuredClone(byType(s, 'pocket')),
        componentId: 'cmp_pocketnumber2',
        side: 'right',
      });
      expect(validateDesignState(s).ok).toBe(true);
      s.components.push({
        ...structuredClone(byType(s, 'collar')),
        componentId: 'cmp_secondcollar1',
      });
      expect(rules(validateDesignState(s), 'error')).toContain('component.duplicate_single');
    });

    it.each([
      [
        'unknown type',
        (s: ReturnType<typeof shirt>) => (byType(s, 'collar').componentType = 'wing_nut'),
        'component.type_unknown',
      ],
      [
        'parent missing',
        (s: ReturnType<typeof shirt>) =>
          (byType(s, 'collar').parentComponentId = 'cmp_doesnotexist1'),
        'component.parent_missing',
      ],
      [
        'parent not allowed',
        (s: ReturnType<typeof shirt>) =>
          (byType(s, 'cuff', 'left').parentComponentId = byType(s, 'garment_body').componentId),
        'component.parent_not_allowed',
      ],
      [
        'root not allowed',
        (s: ReturnType<typeof shirt>) => (byType(s, 'collar').parentComponentId = null),
        'component.root_not_allowed',
      ],
      [
        'own parent',
        (s: ReturnType<typeof shirt>) =>
          (byType(s, 'collar').parentComponentId = byType(s, 'collar').componentId),
        'component.parent_self',
      ],
      [
        'second body',
        (s: ReturnType<typeof shirt>) =>
          s.components.push({
            ...structuredClone(byType(s, 'garment_body')),
            componentId: 'cmp_secondbody01',
          }),
        'design.multiple_bodies',
      ],
      [
        'duplicate id',
        (s: ReturnType<typeof shirt>) =>
          s.components.push(structuredClone(byType(s, 'back_body_panel'))),
        'id.duplicate',
      ],
    ])('%s is an error', (_n, mutate, rule) => {
      const s = shirt();
      mutate(s);
      expect(rules(validateDesignState(s), 'error')).toContain(rule);
    });

    it('detects parent loops once', () => {
      const s = shirt();
      const sleeve = byType(s, 'sleeve', 'left');
      const cuff = byType(s, 'cuff', 'left');
      // sleeve under cuff, cuff under sleeve → loop (both parent rules also fire).
      sleeve.parentComponentId = cuff.componentId;
      expect(
        rules(validateDesignState(s), 'error').filter((r) => r === 'component.parent_cycle'),
      ).toHaveLength(1);
    });

    it('warns on missing side, no body and atypical types', () => {
      const s = shirt();
      byType(s, 'sleeve', 'left').side = 'none';
      expect(rules(validateDesignState(s), 'warning')).toContain('component.side_missing');
      const t = tshirt();
      t.components.push({
        ...structuredClone(byType(shirt(), 'collar')),
        componentId: 'cmp_tshirtcollar',
        parentComponentId: byType(t, 'garment_body').componentId,
      });
      expect(rules(validateDesignState(t), 'warning')).toContain('component.type_not_typical');
      expect(rules(validateDesignState({ ...shirt(), components: [] }), 'warning')).not.toContain(
        'design.no_body',
      );
      // A design without a body (here: only a hem, which also breaks the root rule) gets the warning.
      const bodyless = {
        ...shirt(),
        components: [{ ...byType(shirt(), 'hem'), parentComponentId: null }],
      };
      expect(rules(validateDesignState(bodyless), 'warning')).toContain('design.no_body');
    });
  });

  describe('properties (PROP-001…007)', () => {
    it('rejects a physical dimension without a unit (PROP-003)', () => {
      const s = shirt();
      byType(s, 'sleeve', 'left').properties['dimension.sleeve_length'] = {
        ...userValue(580, { confirmedBy: 'u', confirmedAt: WHEN }),
        unit: null,
      };
      expect(rules(validateDesignState(s), 'error')).toContain('property.unit_missing');
    });

    it('rejects wrong unit kinds and unexpected units', () => {
      const s = shirt();
      const sleeve = byType(s, 'sleeve', 'left');
      sleeve.properties['dimension.sleeve_length'] = userValue(
        580,
        { confirmedBy: 'u', confirmedAt: WHEN },
        'gsm',
      );
      sleeve.properties['construction.sleeve_type'] = {
        ...proposedFromTemplate('set_in'),
        unit: 'mm',
      };
      expect(rules(validateDesignState(s), 'error')).toEqual(
        expect.arrayContaining(['property.unit_mismatch', 'property.unit_unexpected']),
      );
    });

    it('accepts a proper dimension in any length unit', () => {
      const s = shirt();
      byType(s, 'sleeve', 'left').properties['dimension.sleeve_length'] = userValue(
        22.8,
        { confirmedBy: 'u', confirmedAt: WHEN },
        'in',
      );
      expect(validateDesignState(s).ok).toBe(true);
    });

    it('validates enum values against the catalog and registered extensions (PROP-004)', () => {
      const s = shirt();
      byType(s, 'collar').properties['construction.collar_type'] = proposedFromTemplate('wing');
      expect(rules(validateDesignState(s), 'error')).toContain('property.enum_value_not_allowed');
      const ext = extendCatalog(defaultCatalog, {
        enumExtensions: { 'construction.collar_type': ['wing'] },
      });
      expect(validateDesignState(s, ext).ok).toBe(true);
    });

    it('validates types, ranges and compositions', () => {
      const s = shirt();
      const body = byType(s, 'garment_body');
      body.properties['appearance.color'] = proposedFromTemplate('red');
      body.properties['material.gsm'] = proposedFromTemplate(5, 'gsm');
      body.properties['material.composition'] = proposedFromTemplate([
        { fiber: 'cotton', percent: 50 },
      ]);
      body.properties['dimension.body_length'] = proposedFromTemplate(-3, 'mm');
      const r = validateDesignState(s);
      expect(rules(r, 'error').filter((x) => x === 'property.invalid_value')).toHaveLength(3);
      expect(rules(r, 'error')).toContain('property.out_of_range');
    });

    it('rejects unknown core properties, allows (and warns on) unregistered extensions, and checks the owner type', () => {
      const s = shirt();
      byType(s, 'collar').properties['appearance.sparkle'] = missingValue();
      byType(s, 'collar').properties['ext.vendor_flag'] = proposedFromTemplate(true);
      byType(s, 'collar').properties['dimension.body_length'] = missingValue();
      const r = validateDesignState(s);
      expect(rules(r, 'error')).toEqual(
        expect.arrayContaining(['property.unknown', 'property.not_allowed_for_type']),
      );
      expect(rules(r, 'warning')).toContain('property.unregistered_extension');
    });

    it('keeps evidence and review status for critical properties (PROP-006)', () => {
      const s = shirt();
      const collar = byType(s, 'collar');
      collar.properties['construction.collar_type'] = {
        ...userValue('spread', { confirmedBy: 'u', confirmedAt: WHEN }),
        sourceRefs: [],
      };
      collar.properties['dimension.collar_height'] = {
        ...proposedFromTemplate(40, 'mm'),
        reviewRequired: false,
      };
      const r = validateDesignState(s);
      expect(rules(r, 'warning')).toEqual(
        expect.arrayContaining(['property.critical_unevidenced', 'property.critical_needs_review']),
      );
      expect(r.ok).toBe(true);
    });

    it('a generated picture cannot establish critical values (PROP-007)', () => {
      const s = shirt();
      byType(s, 'sleeve', 'left').properties['dimension.sleeve_length'] = {
        ...proposedFromTemplate(580, 'mm'),
        status: 'inferred',
        sourceType: 'ai_generation',
      };
      expect(rules(validateDesignState(s), 'error')).toContain('property.ai_generation_critical');
    });
  });

  describe('artifact bindings (ART-004)', () => {
    it('requires a pinned revision in the schema', () => {
      const s = shirt();
      (byType(s, 'sleeve', 'left') as { artifactBindings: unknown[] }).artifactBindings = [
        { bindingId: 'bnd_aaaaaaaaaaaa', artifactId: 'a' },
      ];
      expect(validateDesignState(s).ok).toBe(false);
    });

    it('checks pinned revisions exist when the caller can resolve them', () => {
      const s = shirt();
      byType(s, 'sleeve', 'left').artifactBindings = [
        { bindingId: 'bnd_aaaaaaaaaaaa', artifactId: 'a', artifactRevisionId: 'r1', role: null },
      ];
      expect(validateDesignState(s).ok).toBe(true);
      expect(
        validateDesignState(s, defaultCatalog, { knownArtifactRevisions: new Set(['r1']) }).ok,
      ).toBe(true);
      expect(
        rules(
          validateDesignState(s, defaultCatalog, { knownArtifactRevisions: new Set(['r2']) }),
          'error',
        ),
      ).toContain('binding.revision_unknown');
    });

    it('rejects duplicate binding ids', () => {
      const s = shirt();
      const b = {
        bindingId: 'bnd_aaaaaaaaaaaa',
        artifactId: 'a',
        artifactRevisionId: 'r1',
        role: null,
      };
      byType(s, 'sleeve', 'left').artifactBindings = [b];
      byType(s, 'sleeve', 'right').artifactBindings = [b];
      expect(rules(validateDesignState(s), 'error')).toContain('id.duplicate');
    });
  });

  it('outcomes and blocking helper', () => {
    const s = shirt();
    s.garmentCategory = 'spaceship';
    const r = validateDesignState(s);
    expect(hasBlockingFindings(r.findings)).toBe(true);
    expect(r.ok).toBe(false);
  });

  it('is deterministic', () => {
    const s = shirt();
    byType(s, 'collar').properties['appearance.sparkle'] = missingValue();
    expect(validateDesignState(s)).toEqual(validateDesignState(structuredClone(s)));
  });
});
