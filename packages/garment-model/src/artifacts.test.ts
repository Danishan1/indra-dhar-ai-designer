import { describe, expect, it } from 'vitest';

import {
  ArtifactCategories,
  artifactDefinitionSchema,
  artifactPropertiesSchema,
  checkCompatibility,
  deriveGeometryCapability,
  deriveValidationStatus,
} from './artifacts/index.js';
import { missingValue, userValue } from './schema/property-value.js';

const WHEN = '2026-10-26T10:00:00.000Z';
const lace = artifactDefinitionSchema.parse({
  compatibleTargetTypes: ['sleeve', 'hem'],
  allowedPlacementRegions: ['hem', 'cuff_edge'],
  preferredPlacementRegions: ['hem'],
  repeatable: true,
  placementModes: ['follow_boundary'],
});

describe('artifact definitions', () => {
  it('has a prefix for every category', () => {
    expect(ArtifactCategories.lace).toBe('LAC');
    expect(new Set(Object.values(ArtifactCategories)).size).toBe(
      Object.keys(ArtifactCategories).length,
    );
  });

  it('applies defaults and rejects bad definitions', () => {
    const d = artifactDefinitionSchema.parse({ compatibleTargetTypes: ['collar'] });
    expect(d).toMatchObject({
      allowedPlacementRegions: null,
      repeatable: false,
      placementModes: ['attach'],
      shapeParams: null,
    });
    expect(artifactDefinitionSchema.safeParse({ compatibleTargetTypes: [] }).success).toBe(false);
    expect(artifactDefinitionSchema.safeParse({ compatibleTargetTypes: ['Sleeve'] }).success).toBe(
      false,
    );
    expect(
      artifactDefinitionSchema.safeParse({
        compatibleTargetTypes: ['sleeve'],
        shapeParams: { kind: 'sleeve', params: { 'bad key': 1 } },
      }).success,
    ).toBe(false);
  });

  it('derives geometry capability', () => {
    expect(deriveGeometryCapability(lace)).toBe('G0');
    expect(
      deriveGeometryCapability({
        ...lace,
        shapeParams: { kind: 'border', params: { scallops: 12 } },
      }),
    ).toBe('G2');
    expect(
      deriveGeometryCapability({
        ...lace,
        geometryRefs: [{ refId: 'g', geometryRevisionId: 'v1', coordinateSpace: 'image_px' }],
      }),
    ).toBe('G1');
  });

  it('is production-validated only when every physical property is confirmed (ART-014)', () => {
    const visualOnly = artifactPropertiesSchema.parse({
      physical: { 'material.composition': missingValue() },
    });
    expect(deriveValidationStatus(lace, visualOnly, false)).toBe('unvalidated');
    expect(deriveValidationStatus({ ...lace, previewSvg: '<svg/>' }, visualOnly, false)).toBe(
      'design_asset_validated',
    );
    expect(deriveValidationStatus(lace, visualOnly, true)).toBe('design_asset_validated');
    const confirmed = artifactPropertiesSchema.parse({
      physical: { 'material.gsm': userValue(120, { confirmedBy: 'u1', confirmedAt: WHEN }, 'gsm') },
    });
    expect(deriveValidationStatus(lace, confirmed, false)).toBe('production_validated');
    expect(deriveValidationStatus(lace, artifactPropertiesSchema.parse({}), true)).toBe(
      'design_asset_validated',
    );
  });
});

describe('checkCompatibility (ART-012)', () => {
  it('allows lace on a sleeve hem', () => {
    const r = checkCompatibility(lace, 'G2', { componentType: 'sleeve', region: 'hem' });
    expect(r).toEqual({ compatible: true, findings: [] });
  });

  it('refuses lace on a collar and on regions the rule excludes', () => {
    expect(
      checkCompatibility(lace, 'G2', { componentType: 'collar' }).findings.map((f) => f.ruleId),
    ).toEqual(['artifact.target_incompatible']);
    const r = checkCompatibility(lace, 'G2', { componentType: 'sleeve', region: 'cap' });
    expect(r.compatible).toBe(false);
    expect(r.findings[0]?.ruleId).toBe('artifact.region_not_allowed');
  });

  it('warns on non-preferred regions and approximate placement', () => {
    const r = checkCompatibility(lace, 'G0', { componentType: 'sleeve', region: 'cuff_edge' });
    expect(r.compatible).toBe(true);
    expect(r.findings.map((f) => [f.ruleId, f.outcome])).toEqual([
      ['artifact.region_not_preferred', 'warning'],
      ['artifact.placement_approximate', 'warning'],
    ]);
  });

  it('enforces repeatability', () => {
    const pocket = artifactDefinitionSchema.parse({ compatibleTargetTypes: ['front_body_panel'] });
    expect(
      checkCompatibility(pocket, 'G2', { componentType: 'front_body_panel', existingUses: 1 })
        .compatible,
    ).toBe(false);
    expect(
      checkCompatibility(lace, 'G2', { componentType: 'sleeve', existingUses: 3 }).compatible,
    ).toBe(true);
  });
});

describe('validateArtifactRevision', () => {
  it('accepts a valid revision and rejects unknown targets, keys and bad values', async () => {
    const { validateArtifactRevision } = await import('./artifacts/validate.js');
    expect(validateArtifactRevision({ compatibleTargetTypes: ['sleeve'] }, {}).ok).toBe(true);
    const bad = validateArtifactRevision(
      { compatibleTargetTypes: ['spaceship'] },
      {
        visual: {
          'appearance.sparkle': missingValue(),
          'appearance.color': {
            ...missingValue(),
            value: 'red',
            status: 'proposed',
            sourceType: 'template',
          },
        },
        physical: {
          'material.gsm': {
            ...missingValue(),
            value: 120,
            status: 'proposed',
            sourceType: 'template',
          },
          'ext.vendor': missingValue(),
        },
      },
    );
    expect(bad.findings.map((x) => x.ruleId).sort()).toEqual([
      'artifact.target_type_unknown',
      'property.invalid_value',
      'property.unit_missing',
      'property.unknown',
    ]);
    expect(
      validateArtifactRevision({ compatibleTargetTypes: [] }, { visual: 'x' }).findings.map(
        (x) => x.ruleId,
      ),
    ).toEqual(['artifact.definition_invalid', 'artifact.properties_invalid']);
  });
});
