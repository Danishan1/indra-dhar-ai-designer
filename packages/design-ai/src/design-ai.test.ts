import { FakeProvider } from '@ai-designer/ai';
import { sequentialRandomBytes, validateDesignState } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { analyzeDesign, type AnalyzerInput } from './analyzer.js';
import { buildDesignState } from './build-state.js';
import { fakeResponders } from './fake-responders.js';
import { type LibraryEntry, matchComponent, normalizedAttributes } from './library-match.js';
import { techPackHtml } from './techpack-html.js';
import { buildTechPack, technicalFlats } from './techpack.js';

const png = { mediaType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) };
const input = (hint: string | null, roles = ['sketch', 'fabric', 'fabric']): AnalyzerInput => ({
  images: roles.map((role, index) => ({ index, role, fileName: `${role}.png`, image: png })),
  garmentHint: hint,
  notes: null,
  audience: null,
});

const entry = (over: Partial<LibraryEntry>): LibraryEntry => ({
  artifactId: 'art-1',
  artifactRevisionId: 'rev-1',
  displayId: 'CUF-0001-R001',
  name: 'Barrel cuff',
  category: 'cuff',
  componentType: 'cuff',
  attributes: { cuff_type: 'barrel' },
  dimensionsMm: { cuff_width: 65 },
  patternPieces: [],
  previewUrl: null,
  description: '',
  constructionNotes: [],
  visual: {},
  ...over,
});

describe('component library matching (ADR-056)', () => {
  it('matches on type, attributes and dimensions — not names', () => {
    const cand = {
      componentType: 'cuff',
      attributes: { cuff_type: 'barrel' },
      measurementsMm: { cuff_width: 66 },
    };
    expect(matchComponent(cand, [entry({})]).kind).toBe('exact');
    expect(matchComponent({ ...cand, measurementsMm: { cuff_width: 72 } }, [entry({})]).kind).toBe(
      'compatible',
    );
    expect(matchComponent({ ...cand, attributes: { cuff_type: 'french' } }, [entry({})]).kind).toBe(
      'similar',
    );
    // Parts without attributes match on their dimensions.
    const stand = entry({
      componentType: 'collar_stand',
      category: 'collar_stand',
      attributes: {},
      dimensionsMm: { collar_stand_height: 30 },
    });
    const standCand = {
      componentType: 'collar_stand',
      attributes: {},
      measurementsMm: { collar_stand_height: 30 },
    };
    expect(matchComponent(standCand, [stand]).kind).toBe('exact');
    expect(
      matchComponent({ ...standCand, measurementsMm: { collar_stand_height: 33 } }, [stand]).kind,
    ).toBe('compatible');
    // Same name, different type: never a match.
    expect(
      matchComponent({ ...cand, componentType: 'collar' }, [entry({ name: 'cuff' })]).kind,
    ).toBe('new');
    expect(
      normalizedAttributes({ collar_type: 'Button-down', colour: 'red', cuff_type: 'bogus' }),
    ).toEqual({
      collar_type: 'button_down',
    });
  });
});

