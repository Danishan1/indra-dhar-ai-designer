import type { DesignComponent, GarmentDesignState } from '@ai-designer/garment-model';

import type { Frame } from '../frame.js';
import { mirror, type PathBuilder } from '../geometry.js';
import type { ParamReader } from '../params.js';
import type { BoundaryPath, ElementRole, Layer, Point, View } from '../types.js';

export interface GeometryContext {
  frame: Frame;
  view: View;
  component: DesignComponent;
  state: GarmentDesignState;
  /** Reads this component's properties; defaults become placeholders. */
  params: ParamReader;
}

export interface Part {
  /** Unique within the component and view. */
  suffix: string;
  role: ElementRole;
  layer: Layer;
  path: PathBuilder;
  /** `self`: filled with the component's resolved fill; `none`: stroke only; or a fixed colour. */
  fill: 'self' | 'none' | string;
  text?: { at: Point; value: string };
}

export interface GeometryResult {
  parts: Part[];
  anchors: Record<string, Point>;
  boundaries: BoundaryPath[];
}

/** Null: the component is not visible in this view. */
export type GeometryFn = (ctx: GeometryContext) => GeometryResult | null;

export const empty = (): GeometryResult => ({ parts: [], anchors: {}, boundaries: [] });

/** Applies a side sign to canonical (viewer-right) points. */
export const signed =
  (sign: 1 | -1) =>
  (p: Point): Point =>
    sign === 1 ? p : mirror(p);
