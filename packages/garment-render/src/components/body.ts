import { backNeckHalf, frontNeckHalf, hemEdge, torsoOutline } from '../frame.js';
import { mirror, polyline, pt } from '../geometry.js';

import type { GeometryFn } from './types.js';

/** Garment body: the silhouette outline and the centre guide (both views). */
export const bodyGeometry: GeometryFn = ({ frame: f, view, state, component }) => {
  const outline = torsoOutline(f, view);
  const panelType = view === 'front' ? 'front_body_panel' : 'back_body_panel';
  const hasPanel = state.components.some(
    (c) => c.componentType === panelType && c.parentComponentId === component.componentId,
  );
  const neckCentre = view === 'front' ? pt(0, 0) : pt(0, f.backNeckY);
  // Front view: the inside of the back neck shows through the neck opening.
  const front = frontNeckHalf(f);
  const back = backNeckHalf(f);
  const insideBack = [
    ...front.map(mirror),
    ...front.slice().reverse().slice(1),
    ...back.slice(1),
    ...back.map(mirror).reverse().slice(1, -1),
  ];
  return {
    parts: [
      ...(view === 'front'
        ? [
            {
              suffix: 'inside-back',
              role: 'hidden' as const,
              layer: 'garment' as const,
              path: polyline(insideBack, true),
              fill: '#e4e2dd',
            },
          ]
        : []),
      ...(hasPanel
        ? []
        : [
            {
              suffix: 'fill',
              role: 'panel' as const,
              layer: 'garment' as const,
              path: polyline(outline, true),
              fill: 'self',
            },
          ]),
      {
        suffix: 'outline',
        role: 'silhouette',
        layer: 'garment',
        path: polyline(outline, true),
        fill: 'none',
      },
      {
        suffix: 'centre',
        role: 'guide',
        layer: 'guides',
        path: polyline([neckCentre, pt(0, f.hemY)]),
        fill: 'none',
      },
    ],
    anchors: {
      centre_neck: neckCentre,
      hps_viewer_right: pt(f.nh, f.hpsY),
      hps_viewer_left: pt(-f.nh, f.hpsY),
      hem_centre: pt(0, f.hemY),
    },
    boundaries:
      view === 'front'
        ? [
            {
              name: 'neck_edge',
              view,
              points: [...frontNeckHalf(f).map(mirror), ...frontNeckHalf(f).reverse().slice(1)],
            },
            { name: 'hem_edge', view, points: hemEdge(f) },
          ]
        : [{ name: 'hem_edge', view, points: hemEdge(f) }],
  };
};

/** Front or back body panel: the filled torso in its own view. */
export const panelGeometry =
  (panelView: 'front' | 'back'): GeometryFn =>
  ({ frame: f, view }) => {
    if (view !== panelView) return null;
    const chestY = f.hpsY + 200;
    const lowerY = f.hemY - 230;
    const x = f.chestHalf * 0.45;
    // Named regions for placements (wearer's left is on the viewer's right in the front view).
    const leftX = view === 'front' ? x : -x;
    return {
      parts: [
        {
          suffix: 'panel',
          role: 'panel',
          layer: 'garment',
          path: polyline(torsoOutline(f, view), true),
          fill: 'self',
        },
      ],
      anchors: {
        left_chest: pt(leftX, chestY),
        right_chest: pt(-leftX, chestY),
        center_chest: pt(0, chestY),
        lower_left: pt(leftX, lowerY),
        lower_right: pt(-leftX, lowerY),
        centre: pt(0, (f.hpsY + f.hemY) / 2),
      },
      boundaries: [],
    };
  };
