import { type PatternSpecInput, validateDesignState } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { seamChecks } from './checks.js';
import { draftPattern } from './draft-pattern.js';
import { edgeLength } from './geom.js';
import { lengthFor, resolve } from './resolve.js';
import { draftToState, patternDesignState, pieceDimensions, resizePiece } from './state.js';

const CASES: [string, PatternSpecInput][] = [
  [
    'fitted dress, puff sleeves, peter pan collar, gathered skirt',
    {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: {
        fit: 'fitted',
        sleeve: 'short',
        sleeveStyle: 'puff',
        collar: 'peter_pan',
        skirt: 'gathered',
        closure: 'back_zip',
        length: 'knee',
      },
    },
  ],
  [
    'A-line dress, sleeveless, v-neck',
    {
      family: 'dress',
      audience: 'women',
      size: 'S',
      style: {
        sleeve: 'none',
        neckline: 'v_neck',
        skirt: 'a_line',
        closure: 'back_zip',
        pockets: 'side_seam',
      },
    },
  ],
  [
    'circle skirt dress, long fitted sleeves',
    {
      family: 'dress',
      audience: 'women',
      size: 'L',
      style: {
        fit: 'fitted',
        sleeve: 'long',
        sleeveStyle: 'fitted',
        skirt: 'circle',
        length: 'midi',
        closure: 'back_zip',
      },
    },
  ],
  [
    'shift dress (no waist seam)',
    {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { waistSeam: false, skirt: 'a_line', sleeve: 'three_quarter', neckline: 'boat' },
    },
  ],
  [
    'girls party dress',
    {
      family: 'dress',
      audience: 'girls',
      size: '6y',
      style: {
        darts: false,
        sleeve: 'short',
        sleeveStyle: 'puff',
        collar: 'peter_pan',
        skirt: 'gathered',
        closure: 'back_zip',
        length: 'knee',
      },
    },
  ],
  [
    'shirt dress with buttons',
    {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: {
        collar: 'shirt',
        closure: 'front_buttons',
        sleeve: 'long',
        cuff: 'shirt',
        skirt: 'a_line',
      },
    },
  ],
  [
    "men's shirt",
    {
      family: 'top',
      audience: 'men',
      size: 'L',
      style: {
        topType: 'shirt',
        collar: 'shirt',
        closure: 'front_buttons',
        yoke: true,
        sleeve: 'long',
        cuff: 'shirt',
        darts: false,
        pockets: 'patch',
      },
    },
  ],
  [
    'T-shirt',
    {
      family: 'top',
      audience: 'women',
      size: 'M',
      style: { topType: 'tshirt', neckline: 'crew', sleeve: 'short', darts: false },
    },
  ],
  [
    'blouse with bishop sleeves',
    {
      family: 'top',
      audience: 'women',
      size: 'M',
      style: {
        topType: 'blouse',
        sleeve: 'long',
        sleeveStyle: 'bishop',
        closure: 'back_zip',
        neckline: 'scoop',
      },
    },
  ],
  [
    'boys T-shirt',
    {
      family: 'top',
      audience: 'boys',
      size: '8y',
      style: { topType: 'tshirt', neckline: 'crew', sleeve: 'short', darts: false, fit: 'relaxed' },
    },
  ],
  [
    'pencil skirt',
    {
      family: 'skirt',
      audience: 'women',
      size: 'M',
      style: { skirt: 'pencil', length: 'knee', closure: 'back_zip' },
    },
  ],
  [
    'flared skirt',
    { family: 'skirt', audience: 'women', size: 'XL', style: { skirt: 'flared', length: 'midi' } },
  ],
  [
    'half circle skirt',
    {
      family: 'skirt',
      audience: 'girls',
      size: '10y',
      style: { skirt: 'half_circle', length: 'knee' },
    },
  ],
  [
    'straight trousers',
    {
      family: 'trousers',
      audience: 'women',
      size: 'M',
      style: { leg: 'straight', closure: 'fly_zip', pockets: 'side_seam' },
    },
  ],
  [
    "men's slim trousers",
    { family: 'trousers', audience: 'men', size: 'L', style: { leg: 'slim', closure: 'fly_zip' } },
  ],
  [
    'kids shorts',
    {
      family: 'trousers',
      audience: 'boys',
      size: '6y',
      style: { length: 'shorts', closure: 'none', leg: 'wide' },
    },
  ],
];

