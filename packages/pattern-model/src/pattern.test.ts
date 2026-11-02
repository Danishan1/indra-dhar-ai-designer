import {
  outlineBounds,
  patternPieceSchema,
  sequentialRandomBytes,
  templates,
  userValue,
} from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import {
  draftAllPieces,
  draftComponentPieces,
  outdatedPieces,
  pieceFromNormalizedOutline,
} from './draft.js';
import { offsetOutline, patternSheetSvg } from './svg.js';

const shirt = () => templates.create('woven_shirt', { randomBytes: sequentialRandomBytes() });
const by = { confirmedBy: 'u1', confirmedAt: '2026-11-02T10:00:00.000Z' };

describe('pattern drafting (ADR-056)', () => {
  it('drafts provisional pieces for every flat component of a shirt', () => {
    const s = shirt();
    const pieces = draftAllPieces(s, { randomBytes: sequentialRandomBytes() });
    for (const p of pieces) expect(patternPieceSchema.parse(p)).toEqual(p);
    const templatesUsed = pieces.map((p) => p.draft?.template).sort();
    expect(templatesUsed).toEqual(
      [
        'bodice_back',
        'bodice_front',
        'collar',
        'cuff',
        'cuff',
        'patch_pocket',
        'placket',
        'sleeve',
        'sleeve',
      ].sort(),
    );
    expect(pieces.every((p) => p.status === 'provisional' && p.source === 'generated')).toBe(true);
    // Body panels are cut on the fold; sleeves are mirrored pairs.
    const front = pieces.find((p) => p.draft?.template === 'bodice_front')!;
    expect(front.foldLine).not.toBeNull();
    const sl = pieces.find((p) => p.draft?.template === 'sleeve')!;
    expect(sl).toMatchObject({ cutQuantity: 2, mirrored: true });
  });

  it('uses the design measurements and notes defaults', () => {
    const s = shirt();
    const sleeve = s.components.find((c) => c.componentType === 'sleeve' && c.side === 'left')!;
    const [a] = draftComponentPieces(s, sleeve);
    expect(a!.notes.join(' ')).toMatch(/Defaults used for: .*sleeve length/);
    sleeve.properties['dimension.sleeve_length'] = userValue(500, by, 'mm');
    const [b] = draftComponentPieces(s, sleeve);
    expect(b!.draft?.inputs['sleeve_length']).toBe(500);
    expect(outlineBounds(b!.outline).height).toBeLessThan(outlineBounds(a!.outline).height);
  });

  it('detects pieces that are out of date and keeps ids when redrafting', () => {
    const s = shirt();
    s.patternPieces = draftAllPieces(s, { randomBytes: sequentialRandomBytes() });
    expect(outdatedPieces(s)).toEqual([]);
    const cuff = s.components.find((c) => c.componentType === 'cuff')!;
    cuff.properties['dimension.cuff_width'] = userValue(90, by, 'mm');
    const stale = outdatedPieces(s);
    expect(stale.map((p) => p.componentId)).toEqual([cuff.componentId]);
    const [redrafted] = draftComponentPieces(s, cuff, { previous: s.patternPieces });
    expect(redrafted!.pieceId).toBe(stale[0]!.pieceId);
  });

  it('sleeveless sleeves and "none" options have no piece; other families draft too', () => {
    const s = shirt();
    const sleeve = s.components.find((c) => c.componentType === 'sleeve')!;
    sleeve.properties['construction.sleeve_type'] = userValue('sleeveless', by);
    expect(draftComponentPieces(s, sleeve)).toEqual([]);
    for (const key of ['dress', 'skirt', 'trousers', 'jacket', 'hoodie']) {
      const pieces = draftAllPieces(templates.create(key));
      expect(pieces.length).toBeGreaterThan(1);
    }
  });

  it('scales normalized outlines and renders sheets', () => {
    const piece = pieceFromNormalizedOutline({
      componentId: 'cmp_000000000001',
      name: 'Bow',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      widthMm: 200,
      heightMm: 80,
      source: 'inferred',
      method: 'ai_outline',
      randomBytes: sequentialRandomBytes(),
    });
    expect(outlineBounds(piece.outline)).toEqual({ x: 0, y: 0, width: 200, height: 80 });
    const cut = outlineBounds(offsetOutline(piece.outline, 10));
    expect(cut.width).toBeCloseTo(220, 0);
    const svg = patternSheetSvg(draftAllPieces(shirt()), { title: 'Shirt' });
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('Cut 2 (pair)');
  });
});
