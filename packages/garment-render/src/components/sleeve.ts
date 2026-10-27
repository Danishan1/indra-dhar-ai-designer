import { armholeHalf, sideSign, type WearerSide } from '../frame.js';
import { add, circle, lerp, path, polyline, pt, scale, sub } from '../geometry.js';

import { empty, type GeometryFn, type GeometryResult, signed } from './types.js';

const sideOf = (side: string): WearerSide => (side === 'right' ? 'right' : 'left');

/** Sleeve (set-in, raglan, drop shoulder, dolman; sleeveless draws the armhole finish). */
export const sleeveGeometry: GeometryFn = ({ frame: f, view, component }) => {
  const side = sideOf(component.side);
  const s = signed(sideSign(side, view));
  const arm = f.arms[side];
  const sl = arm.sleeve;
  if (!sl || sl.componentId !== component.componentId) {
    if (arm.type !== 'sleeveless') return empty();
    const hole = armholeHalf(arm).map(s);
    return {
      parts: [
        { suffix: 'armhole', role: 'stitch', layer: 'garment', path: polyline(hole), fill: 'none' },
      ],
      anchors: { shoulder: s(arm.shoulder), underarm: s(arm.under) },
      boundaries: [{ name: 'armhole_edge', view, points: hole }],
    };
  }
  const hole = armholeHalf(arm);
  const outer = sl.raglanTop ? [sl.raglanTop, sl.shoulder] : [sl.shoulder];
  const shape = path();
  const pts = [...outer, sl.endTop, sl.endBottom, sl.under].map(s);
  pts.forEach((p, i) => (i === 0 ? shape.move(p) : shape.line(p)));
  if (sl.raglanTop) {
    const ctrl = s(
      pt((sl.raglanTop.x + sl.under.x) / 2 + 12, (sl.raglanTop.y + sl.under.y) / 2 - 10),
    );
    shape.quad(ctrl, s(sl.raglanTop));
  } else {
    hole
      .slice(0, -1)
      .reverse()
      .forEach((p) => shape.line(s(p)));
  }
  shape.close();

  const parts: GeometryResult = { parts: [], anchors: {}, boundaries: [] };
  parts.parts.push({ suffix: 'panel', role: 'panel', layer: 'garment', path: shape, fill: 'self' });
  if (sl.raglanTop) {
    const ctrl = pt((sl.raglanTop.x + sl.under.x) / 2 + 12, (sl.raglanTop.y + sl.under.y) / 2 - 10);
    parts.parts.push({
      suffix: 'seam',
      role: 'seam',
      layer: 'garment',
      path: path().move(s(sl.raglanTop)).quad(s(ctrl), s(sl.under)),
      fill: 'none',
    });
  } else if (sl.type !== 'dolman') {
    parts.parts.push({
      suffix: 'seam',
      role: 'seam',
      layer: 'garment',
      path: polyline(hole.map(s)),
      fill: 'none',
    });
  }
  if (sl.cuffWidth === 0 && !sl.hemId) {
    // Hemmed sleeve end: a topstitch parallel to the opening.
    const back = scale(sl.dir, Math.min(18, sl.length * 0.15));
    parts.parts.push({
      suffix: 'hem-stitch',
      role: 'stitch',
      layer: 'garment',
      path: polyline([sub(sl.endTop, back), sub(sl.endBottom, back)].map(s)),
      fill: 'none',
    });
  }
  parts.anchors = {
    shoulder: s(sl.shoulder),
    underarm: s(sl.under),
    end_top: s(sl.endTop),
    end_bottom: s(sl.endBottom),
    centre: s(lerp(lerp(sl.shoulder, sl.under, 0.5), lerp(sl.endTop, sl.endBottom, 0.5), 0.5)),
    elbow: s(add(sl.shoulder, scale(sl.dir, sl.length * 0.55))),
  };
  parts.boundaries = [{ name: 'sleeve_opening', view, points: [s(sl.endTop), s(sl.endBottom)] }];
  return parts;
};

/** Cuff at the end of its sleeve. */
export const cuffGeometry: GeometryFn = ({ frame: f, view, component, params }) => {
  const sleeve = Object.values(f.arms)
    .map((a) => a.sleeve)
    .find((sl) => sl?.cuffId === component.componentId);
  if (!sleeve) return empty();
  const side = sideOf(component.side === 'none' ? 'left' : component.side);
  const s = signed(sideSign(side, view));
  const type = params.choice(
    'construction.cuff_type',
    ['barrel_single_button', 'barrel_double_button', 'french', 'rib', 'plain', 'hemmed'] as const,
    'barrel_single_button',
  );
  const back = scale(sleeve.dir, sleeve.cuffWidth);
  const startTop = sub(sleeve.endTop, back);
  const startBottom = sub(sleeve.endBottom, back);
  const quad = [startTop, sleeve.endTop, sleeve.endBottom, startBottom];
  const parts: GeometryResult['parts'] = [
    {
      suffix: 'panel',
      role: 'panel',
      layer: 'garment',
      path: polyline(quad.map(s), true),
      fill: 'self',
    },
  ];
  if (type === 'barrel_single_button' || type === 'barrel_double_button') {
    const n = type === 'barrel_single_button' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const along = lerp(sleeve.endTop, startTop, 0.5);
      const across = lerp(along, lerp(sleeve.endBottom, startBottom, 0.5), 0.18 + i * 0.12);
      parts.push({
        suffix: `button-${i + 1}`,
        role: 'detail',
        layer: 'garment',
        path: circle(s(across), 4.5),
        fill: '#ffffff',
      });
    }
  }
  if (type === 'french') {
    parts.push({
      suffix: 'fold',
      role: 'fold',
      layer: 'garment',
      path: polyline(
        [lerp(startTop, sleeve.endTop, 0.5), lerp(startBottom, sleeve.endBottom, 0.5)].map(s),
      ),
      fill: 'none',
    });
  }
  if (type === 'rib') {
    const ribs = Math.max(
      2,
      Math.round(
        Math.hypot(sleeve.endBottom.x - sleeve.endTop.x, sleeve.endBottom.y - sleeve.endTop.y) / 7,
      ),
    );
    for (let i = 1; i < ribs; i++) {
      const t = i / ribs;
      parts.push({
        suffix: `rib-${i}`,
        role: 'detail',
        layer: 'garment',
        path: polyline(
          [lerp(startTop, startBottom, t), lerp(sleeve.endTop, sleeve.endBottom, t)].map(s),
        ),
        fill: 'none',
      });
    }
  }
  if (type === 'plain' || type === 'hemmed') {
    const inset = scale(sleeve.dir, Math.min(8, sleeve.cuffWidth / 3));
    parts.push({
      suffix: 'stitch',
      role: 'stitch',
      layer: 'garment',
      path: polyline([add(startTop, inset), add(startBottom, inset)].map(s)),
      fill: 'none',
    });
  }
  return {
    parts,
    anchors: {
      centre: s(
        lerp(lerp(startTop, sleeve.endBottom, 0.5), lerp(startBottom, sleeve.endTop, 0.5), 0.5),
      ),
    },
    boundaries: [{ name: 'cuff_edge', view, points: [s(sleeve.endTop), s(sleeve.endBottom)] }],
  };
};
