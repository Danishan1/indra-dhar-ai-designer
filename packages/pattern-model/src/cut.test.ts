import { outlineBounds } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { draftPattern } from './blocks/draft-pattern.js';
import { patternDesignState } from './blocks/state.js';
import { cutBounds, cutOutline, edgeAllowance, edgeOnFold } from './cut.js';

const state = (spec: Parameters<typeof draftPattern>[0]) =>
  patternDesignState(draftPattern(spec), { createdFrom: 'ai' });

describe('cutOutline (per-edge allowance, ADR-060)', () => {
  it('gives fold edges no allowance and the hem its own', () => {
    const s = state({ family: 'skirt', audience: 'women', size: 'M', hemAllowanceMm: 40 });
    const front = s.patternPieces!.find((p) => p.name.toLowerCase().includes('front'))!;
    expect(edgeOnFold(front, 'cf')).toBe(true);
    expect(edgeAllowance(front, 'cf')).toBe(0);
    expect(edgeAllowance(front, 'hem')).toBe(40);
    expect(edgeAllowance(front, 'side')).toBe(10);
    const o = outlineBounds(front.outline);
    const c = cutBounds(front);
    // CF on the fold sits at x = min; the cut line does not pass beyond it.
    const foldX = Math.min(front.foldLine!.from.x, front.foldLine!.to.x);
    expect(Math.min(...cutOutline(front).map((p) => p.x))).toBeGreaterThanOrEqual(foldX - 0.5);
    // Hem at the bottom: 40 mm deeper (± the flare).
    expect(c.y + c.height - (o.y + o.height)).toBeGreaterThan(38);
    expect(c.y + c.height - (o.y + o.height)).toBeLessThan(60);
  });

  it('keeps the seam allowance on a sleeve hem joined to a cuff', () => {
    const s = state({
      family: 'top',
      audience: 'men',
      size: 'M',
      style: { closure: 'front_buttons', cuff: 'shirt', collar: 'shirt', sleeve: 'long' },
    });
    const sleeve = s.patternPieces!.find((p) => p.draft?.template === 'sleeve')!;
    expect(edgeAllowance(sleeve, 'hem')).toBe(10);
    const front = s.patternPieces!.find((p) => p.draft?.template === 'front')!;
    expect(edgeAllowance(front, 'hem')).toBe(30);
  });

  it('lays pieces out without overlap, rows by part', () => {
    const s = state({ family: 'dress', audience: 'women', size: 'M' });
    const boxes = s.patternPieces!.map((p) => {
      const b = cutBounds(p);
      return { x: b.x + p.canvas!.x, y: b.y + p.canvas!.y, w: b.width, h: b.height };
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });

  it('falls back to the uniform allowance without edges', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const c = cutOutline({ outline: sq, seamAllowanceMm: 10, foldLine: null });
    const xs = c.map((p) => p.x);
    const ys = c.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-10);
    expect(Math.max(...xs)).toBeCloseTo(110);
    expect(Math.min(...ys)).toBeCloseTo(-10);
    expect(Math.max(...ys)).toBeCloseTo(60);
  });
});

describe('cutting marker and sewing order', () => {
  it('packs every cut piece inside the fabric width', async () => {
    const { buildMarkers } = await import('./marker.js');
    const s = state({
      family: 'top',
      audience: 'men',
      size: 'M',
      style: { closure: 'front_buttons', cuff: 'shirt', collar: 'shirt', sleeve: 'long' },
    });
    const markers = buildMarkers(s.patternPieces!);
    const main = markers[0]!;
    expect(main.fabricRole).toBe('main');
    const expected = s
      .patternPieces!.filter((p) => (p.fabricRole ?? 'main') === 'main')
      .reduce((n, p) => n + p.cutQuantity, 0);
    expect(main.pieceCount).toBe(expected);
    for (const p of main.placements)
      for (const poly of p.polygons)
        for (const q of poly) {
          expect(q.y).toBeGreaterThanOrEqual(-0.5);
          expect(q.y).toBeLessThanOrEqual(main.fabricWidthMm + 0.5);
          expect(q.x).toBeGreaterThanOrEqual(-0.5);
        }
    // Boxes do not overlap.
    const b = main.placements.map((p) => p.box);
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        const x = b[i]!;
        const y = b[j]!;
        expect(x.x < y.x + y.w && y.x < x.x + x.w && x.y < y.y + y.h && y.y < x.y + x.h).toBe(
          false,
        );
      }
    // A men's shirt needs roughly 1.3–2.4 m of 150 cm fabric.
    expect(main.lengthMm).toBeGreaterThan(1100);
    expect(main.lengthMm).toBeLessThan(2400);
    expect(main.efficiency).toBeGreaterThan(0.45);
  });

  it('orders construction from the parts', async () => {
    const { sewingOrder } = await import('./sewing-order.js');
    const s = state({
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { closure: 'back_zip' },
    });
    const steps = sewingOrder({
      patternSpec: s.patternSpec!,
      components: s.components,
      patternPieces: s.patternPieces!,
    });
    const titles = steps.map((x) => x.title);
    expect(titles.indexOf('Join shoulders')).toBeLessThan(titles.indexOf('Set in sleeves'));
    expect(titles.indexOf('Set in sleeves')).toBeLessThan(titles.indexOf('Sew side seams'));
    expect(titles).toContain('Join bodice and skirt');
    expect(titles).toContain('Insert zip');
    expect(titles.at(-2)).toBe('Hem');
  });
});