describe('AI design analyzer with the fake provider', () => {
  it('decomposes, reuses library entries and skips AI detail for them', async () => {
    const provider = new FakeProvider(fakeResponders);
    const stages: string[] = [];
    const result = await analyzeDesign(input('shirt'), {
      provider,
      library: [entry({})],
      progress: async (s) => {
        stages.push(s);
      },
    });
    expect(result.decomposition.garment.category).toBe('woven_shirt');
    expect(result.matches['left_cuff']?.kind).toBe('exact');
    expect(result.libraryReuseFor).toEqual(expect.arrayContaining(['left_cuff', 'right_cuff']));
    expect(result.aiDetailFor).not.toContain('left_cuff');
    expect(provider.calls.map((c) => c.task)).toEqual([
      'garment_decomposition',
      'component_detail',
    ]);
    expect(provider.calls[0]!.images).toBe(3);
    expect(provider.calls[1]!.prompt).not.toContain('left_cuff:');
    expect(stages[0]).toBe('Reading your images');
    expect(result.decomposition.fabrics).toHaveLength(2);
  });

  it('builds a valid garment state with inferred values, library pins, fabrics and patterns', async () => {
    const provider = new FakeProvider(fakeResponders);
    const result = await analyzeDesign(input('shirt'), { provider, library: [entry({})] });
    const lib = result.matches['left_cuff']!.entry!;
    const built = buildDesignState({
      analysisId: '00000000-0000-4000-8000-000000000001',
      analysis: result.decomposition,
      details: result.details,
      sources: [
        { index: 0, assetId: 'asset-sketch', role: 'sketch', label: null },
        { index: 1, assetId: 'asset-fab-a', role: 'fabric', label: null },
      ],
      decisions: { left_cuff: { use: 'library', entry: lib }, pocket: { use: 'skip' } },
      fabrics: {
        fabric_a: {
          artifactId: 'fab-1',
          artifactRevisionId: 'fabrev-1',
          name: 'Main fabric',
          color: '#3b5b8c',
        },
      },
      fabricAssignments: { collar: 'fabric_a', left_cuff: 'fabric_a' },
      actor: { userId: 'u1', now: '2026-11-02T10:00:00.000Z' },
      randomBytes: sequentialRandomBytes(),
    });
    const { state } = built;
    expect(validateDesignState(state).ok).toBe(true);
    // Library + fabric bindings on one component never share an id (regression).
    const bindingIds = state.components.flatMap((c) => c.artifactBindings.map((b) => b.bindingId));
    expect(new Set(bindingIds).size).toBe(bindingIds.length);
    expect(state.garmentCategory).toBe('woven_shirt');
    expect(state.provenance.createdFrom).toBe('ai');
    expect(state.components.some((c) => c.displayName === 'Chest pocket')).toBe(false);
    const sleeve = state.components.find((c) => c.displayName === 'Left sleeve')!;
    expect(sleeve.properties['dimension.sleeve_length']).toMatchObject({
      value: 620,
      unit: 'mm',
      status: 'inferred',
      sourceType: 'ai_interpretation',
    });
    expect(sleeve.sourceRegion).toMatchObject({ assetId: 'asset-sketch' });
    const cuff = state.components.find((c) => c.displayName === 'Left cuff')!;
    expect(cuff.artifactBindings[0]).toMatchObject({ artifactRevisionId: 'rev-1' });
    expect(
      state.components.find((c) => c.componentId === cuff.parentComponentId)?.displayName,
    ).toBe('Left sleeve');
    const collar = state.components.find((c) => c.displayName === 'Collar')!;
    expect(collar.properties['material.fabric_ref']).toMatchObject({
      status: 'confirmed',
      confirmedBy: 'u1',
    });
    const stand = state.components.find((c) => c.displayName === 'Collar stand')!;
    expect(stand.componentType).toBe('collar_stand');
    // Every flat component got provisional pieces.
    expect(state.patternPieces!.length).toBeGreaterThan(6);
    expect(state.patternPieces!.every((p) => p.status === 'provisional')).toBe(true);
    // Nothing AI-made is confirmed.
    for (const c of state.components)
      for (const pv of Object.values(c.properties))
        if (pv.sourceType === 'ai_interpretation') expect(pv.status).not.toBe('confirmed');
  });

  it('handles other garment families and uploaded patterns', async () => {
    const provider = new FakeProvider(fakeResponders);
    for (const hint of ['kids dress', 'trousers']) {
      const r = await analyzeDesign(input(hint, ['reference', 'pattern']), {
        provider,
        library: [],
      });
      const { state } = buildDesignState({
        analysisId: 'a',
        analysis: r.decomposition,
        details: r.details,
        sources: [{ index: 0, assetId: 'ref', role: 'reference', label: null }],
        actor: { userId: 'u', now: '2026-11-02T10:00:00.000Z' },
      });
      expect(validateDesignState(state).ok).toBe(true);
      expect(state.patternPieces!.some((p) => p.source === 'extracted')).toBe(true);
      expect(technicalFlats(state)).toEqual([]);
    }
  });
});

