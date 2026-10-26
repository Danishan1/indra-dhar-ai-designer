import {
  diffDesignStates,
  sequentialRandomBytes,
  templates,
  userValue,
  validateDesignState,
  type GarmentDesignState,
} from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import {
  composeChangeSummary,
  diffCounts,
  extractRefs,
  MAX_SUMMARY_LINES,
  summarizeDiff,
  validationSummaryOf,
} from './change-summary.js';

const WHEN = '2026-10-26T10:00:00.000Z';
const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const find = (s: GarmentDesignState, type: string, side?: string) =>
  s.components.find((c) => c.componentType === type && (side === undefined || c.side === side))!;

describe('summarizeDiff', () => {
  it('describes component, property, artifact and relationship changes in plain language', () => {
    const a = shirt();
    find(a, 'sleeve', 'right').artifactBindings = [
      {
        bindingId: 'bnd_bbbbbbbbbbbb',
        artifactId: 'art-2',
        artifactRevisionId: 'rev-1',
        role: null,
      },
    ];
    const b = structuredClone(a);
    find(b, 'sleeve', 'left').properties['dimension.sleeve_length'] = userValue(
      580,
      { confirmedBy: 'u1', confirmedAt: WHEN },
      'mm',
    );
    find(b, 'collar').properties['construction.collar_type'] = {
      ...find(b, 'collar').properties['construction.collar_type']!,
      value: 'mandarin',
    };
    find(b, 'placket').properties['construction.placket_type'] = {
      ...find(b, 'placket').properties['construction.placket_type']!,
      status: 'needs_review',
    };
    find(b, 'collar').displayName = 'Band collar';
    b.components = b.components.filter((c) => c.componentType !== 'pocket');
    find(b, 'sleeve', 'right').artifactBindings[0]!.artifactRevisionId = 'rev-2';
    b.relationships.push({
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'attached_to',
      source: { entityType: 'design_component', entityId: find(b, 'collar').componentId },
      target: { entityType: 'design_component', entityId: find(b, 'garment_body').componentId },
      placement: null,
      constraints: [],
      status: 'confirmed',
      provenanceRefs: [],
    });
    const lines = summarizeDiff(diffDesignStates(a, b), a, b);
    expect(lines).toEqual([
      'Removed Chest pocket',
      'Left sleeve: Sleeve length set to 580 mm',
      'Renamed Collar to Band collar',
      'Band collar: Collar type set to "mandarin" (proposed)',
      'Front placket: Placket type marked needs review',
      'Right sleeve: artifact updated to revision rev-2',
      'Added 1 relationship',
    ]);
  });

  it('says when only descriptive details changed, and caps long summaries', () => {
    const a = shirt();
    const b = structuredClone(a);
    b.metadata = { note: 'x' };
    expect(summarizeDiff(diffDesignStates(a, b), a, b)).toEqual([
      'Only descriptive details or display settings changed',
    ]);
    const many = structuredClone(a);
    for (const c of many.components)
      for (const k of Object.keys(c.properties)) delete c.properties[k];
    const lines = summarizeDiff(diffDesignStates(a, many), a, many);
    expect(lines).toHaveLength(MAX_SUMMARY_LINES);
    expect(lines.at(-1)).toMatch(/^…and \d+ more changes$/);
  });

  it('reports category changes and new components', () => {
    const a = templates.create('knit_tshirt', { randomBytes: sequentialRandomBytes() });
    const b = shirt();
    const lines = summarizeDiff(diffDesignStates(a, b), a, b);
    expect(lines.slice(0, 2)).toEqual([
      'Garment type changed from tshirt to shirt',
      'Garment category changed from knit_tshirt to woven_shirt',
    ]);
  });
});

describe('composeChangeSummary and counts', () => {
  it('puts the user text first', () => {
    expect(composeChangeSummary(' Longer sleeves ', ['Left sleeve: x'])).toBe(
      'Longer sleeves\n• Left sleeve: x',
    );
    expect(composeChangeSummary(undefined, [])).toBe('• No structural changes');
  });

  it('counts changes', () => {
    const a = shirt();
    const b = structuredClone(a);
    b.components.pop();
    expect(diffCounts(diffDesignStates(a, b))).toMatchObject({
      componentsRemoved: 1,
      metadataOnly: false,
    });
  });
});

describe('extractRefs', () => {
  it('collects pinned artifact revisions and assets, sorted and unique', () => {
    const s = shirt();
    find(s, 'sleeve', 'left').artifactBindings = [
      { bindingId: 'bnd_aaaaaaaaaaaa', artifactId: 'a', artifactRevisionId: 'rev-b', role: null },
    ];
    find(s, 'sleeve', 'right').artifactBindings = [
      { bindingId: 'bnd_bbbbbbbbbbbb', artifactId: 'a', artifactRevisionId: 'rev-b', role: null },
    ];
    find(s, 'collar').assetRefs = [{ assetId: 'asset-2', role: 'reference' }];
    s.relationships.push({
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'decorative_trim_applied_to',
      source: { entityType: 'artifact_revision', entityId: 'rev-a' },
      target: { entityType: 'design_component', entityId: find(s, 'hem').componentId },
      placement: {
        region: 'hem',
        anchor: null,
        coordinateSpace: 'component_local',
        translation: null,
        rotationDeg: null,
        scale: null,
        orientation: null,
        offset: null,
        geometryRevisionId: null,
        calibrationRef: null,
        approximate: true,
        confidence: null,
      },
      constraints: [],
      status: 'proposed',
      provenanceRefs: [],
    });
    expect(extractRefs(s)).toEqual({
      artifactRevisionRefs: ['rev-a', 'rev-b'],
      sourceAssetRefs: ['asset-2'],
    });
  });

  it('summarizes validation findings', () => {
    const s = shirt();
    s.relationships.push({
      relationshipId: 'rel_aaaaaaaaaaaa',
      type: 'attached_to',
      source: { entityType: 'design_component', entityId: find(s, 'collar').componentId },
      target: { entityType: 'design_component', entityId: find(s, 'garment_body').componentId },
      placement: null,
      constraints: [],
      status: 'proposed',
      provenanceRefs: [],
    });
    expect(validationSummaryOf(validateDesignState(s).findings)).toEqual({
      errors: 0,
      warnings: 0,
      manualReview: 1,
    });
  });
});
