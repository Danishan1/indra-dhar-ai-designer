import { backNeckHalf } from '../frame.js';
import { mirror, polyline, pt } from '../geometry.js';

import type { GeometryFn } from './types.js';

/** Back yoke: from the shoulders down to a horizontal seam. Back view only. */
export const yokeGeometry: GeometryFn = ({ frame: f, view }) => {
  if (view !== 'back') return null;
  const yokeY = f.hpsY + 115;
  const r = f.arms.right.shoulder; // back view: the wearer's right is on the viewer's right
  const l = mirror(f.arms.left.shoulder);
  const neck = backNeckHalf(f); // viewer-right HPS → centre
  const seamR = pt(r.x - 6, yokeY);
  const seamL = pt(l.x + 6, yokeY);
  const shape = [l, ...neck.map(mirror), ...neck.slice().reverse().slice(1), r, seamR, seamL];
  return {
    parts: [
      {
        suffix: 'panel',
        role: 'panel',
        layer: 'garment',
        path: polyline(shape, true),
        fill: 'self',
      },
      {
        suffix: 'seam',
        role: 'seam',
        layer: 'garment',
        path: polyline([seamL, seamR]),
        fill: 'none',
      },
    ],
    anchors: { centre: pt(0, (f.hpsY + yokeY) / 2) },
    boundaries: [{ name: 'yoke_seam', view, points: [seamL, seamR] }],
  };
};
