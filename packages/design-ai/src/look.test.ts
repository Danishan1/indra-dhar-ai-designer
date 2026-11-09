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
    expect(list).toContain('EDITED by the designer');
    expect(list).toMatch(/seams: [a-z ]+ \d+\.\d/);
  });

  it('on a model: a real person wearing the outfit, from the chosen view', () => {
    const s = shorts();
    const front = lookPrompt('front', {
      state: s,
      style: 'model',
      reference: null,
    });
    expect(front).toContain('PATTERN SHEET');
    expect(front).toContain('FRONT view');
    expect(front).toContain('worn by a boy model aged about 8');
    expect(front).toMatch(/real person \(not a mannequin or dress form\)/);
    // Only the patterns: no sketch, no photo, no colour from anywhere else.
    expect(front).toContain('The patterns are the only source');
    expect(front).not.toMatch(/designer's original sketch|mood/);
    expect(front).toContain('neutral off-white');
    expect(front).toMatch(/Finished measurements: .*\d+\.\d cm/);
    expect(front).toContain('How the pieces are sewn together:');
    expect(front).toContain(
      `their changed shape must be visible in the garment: ${s.patternPieces[0]!.name}`,
    );
    expect(front).not.toContain('Reference image 2');
    const left = lookPrompt('left', {
      state: s,
      style: 'model',
      reference: 'front',
    });
    expect(left).toContain('LEFT SIDE view');
    expect(left).toContain('Reference image 2 is the FRONT view');
    expect(left).not.toContain('Reference image 3');
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
      garment: { name: 'Shorts', pieces: shortsPieces, ofSet: true },
    });
    expect(back).toContain('Draw the shorts made by cutting and sewing these pattern pieces');
    expect(back).toContain('draw ONLY the shorts — no other garment');
    expect(back).toContain('technical flat');
    expect(back).toContain('BLACK LINES ONLY: no colour');
    expect(back).toContain('Shorts for boys, size 8y (one garment of a set of shirt and shorts)');
    expect(back).not.toContain('Collar');
    expect(back).toContain('NO person, NO model, NO mannequin');
    expect(back).toContain('BACK view');
    expect(back).toContain(
      'Reference image 2 is the FRONT view already drawn from these same patterns',
    );
    expect(back).not.toContain('worn by');
    // Only the shorts' pieces are listed.
    for (const p of shirtPieces) expect(back).not.toContain(`- ${p.name}:`);
  });
});
