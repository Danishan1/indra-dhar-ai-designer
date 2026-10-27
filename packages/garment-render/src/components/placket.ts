import { circle, polyline, pt, rect } from '../geometry.js';

import { empty, type GeometryFn, type Part } from './types.js';

/** Front placket with its closure (buttons, snaps, zip). Front view only. */
export const placketGeometry: GeometryFn = ({ frame: f, view, params }) => {
  if (view !== 'front') return null;
  const type = params.choice(
    'construction.placket_type',
    ['standard', 'concealed', 'covered', 'half', 'none'] as const,
    'standard',
  );
  const closure = params.choice(
    'construction.closure_type',
    ['button', 'snap', 'zip', 'none'] as const,
    'button',
  );
  const w = params.length(
    'dimension.placket_width',
    f.template.defaults.placketWidth || 30,
    10,
    80,
  );
  const end = type === 'half' ? Math.min(280, f.hemY * 0.4) : f.hemY - Math.max(f.hemDepth, 4) - 6;
  if (end <= 20) return empty();
  const x0 = -w / 2;
  const parts: Part[] = [];
  if (type !== 'none') {
    parts.push({
      suffix: 'panel',
      role: 'panel',
      layer: 'garment',
      path: rect(x0, 0, w, end),
      fill: 'self',
    });
    const stitchXs = type === 'standard' || type === 'half' ? [x0 + 3, -x0 - 3] : [-x0 - 6];
    stitchXs.forEach((x, i) =>
      parts.push({
        suffix: `stitch-${i + 1}`,
        role: 'stitch',
        layer: 'garment',
        path: polyline([pt(x, 2), pt(x, end - 2)]),
        fill: 'none',
      }),
    );
  }
  const visible = type !== 'concealed' && type !== 'covered';
  if (closure === 'zip') {
    parts.push({
      suffix: 'zip',
      role: 'seam',
      layer: 'garment',
      path: polyline([pt(0, 4), pt(0, end - 4)]),
      fill: 'none',
    });
  } else if ((closure === 'button' || closure === 'snap') && visible) {
    const count = params.count('construction.button_count', f.template.defaults.buttonCount, 0, 40);
    const first = 28;
    const last = end - (type === 'half' ? 30 : 70);
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? first : first + ((last - first) * i) / (count - 1);
      const c = pt(0, y);
      const shape = closure === 'snap' ? circle(c, 4.5) : circle(c, 5.5);
      parts.push({
        suffix: `${closure}-${i + 1}`,
        role: 'detail',
        layer: 'garment',
        path: shape,
        fill: '#ffffff',
      });
      if (closure === 'snap')
        parts.push({
          suffix: `snap-dot-${i + 1}`,
          role: 'detail',
          layer: 'garment',
          path: circle(c, 1.4),
          fill: 'none',
        });
    }
  }
  return {
    parts,
    anchors: { top: pt(0, 0), bottom: pt(0, end), centre: pt(0, end / 2) },
    boundaries: [
      { name: 'placket_edge_viewer_left', view, points: [pt(x0, 0), pt(x0, end)] },
      { name: 'placket_edge_viewer_right', view, points: [pt(-x0, 0), pt(-x0, end)] },
    ],
  };
};
