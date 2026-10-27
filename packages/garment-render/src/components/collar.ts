import { backNeckHalf, frontNeckHalf } from '../frame.js';
import { circle, lerp, mirror, path, polyline, pt } from '../geometry.js';
import type { Point } from '../types.js';

import { empty, type GeometryFn, type Part } from './types.js';

export const CollarTypes = [
  'spread',
  'point',
  'button_down',
  'mandarin',
  'camp',
  'band',
  'none',
] as const;

const LEAF: Record<
  string,
  { out: number; tip: (nh: number, h: number) => Point; end: (h: number) => Point }
> = {
  spread: { out: 22, tip: (nh, h) => pt(nh * 0.95, h * 0.95), end: () => pt(1.5, 3) },
  point: { out: 10, tip: (nh, h) => pt(nh * 0.5, h * 1.55), end: () => pt(1.5, 3) },
  button_down: { out: 12, tip: (nh, h) => pt(nh * 0.62, h * 1.35), end: () => pt(1.5, 3) },
  camp: { out: 30, tip: (nh, h) => pt(nh * 1.05, h * 1.9), end: (h) => pt(5, h * 2.3) },
};

/** Woven collar: stand + leaves (front), band + fall with fold line (back). */
export const collarGeometry: GeometryFn = ({ frame: f, view, params }) => {
  const type = params.choice('construction.collar_type', CollarTypes, 'spread');
  if (type === 'none') return empty();
  const h = params.length(
    'dimension.collar_height',
    f.template.defaults.collarHeight || 40,
    15,
    120,
  );
  const { nh, hpsY } = f;
  const top = hpsY - h * 0.55;
  const parts: Part[] = [];
  const leaf = LEAF[type];

  if (view === 'back') {
    const neck = backNeckHalf(f);
    const fullNeck = [...neck, ...neck.map(mirror).reverse().slice(1)];
    const band = path()
      .move(pt(-nh - 6, top))
      .line(pt(nh + 6, top));
    fullNeck.forEach((p) => band.line(p));
    band.close();
    parts.push({ suffix: 'band', role: 'panel', layer: 'garment', path: band, fill: 'self' });
    let edge: Point[] = [];
    if (leaf) {
      const edgeY = hpsY + h * 0.7;
      const o = nh + leaf.out;
      const fall = path()
        .move(pt(-nh - 6, top))
        .line(pt(nh + 6, top))
        .line(pt(o, edgeY))
        .quad(pt(0, edgeY + 8), pt(-o, edgeY))
        .close();
      parts.push({ suffix: 'fall', role: 'panel', layer: 'garment', path: fall, fill: 'self' });
      parts.push({
        suffix: 'fold',
        role: 'fold',
        layer: 'garment',
        path: polyline([pt(-nh - 6, top), pt(nh + 6, top)]),
        fill: 'none',
      });
      edge = [pt(-o, edgeY), pt(0, edgeY + 4), pt(o, edgeY)];
    }
    return {
      parts,
      anchors: { centre: pt(0, (top + hpsY) / 2) },
      boundaries: edge.length ? [{ name: 'collar_edge', view, points: edge }] : [],
    };
  }

  const neckHalf = frontNeckHalf(f); // HPS → CF
  if (!leaf) {
    // Mandarin / band: a stand around the whole neck.
    const outer = neckHalf.map((p, i) =>
      pt(p.x, p.y - h * (0.55 + 0.35 * (i / (neckHalf.length - 1)))),
    );
    const outerFull = [...outer.map(mirror), ...outer.slice().reverse().slice(1)];
    const shape = polyline(
      [...outerFull, ...neckHalf, ...neckHalf.map(mirror).reverse().slice(1)],
      true,
    );
    parts.push({ suffix: 'stand', role: 'panel', layer: 'garment', path: shape, fill: 'self' });
    parts.push({
      suffix: 'stitch',
      role: 'stitch',
      layer: 'garment',
      path: polyline(outerFull.map((p) => pt(p.x, p.y + 4))),
      fill: 'none',
    });
    if (type === 'band')
      parts.push({
        suffix: 'button',
        role: 'detail',
        layer: 'garment',
        path: circle(pt(0, -h * 0.45), 4.5),
        fill: '#ffffff',
      });
    return {
      parts,
      anchors: { centre: pt(0, -h * 0.45) },
      boundaries: [{ name: 'collar_edge', view, points: outerFull }],
    };
  }

  // Stand visible behind the neck, then one leaf per side.
  parts.push({
    suffix: 'stand',
    role: 'panel',
    layer: 'garment',
    path: path()
      .move(pt(-nh - 6, top))
      .quad(pt(0, top - h * 0.2), pt(nh + 6, top))
      .line(pt(nh, hpsY))
      .quad(pt(0, hpsY + 8), pt(-nh, hpsY))
      .close(),
    fill: 'self',
  });
  const p1 = pt(nh + 6, top);
  const p2 = pt(nh + leaf.out, hpsY + h * 0.8);
  const tip = leaf.tip(nh, h);
  const end = leaf.end(h);
  const right = [p1, p2, tip, end, lerp(pt(0, 0), pt(nh, hpsY), 0.55), pt(nh, hpsY)];
  for (const [suffix, pts] of [
    ['leaf-viewer-right', right],
    ['leaf-viewer-left', right.map(mirror)],
  ] as const) {
    parts.push({
      suffix,
      role: 'panel',
      layer: 'garment',
      path: polyline(pts, true),
      fill: 'self',
    });
  }
  if (type === 'button_down')
    for (const sign of [1, -1])
      parts.push({
        suffix: `button-${sign === 1 ? 'viewer-right' : 'viewer-left'}`,
        role: 'detail',
        layer: 'garment',
        path: circle(pt(sign * (tip.x + 4), tip.y - 8), 3.5),
        fill: '#ffffff',
      });
  return {
    parts,
    anchors: { centre: pt(0, hpsY), tip_viewer_right: tip, tip_viewer_left: mirror(tip) },
    boundaries: [
      { name: 'collar_edge', view, points: [mirror(tip), mirror(p2), mirror(p1), p1, p2, tip] },
    ],
  };
};
