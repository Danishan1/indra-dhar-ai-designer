import { bodyGeometry, panelGeometry } from './body.js';
import { collarGeometry } from './collar.js';
import { hemGeometry } from './hem.js';
import { necklineGeometry } from './neckline.js';
import { placketGeometry } from './placket.js';
import { pocketGeometry } from './pocket.js';
import { cuffGeometry, sleeveGeometry } from './sleeve.js';
import type { GeometryFn } from './types.js';
import { yokeGeometry } from './yoke.js';

export * from './types.js';

/** Geometry function per component type, in drawing order (later types paint over earlier ones). */
export const GEOMETRY: ReadonlyArray<readonly [string, GeometryFn]> = [
  ['front_body_panel', panelGeometry('front')],
  ['back_body_panel', panelGeometry('back')],
  ['sleeve', sleeveGeometry],
  ['cuff', cuffGeometry],
  ['garment_body', bodyGeometry],
  ['yoke', yokeGeometry],
  ['hem', hemGeometry],
  ['pocket', pocketGeometry],
  ['placket', placketGeometry],
  ['neckline', necklineGeometry],
  ['collar', collarGeometry],
];

export const geometryFor = (type: string): GeometryFn | undefined =>
  GEOMETRY.find(([t]) => t === type)?.[1];
export const drawOrder = (type: string): number => {
  const i = GEOMETRY.findIndex(([t]) => t === type);
  return i === -1 ? GEOMETRY.length : i;
};
