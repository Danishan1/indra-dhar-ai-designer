import { patternSpecSchema } from '@ai-designer/garment-model';
import { draftPattern, patternDesignState } from '@ai-designer/pattern-model';
import { describe, expect, it } from 'vitest';

import { lookPieceList, lookPrompt } from './look.js';

const state = () => {
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

describe('look preview prompt (ADR-064)', () => {
  it('lists every piece with its size and marks the edited ones', () => {
    const s = state();
    const list = lookPieceList(s);
    expect(list.split('\n')).toHaveLength(s.patternPieces.length);
    expect(list).toMatch(/× \d+\.\d cm, cut \d/);
    expect(list).toContain(`${s.patternPieces[0]!.name}:`);
    expect(list).toContain('(edited by the designer)');
  });

  it('makes the patterns the source of the shape for each view', () => {
    const s = state();
    const front = lookPrompt('front', {
      state: s,
      style: 'sketch',
      hasFrontReference: false,
      hasSketch: true,
    });
    expect(front).toContain('PATTERN SHEET');
    expect(front).toContain('FRONT view');
    expect(front).toContain('Reference image 2 is the designer');
    expect(front).toContain(
      `edited these pieces by hand — their changed shape must be visible in the garment: ${s.patternPieces[0]!.name}`,
    );
    expect(front).toMatch(/fashion design sketch/);
    const left = lookPrompt('left', {
      state: s,
      style: 'realistic',
      hasFrontReference: true,
      hasSketch: true,
    });
    expect(left).toContain('LEFT SIDE view');
    expect(left).toContain('Reference image 2 is the FRONT view');
    expect(left).toContain('Reference image 3 is the designer');
    expect(left).toMatch(/realistic photograph/);
    expect(
      lookPrompt('back', { state: s, style: 'sketch', hasFrontReference: true, hasSketch: false }),
    ).not.toContain('original sketch');
  });
});
