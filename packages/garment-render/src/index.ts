/**
 * @ai-designer/garment-render — canonical garment state → deterministic, component-aware 2D technical
 * flats (I16, ADR-024/051). Pure TypeScript: no DOM, no network; runs in the browser and the worker.
 */
export * from './types.js';
export * from './registry.js';
export { createRenderer, geometryCapability, renderGarment, type Renderer } from './scene.js';
export {
  sceneToSvg,
  escapeXml,
  isSafeHref,
  patternMarkup,
  elementMarkup,
  componentPreviewSvg,
  pathDataBounds,
  type SvgOptions,
} from './svg-string.js';
export * from './layout.js';
export { ROLE_STYLES, NEUTRAL_FILL, type LineStyle } from './styles.js';
export { motifCount, pickBoundary, rotatedRect, shiftAway } from './trims.js';
export { VISUAL_PROPERTIES } from './mapping.js';
export * from './gallery.js';
