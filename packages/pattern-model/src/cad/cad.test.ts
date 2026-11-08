import { describe, expect, it } from 'vitest';

import { seamChecks } from '../blocks/checks.js';
import { draftPattern } from '../blocks/draft-pattern.js';
import { edgeLength } from '../blocks/geom.js';
import { draftToState } from '../blocks/state.js';

import { piecesToDxf, tiledPrintHtml } from './export.js';
import {
  deleteNodes,
  ensurePath,
  flattenPath,
  insertNode,
  mirrorPiece,
  pathEdgeLength,
  pieceBounds,
  rotatePiece,
  setEdgeLength,
  setSmooth,
  spreadPiece,
  withPath,
} from './path.js';

const state = () =>
  draftToState(
    null,
    draftPattern({
      family: 'dress',
      audience: 'women',
      size: 'M',
      style: { skirt: 'a_line', sleeve: 'short', closure: 'back_zip' },
    }),
  );
const byTpl = (s: ReturnType<typeof state>, t: string) =>
  s.patternPieces.find((p) => p.draft?.template === t)!;
const edgeLen = (
  p: { outline: { x: number; y: number }[]; edges?: { name: string; from: number; to: number }[] },
  name: string,
) =>
  edgeLength(
    p.outline,
    p.edges!.find((e) => e.name === name)!,
  );

describe('editable vector outline (ADR-059)', () => {
  it('fits the drafted outline with few nodes and keeps every seam length', () => {
    const s = state();
    for (const p of s.patternPieces) {
      expect(p.path, p.name).toBeDefined();
      expect(p.path!.length, p.name).toBeLessThan(40);
      const flat = flattenPath(p.path!, p.edges);
      for (const e of p.edges!) {
        const fe = flat.edges.find((x) => x.name === e.name);
        expect(fe, `${p.name} ${e.name}`).toBeDefined();
        expect(
          Math.abs(edgeLength(flat.outline, fe!) - edgeLength(p.outline, e)),
          `${p.name} ${e.name}`,
        ).toBeLessThan(1.5);
      }
    }
    const front = byTpl(s, 'bodice_front');
    expect(front.path!.some((n) => n.out || n.in)).toBe(true); // real curves, not points
  });

  it('lengthens the skirt across a line: side seam +50 mm, waist and hem unchanged', () => {
    const s = state();
    const front = byTpl(s, 'skirt_front');
    const back = byTpl(s, 'skirt_back');
    const b = pieceBounds(front);
    const line = { point: { x: 0, y: b.y + b.height * 0.6 }, dir: { x: 1, y: 0 } };
    const longer = spreadPiece(front, line, 50);
    expect(pieceBounds(longer).height).toBeCloseTo(b.height + 50, 0);
    expect(edgeLen(longer, 'side') - edgeLen(front, 'side')).toBeCloseTo(50, 0);
    expect(edgeLen(longer, 'waist')).toBeCloseTo(edgeLen(front, 'waist'), 1);
    expect(edgeLen(longer, 'hem')).toBeCloseTo(edgeLen(front, 'hem'), 0);
    // Only one side lengthened → the side seams no longer match; both → they do.
    const pieces = s.patternPieces.map((p) => (p.pieceId === front.pieceId ? longer : p));
    expect(
      seamChecks(pieces, null).find((c) => c.id === 'skirt_side' || c.id === 'side'),
    ).toBeDefined();
    const both = pieces.map((p) =>
      p.pieceId === back.pieceId
        ? spreadPiece(
            back,
            {
              point: { x: 0, y: pieceBounds(back).y + pieceBounds(back).height * 0.6 },
              dir: { x: 1, y: 0 },
            },
            50,
          )
        : p,
    );
    const f2 = both.find((p) => p.pieceId === front.pieceId)!;
    const b2 = both.find((p) => p.pieceId === back.pieceId)!;
    expect(Math.abs(edgeLen(f2, 'side') - edgeLen(b2, 'side'))).toBeLessThan(4);
    // Shortening is a negative spread.
    expect(pieceBounds(spreadPiece(front, line, -30)).height).toBeCloseTo(b.height - 30, 0);
  });

  it('widens across a vertical line', () => {
    const front = byTpl(state(), 'skirt_front');
    const b = pieceBounds(front);
    const wider = spreadPiece(
      front,
      { point: { x: b.x + b.width / 2, y: 0 }, dir: { x: 0, y: 1 } },
      25,
    );
    expect(pieceBounds(wider).width).toBeCloseTo(b.width + 25, 0); // normal of (0,1) points to -x: the left half moves out
  });

  it('sets a seam to an exact length', () => {
    const sleeve = byTpl(state(), 'sleeve');
    const before = pathEdgeLength(ensurePath(sleeve), 'underarm_front');
    const p = setEdgeLength(sleeve, 'underarm_front', before + 37.5);
    expect(pathEdgeLength(p.path!, 'underarm_front')).toBeCloseTo(before + 37.5, 1);
    expect(p.source).toBe('user');
  });

  it('inserts, deletes and smooths nodes; rotate and mirror keep seam lengths', () => {
    const front = byTpl(state(), 'bodice_front');
    const path = ensurePath(front);
    const plus = insertNode(path, 2, 0.5);
    expect(plus.length).toBe(path.length + 1);
    expect(edgeLen(withPath(front, plus), 'armhole')).toBeCloseTo(
      edgeLen(withPath(front, path), 'armhole'),
      0,
    );
    expect(deleteNodes(plus, [3]).length).toBe(path.length);
    expect(setSmooth(path, 1, true)[1]!.smooth).toBe(true);
    const rotated = rotatePiece(front, 90);
    expect(edgeLen(rotated, 'armhole')).toBeCloseTo(edgeLen(front, 'armhole'), 0);
    expect(pieceBounds(rotated).width).toBeCloseTo(pieceBounds(front).height, 0);
    const mirrored = mirrorPiece(mirrorPiece(front, 'vertical'), 'vertical');
    expect(edgeLen(mirrored, 'side')).toBeCloseTo(edgeLen(front, 'side'), 0);
    expect(mirrored.edges!.map((e) => e.name).sort()).toEqual(
      front.edges!.map((e) => e.name).sort(),
    );
  });

  it('exports DXF and a 1:1 tiled print', () => {
    const pieces = state().patternPieces;
    const dxf = piecesToDxf(pieces);
    expect(dxf.startsWith('0\nSECTION')).toBe(true);
    expect(dxf.match(/POLYLINE/g)!.length).toBeGreaterThanOrEqual(pieces.length * 2);
    expect(dxf.trim().endsWith('EOF')).toBe(true);
    const html = tiledPrintHtml(pieces, { paper: 'a4', title: 'Dress' });
    expect(html).toContain('10 cm test square');
    expect(html).toContain('width="190mm"');
    expect(html.match(/class="page"/g)!.length).toBeGreaterThan(1);
  });
});
