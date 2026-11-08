import { FakeProvider } from '@ai-designer/ai';
import { validateDesignState } from '@ai-designer/garment-model';
import { draftPattern, patternDesignState, seamChecks } from '@ai-designer/pattern-model';
import { describe, expect, it } from 'vitest';

import { fakeResponders } from './fake-responders.js';
import { readSketch, sketchReadingSchema, specFromReading } from './sketch.js';
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
    expect(r.fromSketch).toContain('collar');
    expect(r.unsure).toEqual(['closure']);
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
    expect(html).toContain('Pattern specification');
    expect(html).toContain('Seam fit checks');
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

  it('is tolerant: unknown values become null, odd combinations are fixed', () => {
    const reading = sketchReadingSchema.parse({
      family: 'Shirt',
      label: 'Shirt',
      audience: 'Man',
      style: { collar: 'shirt', closure: 'back zip', sleeve: 'LONG', neckline: 'sweetheart' },
    });
    expect(reading.style.neckline).toBeNull();
    const { spec, notes } = specFromReading(reading, { audience: null, size: null });
    expect(spec).toMatchObject({
      family: 'top',
      audience: 'men',
      size: 'L',
      style: { closure: 'front_buttons', sleeve: 'long' },
    });
    expect(notes.join(' ')).toMatch(/front opening/);
  });
});
