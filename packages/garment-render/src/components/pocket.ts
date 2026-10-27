import { sideSign } from '../frame.js';
import { circle, polyline, pt, rect } from '../geometry.js';

import { type GeometryFn, type Part } from './types.js';

export const PocketPositions = [
  'left_chest',
  'right_chest',
  'center_chest',
  'lower_left',
  'lower_right',
] as const;

/** Pocket on the front (or back) panel at a named position. */
export const pocketGeometry: GeometryFn = ({ frame: f, view, component, state, params }) => {
  const parent = state.components.find((c) => c.componentId === component.parentComponentId);
  const pocketView = parent?.componentType === 'back_body_panel' ? 'back' : 'front';
  if (view !== pocketView || parent?.componentType === 'sleeve') return null;
  const type = params.choice(
    'construction.pocket_type',
    ['patch', 'patch_with_flap', 'welt', 'inseam', 'none'] as const,
    'patch',
  );
  if (type === 'none') return null;
  const position = params.choice(
    'placement.pocket_position',
    PocketPositions,
    component.side === 'right' ? 'right_chest' : 'left_chest',
  );
  const wearer = position.includes('left')
    ? 'left'
    : position.includes('right')
      ? 'right'
      : 'centre';
  const sign = wearer === 'centre' ? 0 : sideSign(wearer, view);
  const chest = position.endsWith('chest');
  const cx = sign * f.chestHalf * 0.45;
  const w = Math.round(f.chestHalf * 2 * 0.22);
  const h = Math.round(w * 1.12);
  const y0 = chest ? f.hpsY + 190 : f.hemY - 300;
  const x0 = cx - w / 2;
  const parts: Part[] = [];
  if (type === 'welt') {
    parts.push({
      suffix: 'welt',
      role: 'panel',
      layer: 'garment',
      path: rect(x0, y0, w, 14),
      fill: 'self',
    });
    parts.push({
      suffix: 'stitch',
      role: 'stitch',
      layer: 'garment',
      path: rect(x0 + 2, y0 + 2, w - 4, 10),
      fill: 'none',
    });
  } else if (type === 'inseam') {
    parts.push({
      suffix: 'bag',
      role: 'hidden',
      layer: 'garment',
      path: rect(x0, y0, w, h),
      fill: 'none',
    });
  } else {
    parts.push({
      suffix: 'panel',
      role: 'panel',
      layer: 'garment',
      path: rect(x0, y0, w, h),
      fill: 'self',
    });
    parts.push({
      suffix: 'stitch',
      role: 'stitch',
      layer: 'garment',
      path: rect(x0 + 5, y0 + 5, w - 10, h - 10),
      fill: 'none',
    });
    if (type === 'patch_with_flap') {
      const flap = polyline(
        [
          pt(x0 - 2, y0 - 6),
          pt(x0 + w + 2, y0 - 6),
          pt(x0 + w + 2, y0 + 28),
          pt(cx, y0 + 40),
          pt(x0 - 2, y0 + 28),
        ],
        true,
      );
      parts.push({ suffix: 'flap', role: 'panel', layer: 'garment', path: flap, fill: 'self' });
      parts.push({
        suffix: 'button',
        role: 'detail',
        layer: 'garment',
        path: circle(pt(cx, y0 + 28), 4.5),
        fill: '#ffffff',
      });
    }
  }
  return {
    parts,
    anchors: { centre: pt(cx, y0 + h / 2), opening_centre: pt(cx, y0) },
    boundaries: [{ name: 'pocket_opening', view, points: [pt(x0, y0), pt(x0 + w, y0)] }],
  };
};
