import { backNeckHalf, frontNeckHalf } from '../frame.js';
import { circle, mirror, polyline, pt, rect } from '../geometry.js';
import type { Point } from '../types.js';

import type { GeometryFn, Part } from './types.js';

/** Knit neckline: rib band between the opening and the seam, coverstitched (front and back). */
export const necklineGeometry: GeometryFn = ({ frame: f, view }) => {
  const w = f.template.defaults.neckBandWidth || 16;
  const half = view === 'front' ? frontNeckHalf(f) : backNeckHalf(f); // HPS → centre
  const seam = half.map((p) => {
    const t = f.nh === 0 ? 0 : p.x / f.nh;
    return pt(p.x * (1 + (w * 0.8) / f.nh), p.y + w * (1 - 0.75 * t));
  });
  const full = (pts: Point[]) => [...pts.map(mirror), ...pts.slice().reverse().slice(1)];
  const opening = full(half);
  const seamFull = full(seam);
  const parts: Part[] = [
    {
      suffix: 'band',
      role: 'panel',
      layer: 'garment',
      path: polyline([...opening, ...seamFull.slice().reverse()], true),
      fill: 'self',
    },
    {
      suffix: 'stitch',
      role: 'stitch',
      layer: 'garment',
      path: polyline(seamFull.map((p) => pt(p.x, p.y + 2))),
      fill: 'none',
    },
  ];
  if (view === 'front' && f.neckline === 'v_neck')
    parts.push({
      suffix: 'overlap',
      role: 'seam',
      layer: 'garment',
      path: polyline([pt(0, 0), pt(0, w)]),
      fill: 'none',
    });
  if (view === 'front' && f.neckline === 'henley') {
    parts.push({
      suffix: 'placket',
      role: 'panel',
      layer: 'garment',
      path: rect(-12, w, 24, 150),
      fill: 'self',
    });
    for (let i = 0; i < 3; i++)
      parts.push({
        suffix: `button-${i + 1}`,
        role: 'detail',
        layer: 'garment',
        path: circle(pt(0, w + 30 + i * 45), 4),
        fill: '#ffffff',
      });
  }
  return {
    parts,
    anchors: { centre: view === 'front' ? pt(0, 0) : pt(0, f.backNeckY) },
    boundaries: [{ name: 'neck_edge', view, points: opening }],
  };
};
