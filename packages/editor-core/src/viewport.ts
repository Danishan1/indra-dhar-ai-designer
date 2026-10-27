/**
 * Viewport (zoom and pan) of the 2D canvas — view state only, never design data (SPEC-007 §20).
 * Screen = (world × zoom) + pan. Immutable.
 */
export interface Viewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Bounds extends Point, Size {}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;
export const initialViewport: Viewport = { zoom: 1, panX: 0, panY: 0 };

export const clampZoom = (zoom: number): number =>
  Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1;

export const toScreen = (v: Viewport, p: Point): Point => ({
  x: p.x * v.zoom + v.panX,
  y: p.y * v.zoom + v.panY,
});
export const toWorld = (v: Viewport, p: Point): Point => ({
  x: (p.x - v.panX) / v.zoom,
  y: (p.y - v.panY) / v.zoom,
});

/** Zooms to `zoom`, keeping the world point under the screen `anchor` fixed (cursor zoom). */
export function zoomTo(v: Viewport, zoom: number, anchor: Point = { x: 0, y: 0 }): Viewport {
  const next = clampZoom(zoom);
  const world = toWorld(v, anchor);
  return { zoom: next, panX: anchor.x - world.x * next, panY: anchor.y - world.y * next };
}

export const zoomBy = (v: Viewport, factor: number, anchor?: Point): Viewport =>
  zoomTo(v, v.zoom * factor, anchor);

export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({
  ...v,
  panX: v.panX + dx,
  panY: v.panY + dy,
});

/** Fits `content` (world units) inside the viewport `size` with `padding` screen pixels. */
export function fitToBounds(content: Bounds, size: Size, padding = 24): Viewport {
  const w = Math.max(1, size.width - padding * 2);
  const h = Math.max(1, size.height - padding * 2);
  if (content.width <= 0 || content.height <= 0) return initialViewport;
  const zoom = clampZoom(Math.min(w / content.width, h / content.height));
  return {
    zoom,
    panX: (size.width - content.width * zoom) / 2 - content.x * zoom,
    panY: (size.height - content.height * zoom) / 2 - content.y * zoom,
  };
}

/** Zoom as a percentage label, e.g. "125%". */
export const zoomLabel = (v: Viewport): string => `${Math.round(v.zoom * 100)}%`;
