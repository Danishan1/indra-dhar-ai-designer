import { patternSpecSchema } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { scalePieceFrom, spreadAtLines, pieceBounds } from '../cad/path.js';
import { packCanvas, cutBounds } from '../cut.js';

import { draftPattern } from './draft-pattern.js';
import { draftedDimension, measurementLevers, solveLever, suggestLevers } from './levers.js';
import { patternDesignState } from './state.js';

const shirt = patternSpecSchema.parse({
  family: 'top' as const,
  audience: 'men' as const,
  size: 'M',
  style: { topType: 'shirt' as const, collar: 'shirt' as const, closure: 'front_buttons' as const },
});

describe('editor tools (ADR-062)', () => {
  it('sizes a piece by the measurement that drives it and redrafts', () => {
    const w0 = draftedDimension(shirt, 'back', 'width')!;
    const levers = suggestLevers(shirt, 'back', 'width');
    expect(levers[0]!.lever.id).toMatch(/body:bust|ease:bust|body:across_back|body:hip/);
    const r = solveLever(shirt, levers[0]!.lever, 'back', 'width', w0 + 40)!;
    expect(Math.abs(r.achieved - (w0 + 40))).toBeLessThan(1);
    // The front follows (same measurement), so the side seams still match.
    const fw0 = draftedDimension(shirt, 'front', 'width')!;
    expect(draftedDimension(r.spec, 'front', 'width')!).toBeGreaterThan(fw0 + 20);
    const len = measurementLevers(shirt).find((l) => l.id === 'length:main')!;
    const h = solveLever(shirt, len, 'back', 'height', 800)!;
    expect(Math.abs(h.achieved - 800)).toBeLessThan(1);
  });

  it('scales around an anchor and spreads at several lines', () => {
    const s = patternDesignState(draftPattern(shirt), {});
    const back = s.patternPieces!.find((p) => p.draft?.template === 'back')!;
    const b = pieceBounds(back);
    const scaled = scalePieceFrom(back, 1.5, 1, { x: b.x, y: b.y });
    const b2 = pieceBounds(scaled);
    expect(b2.width).toBeCloseTo(b.width * 1.5, 0);
    expect(b2.x).toBeCloseTo(b.x, 0);
    const spread = spreadAtLines(
      back,
      [
        { point: { x: 0, y: b.y + b.height * 0.4 }, dir: { x: 1, y: 0 } },
        { point: { x: 0, y: b.y + b.height * 0.7 }, dir: { x: 1, y: 0 } },
      ],
      60,
    );
    expect(pieceBounds(spread).height).toBeCloseTo(b.height + 60, 0);
  });

  it('packs pieces within a fabric width without overlap', () => {
    const s = patternDesignState(
      draftPattern({ family: 'dress', audience: 'women', size: 'M' }),
      {},
    );
    const { positions, lengthMm } = packCanvas(s.patternPieces!, { widthMm: 1500 });
    const boxes = s.patternPieces!.map((p) => {
      const b = cutBounds(p);
      const o = positions.get(p.pieceId)!;
      return { x: b.x + o.x, y: b.y + o.y, w: b.width, h: b.height };
    });
    for (const a of boxes) expect(a.x + a.w).toBeLessThanOrEqual(1500 + 0.5);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const c = boxes[j]!;
        expect(
          a.x < c.x + c.w - 0.5 &&
            c.x < a.x + a.w - 0.5 &&
            a.y < c.y + c.h - 0.5 &&
            c.y < a.y + a.h - 0.5,
        ).toBe(false);
      }
    expect(lengthMm).toBeGreaterThan(500);
  });
});