describe('pattern engine (ADR-058)', () => {
  for (const [name, spec] of CASES)
    it(`drafts ${name} that sews together`, () => {
      const d = draftPattern(spec);
      const pieces = d.parts
        .flatMap((p) => p.pieces)
        .map((p) => ({
          ...p,
          draft: { method: 'parametric' as const, template: p.template, inputs: {} },
        }));
      expect(pieces.length).toBeGreaterThan(1);
      for (const p of pieces) {
        expect(p.outline.length, p.name).toBeGreaterThanOrEqual(3);
        for (const q of p.outline)
          expect(Number.isFinite(q.x) && Number.isFinite(q.y), p.name).toBe(true);
        const dims = pieceDimensions(p);
        expect(dims.width, p.name).toBeGreaterThan(10);
        expect(dims.height, p.name).toBeGreaterThan(10);
      }
      const checks = seamChecks(pieces, d.spec);
      expect(checks.length).toBeGreaterThan(0);
      const bad = checks.filter((c) => c.status !== 'ok');
      expect(bad, JSON.stringify(bad, null, 1)).toEqual([]);
      const state = patternDesignState(d, {});
      const v = validateDesignState(state);
      const errors = v.findings.filter((f) => f.outcome === 'error');
      expect(errors, JSON.stringify(errors)).toEqual([]);
    });

  it('uses the measurements: widths, lengths and the size change follow the body', () => {
    const spec: PatternSpecInput = {
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { fit: 'regular', skirt: 'straight', closure: 'back_zip' },
    };
    const d = draftPattern(spec);
    const ctx = resolve(spec);
    const front = d.parts.find((p) => p.key === 'front')!.pieces[0]!;
    const w = pieceDimensions(front).width;
    expect(w).toBeCloseTo((920 + ctx.ease.bust) / 4 + 5, -1); // quarter bust + 5
    const skirt = d.parts.find((p) => p.key === 'skirt')!.pieces[0]!;
    const side = skirt.edges.find((e) => e.name === 'side')!;
    expect(edgeLength(skirt.outline, side)).toBeGreaterThan(lengthFor(ctx, 'skirt') - 15);
    const bigger = draftPattern({ ...spec, size: 'XL' });
    expect(
      pieceDimensions(bigger.parts.find((p) => p.key === 'front')!.pieces[0]!).width,
    ).toBeGreaterThan(w + 25);
    const custom = draftPattern({ ...spec, body: { bust: 1000 } });
    expect(
      pieceDimensions(custom.parts.find((p) => p.key === 'front')!.pieces[0]!).width,
    ).toBeCloseTo(w + 20, -1);
  });

  it('keeps ids on redraft and keeps pieces edited by hand', () => {
    const d = draftPattern({ family: 'skirt', audience: 'women', size: 'M' });
    const first = draftToState(null, d);
    const edited = first.patternPieces.map((p, i) =>
      i === 0 ? resizePiece(p, { width: 400 }) : p,
    );
    expect(pieceDimensions(edited[0]!).width).toBe(400);
    const again = draftToState(
      { components: first.components, patternPieces: edited },
      draftPattern({ family: 'skirt', audience: 'women', size: 'L' }),
    );
    expect(again.components.map((c) => c.componentId)).toEqual(
      first.components.map((c) => c.componentId),
    );
    expect(again.patternPieces.map((p) => p.pieceId)).toEqual(
      first.patternPieces.map((p) => p.pieceId),
    );
    expect(again.kept).toEqual([edited[0]!.name]);
    expect(again.patternPieces[0]!.source).toBe('user');
    expect(again.patternPieces[1]!.outline).not.toEqual(first.patternPieces[1]!.outline);
  });

  it('reports a sleeve that no longer fits its armhole', () => {
    const d = draftPattern({
      family: 'top',
      audience: 'women',
      size: 'M',
      style: { sleeve: 'short' },
    });
    const pieces = d.parts
      .flatMap((p) => p.pieces)
      .map((p) => ({
        ...p,
        draft: { method: 'parametric' as const, template: p.template, inputs: {} },
      }));
    const sleeve = pieces.find((p) => p.template === 'sleeve')!;
    const xs = sleeve.outline.map((p) => p.x);
    const wide = { ...sleeve, outline: sleeve.outline.map((p) => ({ x: p.x * 1.3, y: p.y })) };
    void xs;
    const checks = seamChecks(
      pieces.map((p) => (p === sleeve ? wide : p)),
      d.spec,
    );
    expect(checks.find((c) => c.id === 'cap')!.status).toBe('error');
  });
});

describe('moving a key point', () => {
  it('drags the shoulder point and the armhole and shoulder follow', async () => {
    const { keyPoints, moveKeyPoint } = await import('./state.js');
    const d = draftPattern({ family: 'top', audience: 'women', size: 'M' });
    const s = draftToState(null, d);
    const front = s.patternPieces.find((p) => p.draft?.template === 'front')!;
    const shoulder = front.edges!.find((e) => e.name === 'shoulder')!;
    expect(keyPoints(front)).toContain(shoulder.to);
    const moved = moveKeyPoint(front, shoulder.to, 10, 5);
    expect(moved.outline[shoulder.to]!.x).toBeCloseTo(front.outline[shoulder.to]!.x + 10, 0);
    const neck = front.edges!.find((e) => e.name === 'neck')!;
    expect(moved.outline[neck.from]).toEqual(front.outline[neck.from]);
    expect(moved.source).toBe('user');
  });
});
