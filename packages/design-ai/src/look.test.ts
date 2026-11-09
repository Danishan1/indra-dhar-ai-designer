import { patternSpecSchema } from '@ai-designer/garment-model';
import {
  designGarments,
  draftPattern,
  patternDesignState,
  piecesOfGarment,
} from '@ai-designer/pattern-model';
import { describe, expect, it } from 'vitest';

import { lookPieceList, lookPrompt } from './look.js';

const shorts = () => {
  const s = patternDesignState(
    draftPattern(
      patternSpecSchema.parse({
        family: 'trousers',
        audience: 'boys',
        size: '8y',
        style: { length: 'shorts' },
      }),
    ),
    { createdFrom: 'ai' },
  );
  const pieces = s.patternPieces!.map((p, i) => (i === 0 ? { ...p, source: 'user' as const } : p));
  return { ...s, patternPieces: pieces };
};

const coord = () =>
  patternDesignState(
    draftPattern(
      patternSpecSchema.parse({
        family: 'top',
        audience: 'boys',
        size: '8y',
        style: { topType: 'shirt' },
        garments: [{ key: 'shorts', family: 'trousers', style: { length: 'shorts' } }],
      }),
    ),
    { createdFrom: 'ai' },
  );

describe('look preview prompt (ADR-064)', () => {
  it('lists every piece with its size and marks the edited ones', () => {
    const s = shorts();
    const list = lookPieceList(s);
    expect(list.split('\n')).toHaveLength(s.patternPieces.length);
    expect(list).toMatch(/× \d+\.\d cm, cut \d/);
    expect(list).toContain(`${s.patternPieces[0]!.name}:`);
    expect(list).toContain('(edited by the designer)');
  });

  it('on a model: a real person wearing the outfit, from the chosen view', () => {
    const s = shorts();
    const front = lookPrompt('front', {
      state: s,
      style: 'model',
      reference: null,
      hasSketch: true,
    });
    expect(front).toContain('PATTERN SHEET');
    expect(front).toContain('FRONT view');
    expect(front).toContain('worn by a boy model aged about 8');
    expect(front).toMatch(/real person \(not a mannequin or dress form\)/);
    expect(front).toContain('Reference image 2 is the designer');
    expect(front).toContain(
      `their changed shape must be visible in the garment: ${s.patternPieces[0]!.name}`,
    );
    const left = lookPrompt('left', {
      state: s,
      style: 'model',
      reference: 'front',
      hasSketch: true,
    });
    expect(left).toContain('LEFT SIDE view');
    expect(left).toContain('Reference image 2 is the FRONT view');
    expect(left).toContain('Reference image 3 is the designer');
  });

  it('line sketch: each garment of a set on its own, no person or dummy', () => {
    const s = coord();
    const garments = designGarments(s.patternSpec!);
    expect(garments.map((g) => g.name)).toEqual(['Shirt', 'Shorts']);
    const shortsPieces = piecesOfGarment(s.patternPieces!, garments, 'shorts');
    const shirtPieces = piecesOfGarment(s.patternPieces!, garments, 'main');
    expect(shortsPieces.length).toBeGreaterThan(0);
    expect(shirtPieces.length + shortsPieces.length).toBe(s.patternPieces!.length);
    const back = lookPrompt('back', {
      state: s,
      style: 'sketch',
      reference: 'front',
      hasSketch: false,
      garment: { name: 'Shorts', pieces: shortsPieces, ofSet: true },
    });
    expect(back).toContain('Draw the shorts sewn from its patterns');
    expect(back).toContain('draw ONLY the shorts — no other garment');
    expect(back).toContain('technical flat');
    expect(back).toContain('NO person, NO model, NO mannequin');
    expect(back).toContain('BACK view');
    expect(back).toContain(
      'Reference image 2 is the FRONT view already drawn of this exact garment',
    );
    expect(back).not.toContain('worn by');
    // Only the shorts' pieces are listed.
    for (const p of shirtPieces) expect(back).not.toContain(`- ${p.name}:`);
  });
});