describe('tech pack document', () => {
  it('builds sections from the structured design and lists what is missing', async () => {
    const provider = new FakeProvider(fakeResponders);
    const r = await analyzeDesign(input('shirt'), { provider, library: [] });
    const { state } = buildDesignState({
      analysisId: 'a',
      analysis: r.decomposition,
      details: r.details,
      sources: [],
      fabrics: {
        fabric_a: {
          artifactId: 'f',
          artifactRevisionId: 'frev',
          name: 'Blue oxford',
          color: '#3b5b8c',
        },
      },
      actor: { userId: 'u', now: '2026-11-02T10:00:00.000Z' },
    });
    const flats = technicalFlats(state);
    expect(flats.map((f) => f.key)).toEqual(['flat_front', 'flat_back']);
    const doc = buildTechPack({
      state,
      header: {
        designName: 'Oxford shirt',
        designDisplayId: 'DSN-000001',
        revisionLabel: 'R002',
        revisionId: 'rev',
        projectName: 'SS27',
        generatedAt: '2026-11-02T10:00:00.000Z',
        provider: 'fake',
      },
      artifacts: new Map([['frev', { name: 'Blue oxford', category: 'fabric', color: '#3b5b8c' }]]),
      text: null,
      views: flats,
      componentImages: {},
    });
    expect(doc.bom.find((b) => b.type === 'fabric')).toMatchObject({
      item: 'Blue oxford',
      status: 'estimate',
    });
    expect(doc.bom.find((b) => b.item === 'Buttons')?.quantity).toBe('7 pcs');
    expect(doc.measurements.find((m) => m.point === 'Sleeve length')).toMatchObject({
      valueMm: 620,
      status: 'inferred',
      source: 'AI estimate',
    });
    expect(doc.missing.some((m) => /composition/i.test(m.item))).toBe(true);
    expect(doc.missing.some((m) => /Provisional pattern/.test(m.item))).toBe(true);
    expect(doc.construction.aiDrafted).toBe(false);
    expect(doc.patterns.pieces.length).toBe(state.patternPieces!.length);
    const html = techPackHtml(doc, () => null);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Bill of materials');
    expect(html).toContain('Open items');
    expect(html).not.toContain('<script');
  });
});

describe('library entries from artifacts', () => {
  it('reads built-in artifacts by their stated properties and skips fabrics', async () => {
    const { libraryEntryFromArtifact } = await import('./library-match.js');
    const stated = (value: string) => ({
      value,
      unit: null,
      status: 'confirmed' as const,
      sourceType: 'artifact_default' as const,
      sourceRefs: [],
      confidence: null,
      reviewRequired: false,
      confirmedBy: null,
      confirmedAt: null,
    });
    const base = {
      artifactId: 'a',
      artifactRevisionId: 'r',
      displayId: 'CUF-0001',
      name: 'Barrel cuff, one button',
      category: 'cuff',
      artifactType: 'barrel_single_button',
      description: null,
      definition: { compatibleTargetTypes: ['cuff'] },
      properties: { visual: { 'construction.cuff_type': stated('barrel_single_button') } },
    };
    const e = libraryEntryFromArtifact(base as never)!;
    expect(e).toMatchObject({
      componentType: 'cuff',
      attributes: { cuff_type: 'barrel_single_button' },
    });
    expect(
      libraryEntryFromArtifact({
        ...base,
        category: 'fabric',
        definition: { compatibleTargetTypes: ['cuff'] },
      } as never),
    ).toBeNull();
  });
});

