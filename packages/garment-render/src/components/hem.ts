import { hemEdge, sideSign } from '../frame.js';
import { add, lerp, polyline, pt, scale, sub } from '../geometry.js';

import { empty, type GeometryFn, type Part, signed } from './types.js';

const STITCHES = (type: string, depth: number): number[] =>
  ({
    shirt_tail: [depth - 2],
    straight: [depth - 2],
    single_fold: [depth - 2],
    double_fold: [depth - 2],
    coverstitch: [depth - 2, Math.max(2, depth - 7)],
    rolled: [2],
    raw_edge: [],
  })[type] ?? [];

/** Hem finishing a sleeve end (knit sleeves). */
const sleeveHem: GeometryFn = ({ frame: f, view, component }) => {
  const entry = (['left', 'right'] as const)
    .map((side) => ({ side, sl: f.arms[side].sleeve }))
    .find((x) => x.sl?.hemId === component.componentId);
  if (!entry?.sl) return empty();
  const { sl, side } = entry;
  const s = signed(sideSign(side, view));
  const depth = Math.max(sl.hemDepth, 3);
  const back = (d: number) => scale(sl.dir, d);
  const band = [
    sub(sl.endTop, back(depth)),
    sl.endTop,
    sl.endBottom,
    sub(sl.endBottom, back(depth)),
  ];
  const parts: Part[] = [
    {
      suffix: 'band',
      role: 'panel',
      layer: 'garment',
      path: polyline(band.map(s), true),
      fill: 'self',
    },
    ...STITCHES(sl.hemType, depth).map((d, i) => ({
      suffix: `stitch-${i + 1}`,
      role: 'stitch' as const,
      layer: 'garment' as const,
      path: polyline([sub(sl.endTop, back(d)), sub(sl.endBottom, back(d))].map(s)),
      fill: 'none',
    })),
  ];
  return {
    parts,
    anchors: { centre: s(add(lerp(sl.endTop, sl.endBottom, 0.5), back(-depth / 2))) },
    boundaries: [{ name: 'hem_edge', view, points: [s(sl.endTop), s(sl.endBottom)] }],
  };
};

/** Body hem: band, topstitching by hem type, and the hem edge boundary (both views). */
export const hemGeometry: GeometryFn = (ctx) => {
  const { frame: f, view, component } = ctx;
  if (component.componentId !== f.hemId) return sleeveHem(ctx);
  const edge = hemEdge(f); // viewer-left → viewer-right
  const up = (d: number) => edge.map((p) => pt(p.x, p.y - d));
  const depth = Math.max(f.hemDepth, 3);
  const parts: Part[] = [
    {
      suffix: 'band',
      role: 'panel',
      layer: 'garment',
      path: polyline([...edge, ...up(depth).reverse()], true),
      fill: 'self',
    },
  ];
  STITCHES(f.hemType, depth).forEach((d, i) =>
    parts.push({
      suffix: `stitch-${i + 1}`,
      role: 'stitch',
      layer: 'garment',
      path: polyline(up(d)),
      fill: 'none',
    }),
  );
  return {
    parts,
    anchors: {
      centre: pt(0, f.hemY - depth / 2),
      side_viewer_right: pt(f.hemHalf, f.hemSideY),
      side_viewer_left: pt(-f.hemHalf, f.hemSideY),
    },
    boundaries: [{ name: 'hem_edge', view, points: edge }],
  };
};
