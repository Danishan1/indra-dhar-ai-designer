import { FakeProvider } from '@ai-designer/ai';
import { validateDesignState } from '@ai-designer/garment-model';
import { draftPattern, patternDesignState, seamChecks } from '@ai-designer/pattern-model';
import { describe, expect, it } from 'vitest';

import { fakeResponders } from './fake-responders.js';
import {
  readSketch,
  sketchClassificationSchema,
  sketchDetailsSchema,
  specFromSketch,
} from './sketch.js';
import { techPackHtml } from './techpack-html.js';
import { buildTechPack } from './techpack.js';

const png = { mediaType: 'image/png' as const, data: new Uint8Array([137, 80, 78, 71]) };

describe('sketch → pattern (ADR-058)', () => {
  it('reads a sketch into a pattern spec that drafts a sewable pattern', async () => {
    const r = await readSketch(
      { images: [png], audience: 'girls', size: '8y' },
      { provider: new FakeProvider(fakeResponders) },
    );
    expect(r.spec).toMatchObject({
      family: 'dress',
      audience: 'girls',
      size: '8y',
      style: { collar: 'peter_pan', sleeveStyle: 'puff', skirt: 'gathered' },
    });
    expect(r.fromSketch['main']).toContain('collar');
    expect(r.unsure['main']).toEqual(['closure']);
    expect(r.notes.join(' ')).toMatch(/Bow/);
    const draft = draftPattern(r.spec);
    const state = patternDesignState(draft, {
      sources: [{ assetId: 'a1', role: 'sketch', label: 'Sketch' }],
    });
    expect(validateDesignState(state).findings.filter((f) => f.outcome === 'error')).toEqual([]);
    expect(
      seamChecks(state.patternPieces!, state.patternSpec).every((c) => c.status === 'ok'),
    ).toBe(true);
    // Component 3: the tech pack documents the pattern.
    const doc = buildTechPack({
      state,
      header: {
        designName: 'Party dress',
        designDisplayId: 'DSN-1',
        revisionLabel: 'R001',
        revisionId: 'r',
        projectName: 'P',
        generatedAt: '2026-11-04T10:00:00Z',
        provider: 'fake',
      },
      artifacts: new Map(),
      text: null,
      views: [],
      componentImages: {},
    });
    expect(doc.pattern).toMatchObject({ family: 'dress', size: '8y' });
    expect(doc.measurements.some((m) => m.source.startsWith('Size chart'))).toBe(true);
    expect(doc.patterns.pieces.length).toBe(state.patternPieces!.length);
    const html = techPackHtml(doc, () => null);
    expect(html).toContain('Specification');
    expect(html).toContain('Seam fit checks');
    // ADR-067: a size chart (one size by default); no ids, sources or AI processing record.
    expect(doc.sizing).toMatchObject({ standard: 'International', baseSize: '8y', sizes: ['8y'] });
    expect(html).toContain('Size chart — International');
    expect(html.replace(/<svg[\s\S]*?<\/svg>/g, '')).not.toContain('pat_');
    expect(html).not.toContain('AI processing record');
    // Graded size range in UK sizes for the same girl's dress.
    const graded = buildTechPack({
      state,
      header: {
        designName: 'Party dress',
        designDisplayId: 'DSN-1',
        revisionLabel: 'R001',
        revisionId: 'r',
        projectName: 'P',
        generatedAt: '2026-11-04T10:00:00Z',
        provider: 'fake',
      },
      artifacts: new Map(),
      text: null,
      views: [],
      componentImages: {},
      sizing: { system: 'uk', baseSize: '7-8y', sizes: ['5-6y', '7-8y', '9-10y'] },
    }).sizing!;
    expect(graded.sizes).toEqual(['5-6y', '7-8y', '9-10y']);
    const chest = graded.pom.find((p) => p.label.startsWith('Bust / chest'))!;
    expect(chest.values[0]!).toBeLessThan(chest.values[1]!);
    expect(chest.values[1]!).toBeLessThan(chest.values[2]!);
    const height = graded.body.find((b) => b.label === 'Height');
    expect(height?.values).toEqual([1160, 1280, 1400]);
    expect(graded.pom.map((p) => p.label)).toContain('Hem width (all round)');
    // ADR-060: cutting layout drives the yardage; sewing order comes from the parts.
    expect(doc.patterns.markers[0]).toMatchObject({ fabricRole: 'main', fabricWidthMm: 1500 });
    expect(doc.patterns.markers[0]!.lengthMm).toBeGreaterThan(400);
    expect(doc.bom.find((b) => b.item === 'Main fabric')?.notes).toMatch(/cutting layout/);
    expect(doc.construction.steps.map((s) => s.title)).toContain('Set in sleeves');
    expect(doc.patterns.pieces.some((p) => p.allowanceNotes.some((n) => /hem 30 mm/.test(n)))).toBe(
      true,
    );
    expect(html).toContain('Cutting layout — main');
  });

  it('reads a shirt and shorts as a set with every bottom detail (sample 01)', async () => {
    const r = await readSketch(
      { images: [png], garmentHint: 'shirt and shorts set' },
      { provider: new FakeProvider(fakeResponders) },
    );
    expect(r.classification.garments.map((g) => g.type)).toEqual(['shirt', 'shorts']);
    expect(r.spec).toMatchObject({
      family: 'top',
      audience: 'boys',
      size: '8y',
      style: { topType: 'shirt', collar: 'shirt', placket: 'separate', sleeve: 'short' },
      garments: [
        {
          key: 'shorts',
          family: 'trousers',
          style: {
            length: 'above_knee',
            waistband: true,
            waistbandType: 'fitted',
            beltLoops: 6,
            closure: 'fly_zip',
            pockets: 'slant',
            backPockets: 'patch',
          },
        },
      ],
    });
    expect(r.unsure['shorts']).toContain('backPockets');
    const state = patternDesignState(draftPattern(r.spec), { createdFrom: 'ai' });
    const names = state.patternPieces!.map((p) => p.name);
    for (const n of [
      'Collar stand',
      'Button placket',
      'Waistband',
      'Belt loop strip',
      'Fly facing',
      'Side front (pocket facing)',
      'Back patch pocket',
    ])
      expect(names).toContain(n);
    expect(names).not.toContain('Skirt front');
    expect(validateDesignState(state).findings.filter((f) => f.outcome === 'error')).toEqual([]);
  });

  it('is tolerant: unknown values become null, odd combinations are fixed', () => {
    const c = sketchClassificationSchema.parse({
      gender: 'Man',
      ageGroup: 'grown-up',
      garments: [{ type: 'Shirt', section: 'top' }],
      label: 'Shirt',
    });
    const d = sketchDetailsSchema.parse({
      garments: [
        {
          index: 0,
          style: {
            collar: 'shirt',
            closure: 'back zip',
            sleeve: 'LONG',
            neckline: 'sweetheart',
            beltLoops: 'many',
          },
        },
      ],
    });
    expect(d.garments[0]!.style.neckline).toBeNull();
    const { spec, notes } = specFromSketch(c, d, { audience: null, size: null });
    expect(spec).toMatchObject({
      family: 'top',
      audience: 'men',
      size: 'L',
      style: { closure: 'front_buttons', sleeve: 'long' },
    });
    expect(notes.join(' ')).toMatch(/front opening/);
  });

  it('maps garment words and ages: half pants → shorts, a 6-year-old girl → girls 6y', () => {
    const c = sketchClassificationSchema.parse({
      gender: 'girl',
      ageGroup: 'child',
      ageYears: 6.4,
      garments: [{ type: 'half pants', section: 'lower', label: 'Half pants' }],
      label: 'Shorts',
    });
    expect(c.garments[0]!.type).toBe('shorts');
    const { spec } = specFromSketch(c, sketchDetailsSchema.parse({}), {
      audience: null,
      size: null,
    });
    expect(spec).toMatchObject({
      family: 'trousers',
      audience: 'girls',
      size: '6y',
      style: { length: 'above_knee' },
    });
  });
});