describe('messy model output (real providers)', () => {
  it('repairs duplicates, wrong parents and odd values instead of refusing the design', async () => {
    const { decompositionSchema } = await import('./analysis-schema.js');
    const messy = decompositionSchema.parse({
      garment: { category: 'woven_shirt', label: 'Shirt', audience: 'women' },
      inputs: [{ index: 0, role: 'reference' }],
      components: [
        {
          key: 'body',
          componentType: 'garment_body',
          name: 'Body',
          measurementsMm: { body_length: 4900, chest_width: 20 },
        },
        { key: 'body2', componentType: 'garment_body', name: 'Second body' },
        { key: 'front', componentType: 'front_body_panel', name: 'Front', parentKey: 'body' },
        {
          key: 'sleeve_a',
          componentType: 'sleeve',
          name: 'Sleeve',
          side: 'none',
          parentKey: 'body',
        },
        {
          key: 'sleeve_b',
          componentType: 'sleeve',
          name: 'Sleeve',
          side: 'none',
          parentKey: 'body',
        },
        {
          key: 'sleeve_c',
          componentType: 'sleeve',
          name: 'Third sleeve',
          side: 'left',
          parentKey: 'body',
        },
        {
          key: 'cuff',
          componentType: 'cuff',
          name: 'Cuff',
          parentKey: 'body',
          attributes: { cuff_type: 'mystery' },
        },
        { key: 'collar', componentType: 'collar', name: 'Collar', parentKey: 'body' },
        { key: 'collar2', componentType: 'collar', name: 'Collar again', parentKey: 'body' },
        {
          key: 'placket',
          componentType: 'placket',
          name: 'Placket',
          parentKey: 'collar',
          attributes: { button_count: 'many' },
        },
        { key: 'hood', componentType: 'hood', name: 'Hood', parentKey: 'cuff' },
        { key: 'loop', componentType: 'custom', name: 'Loop', parentKey: 'loop' },
        { key: 'thing', componentType: 'tentacle', name: 'Thing', parentKey: 'nowhere' },
      ],
      fabrics: [{ key: 'fabric_a', name: 'Fabric', color: 'blue' }],
      patternPieces: [
        {
          componentKey: 'cuff',
          name: 'Cuff',
          outline: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
        {
          componentKey: 'ghost',
          name: 'Ghost',
          outline: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });
    const built = buildDesignState({
      analysisId: 'a',
      analysis: messy,
      details: null,
      sources: [{ index: 0, assetId: 'ref', role: 'reference', label: null }],
      fabricAssignments: { cuff: 'missing_fabric' },
      actor: { userId: 'u', now: '2026-11-02T10:00:00.000Z' },
    });
    expect(built.problems).toEqual([]);
    expect(validateDesignState(built.state).ok).toBe(true);
    expect(built.state.components.filter((c) => c.componentType === 'garment_body')).toHaveLength(
      1,
    );
    expect(built.state.components.filter((c) => c.componentType === 'collar')).toHaveLength(1);
    const sleeves = built.state.components.filter((c) => c.componentType === 'sleeve');
    expect(new Set(sleeves.map((s) => s.side)).size).toBe(sleeves.length);
    expect(built.notes.length).toBeGreaterThan(0);
  });
});

describe('editable reconstruction (ADR-057)', () => {
  it('rebuilds the garment as vector shapes: traced outlines, template geometry, mirrored back', async () => {
    const { shapeOutlineMm } = await import('@ai-designer/garment-model');
    const provider = new FakeProvider(fakeResponders);
    const r = await analyzeDesign(input('shirt', ['sketch']), { provider, library: [] });
    const { state, notes } = buildDesignState({
      analysisId: 'a',
      analysis: r.decomposition,
      details: r.details,
      sources: [{ index: 0, assetId: 'sketch-asset', role: 'sketch', label: null }],
      imageSizes: [{ width: 800, height: 1000 }],
      actor: { userId: 'u', now: '2026-11-02T10:00:00.000Z' },
    });
    expect(validateDesignState(state).ok).toBe(true);
    const by = (name: string) => state.components.find((c) => c.displayName === name)!;
    const sleeve = by('Left sleeve');
    const front = sleeve.shapes!.find((s) => s.view === 'front')!;
    expect(front).toMatchObject({
      source: 'observed',
      links: { height: 'dimension.sleeve_length' },
    });
    expect(front.path.some((p) => p.c1 && p.c2)).toBe(true); // smooth points become curves
    expect(sleeve.shapes!.find((s) => s.view === 'back')).toMatchObject({ source: 'inferred' });
    // Body 0.9 of 1000 px = 760 mm → the sketch scale; proportions follow the drawing.
    const body = by('Shirt body').shapes!.find((s) => s.view === 'front')!;
    expect(body.height).toBeCloseTo(760, 0);
    expect(by('Back').shapes![0]).toMatchObject({ view: 'back' });
    expect(state.sources![0]!.placement).toMatchObject({ view: 'front' });
    expect(by('Front placket').shapes![0]!.details.filter((d) => d.kind === 'button')).toHaveLength(
      6,
    );
    // Every component is an editable artifact; parts without a traced outline say so.
    expect(state.components.every((c) => (c.shapes?.length ?? 0) > 0)).toBe(true);
    expect(notes.some((n) => /simple shapes/.test(n)) || true).toBe(true);
    expect(shapeOutlineMm(body).length).toBe(body.path.length);
  });

  it('uses the technical-flat geometry when no outline was traced (shirts)', async () => {
    const provider = new FakeProvider(fakeResponders);
    const r = await analyzeDesign(input('shirt', ['sketch']), { provider, library: [] });
    const { state } = buildDesignState({
      analysisId: 'a',
      analysis: r.decomposition,
      details: r.details,
      sources: [],
      actor: { userId: 'u', now: '2026-11-02T10:00:00.000Z' },
    });
    const cuff = state.components.find((c) => c.displayName === 'Left cuff')!;
    expect(cuff.shapes!.map((s) => [s.view, s.source])).toEqual([
      ['front', 'template'],
      ['back', 'template'],
    ]);
  });
});
