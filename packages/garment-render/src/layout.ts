import { fmt, unionBounds } from './geometry.js';
import type { Bounds, Layer, Scene, SceneElement, View } from './types.js';

export type ViewMode = View | 'split';

export interface ViewPlacement {
  view: View;
  /** Horizontal offset applied to the view's coordinates (split view). */
  dx: number;
}

/** Where each view goes for a display mode, and the combined bounds (mm). */
export function layoutViews(
  scene: Scene,
  mode: ViewMode,
  gapMm = 80,
): { placements: ViewPlacement[]; bounds: Bounds } {
  const views = (mode === 'split' ? (['front', 'back'] as const) : [mode]).filter(
    (v) => scene.views[v].available,
  );
  const placements: ViewPlacement[] = [];
  let cursor: number | null = null;
  for (const v of views) {
    const b = scene.views[v].bounds;
    const dx: number = cursor === null ? 0 : cursor + gapMm - b.x;
    placements.push({ view: v, dx });
    cursor = b.x + dx + b.width;
  }
  const bounds = placements.length
    ? unionBounds(
        placements.map((p) => ({
          ...scene.views[p.view].bounds,
          x: scene.views[p.view].bounds.x + p.dx,
        })),
      )
    : { x: 0, y: 0, width: 0, height: 0 };
  return { placements, bounds };
}

export const elementsOn = (
  scene: Scene,
  view: View,
  layers: ReadonlySet<Layer> | null = null,
): SceneElement[] => scene.views[view].elements.filter((e) => !layers || layers.has(e.layer));

export const viewBoxOf = (b: Bounds): string => [b.x, b.y, b.width, b.height].map(fmt).join(' ');
