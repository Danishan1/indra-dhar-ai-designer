/**
 * Scene builder: canonical design state → deterministic scene (front/back views). Geometry is
 * memoized per component and view (key: the component's data + the frame + the component layout), so
 * a property change recomputes only what it affects (SPEC-010 §22).
 */
import type { DesignComponent, GarmentDesignState } from '@ai-designer/garment-model';

import { GEOMETRY, geometryFor, type GeometryResult } from './components/index.js';
import { FillResolver } from './fills.js';
import { buildFrame, type Frame } from './frame.js';
import { boundsOf, unionBounds } from './geometry.js';
import { ParamReader } from './params.js';
import { DRAWN_COMPONENT_TYPES, getTemplate, INVISIBLE_COMPONENT_TYPES } from './registry.js';
import { renderTrims, type TrimTarget } from './trims.js';
import {
  type ComponentRenderInfo,
  type GeometryCapability,
  type Point,
  type RenderOptions,
  type Scene,
  type SceneElement,
  type SceneWarning,
  type View,
  type ViewScene,
  VIEWS,
} from './types.js';

interface Cached {
  result: GeometryResult | null;
  placeholders: string[];
}

export interface Renderer {
  render(state: GarmentDesignState, options?: RenderOptions & { includeHidden?: boolean }): Scene;
  /** Cache statistics of the last render (tests, performance checks). */
  readonly stats: { hits: number; misses: number };
  clear(): void;
}

const ORDER = new Map(GEOMETRY.map(([t], i) => [t, i]));
const MARGIN = 20;

export function geometryCapability(
  state: Pick<GarmentDesignState, 'garmentCategory'>,
): GeometryCapability {
  return getTemplate(state.garmentCategory) ? 'G2' : 'G0';
}

export function createRenderer(): Renderer {
  let cache = new Map<string, Cached>();
  const stats = { hits: 0, misses: 0 };

  function geometry(
    frame: Frame,
    layoutKey: string,
    view: View,
    c: DesignComponent,
    state: GarmentDesignState,
  ): Cached {
    const sleeveKey =
      c.componentType === 'sleeve' || c.componentType === 'cuff'
        ? frame.keys.sleeve.left + frame.keys.sleeve.right
        : '';
    const key = `${view}|${frame.keys.torso}|${frame.keys.arms}|${sleeveKey}|${layoutKey}|${JSON.stringify(c)}`;
    const hit = cache.get(key);
    if (hit) {
      stats.hits++;
      return hit;
    }
    stats.misses++;
    const fn = geometryFor(c.componentType);
    const params = new ParamReader(c);
    const result = fn ? fn({ frame, view, component: c, state, params }) : null;
    const value = { result, placeholders: params.placeholders };
    cache.set(key, value);
    return value;
  }

  function render(
    state: GarmentDesignState,
    options: RenderOptions & { includeHidden?: boolean } = {},
  ): Scene {
    stats.hits = 0;
    stats.misses = 0;
    const template = getTemplate(state.garmentCategory);
    const components: Record<string, ComponentRenderInfo> = {};
    const warnings: SceneWarning[] = [];
    for (const c of state.components) {
      const drawn = (DRAWN_COMPONENT_TYPES as readonly string[]).includes(c.componentType);
      const invisible = (INVISIBLE_COMPONENT_TYPES as readonly string[]).includes(c.componentType);
      components[c.componentId] = {
        componentId: c.componentId,
        componentType: c.componentType,
        supported: template !== null && (drawn || invisible),
        placeholders: [],
        anchors: {},
        boundaries: [],
      };
      if (template && !drawn && !invisible)
        warnings.push({
          code: 'UNSUPPORTED_COMPONENT',
          message: `${c.displayName} (${c.componentType.replaceAll('_', ' ')}) is not drawn in 2D yet.`,
          componentId: c.componentId,
        });
    }
    const emptyBounds = { x: 0, y: 0, width: 0, height: 0 };
    if (!template) {
      const unavailable = (view: View): ViewScene => ({
        view,
        available: false,
        reason: 'UNSUPPORTED_CATEGORY',
        bounds: emptyBounds,
        elements: [],
      });
      return {
        format: 'garment-render/1',
        coordinateSpace: 'design_2d',
        units: 'mm',
        category: state.garmentCategory,
        capability: 'G0',
        views: { front: unavailable('front'), back: unavailable('back') },
        components,
        patterns: [],
        warnings: [
          {
            code: 'UNSUPPORTED_CATEGORY',
            message: state.garmentCategory
              ? `No 2D template for “${state.garmentCategory}” yet.`
              : 'Choose a garment category to see the technical flat.',
            componentId: null,
          },
        ],
      };
    }

    const frame = buildFrame(state, template);
    const layoutKey = JSON.stringify(
      state.components.map((c) => [
        c.componentId,
        c.componentType,
        c.parentComponentId,
        c.side,
        c.visible,
      ]),
    );
    const fills = new FillResolver(state, options);
    const fillCache = new Map<string, string>();
    const fillOf = (c: DesignComponent) => {
      let f = fillCache.get(c.componentId);
      if (f === undefined) {
        f = fills.fillFor(c);
        fillCache.set(c.componentId, f);
      }
      return f;
    };
    const sorted = state.components
      .map((c, i) => ({ c, i }))
      .sort(
        (a, b) =>
          (ORDER.get(a.c.componentType) ?? 99) - (ORDER.get(b.c.componentType) ?? 99) || a.i - b.i,
      )
      .map((x) => x.c);

    const views = {} as Record<View, ViewScene>;
    for (const view of VIEWS) {
      if (!template.views.includes(view)) {
        views[view] = {
          view,
          available: false,
          reason: 'BACK_VIEW_NOT_AVAILABLE',
          bounds: emptyBounds,
          elements: [],
        };
        warnings.push({
          code: 'BACK_VIEW_NOT_AVAILABLE',
          message: `The ${view} view is not defined for this template.`,
          componentId: null,
        });
        continue;
      }
      const elements: SceneElement[] = [];
      const allPoints: Point[] = [];
      const targets = new Map<string, TrimTarget>();
      for (const c of sorted) {
        const { result, placeholders } = geometry(frame, layoutKey, view, c, state);
        const info = components[c.componentId]!;
        for (const p of [...(frame.placeholders.get(c.componentId) ?? []), ...placeholders])
          if (!info.placeholders.includes(p)) info.placeholders.push(p);
        if (!result) continue;
        info.anchors[view] = result.anchors;
        info.boundaries.push(...result.boundaries);
        const pts = result.parts.flatMap((p) => p.path.points);
        targets.set(c.componentId, {
          component: c,
          anchors: result.anchors,
          boundaries: result.boundaries,
          bounds: boundsOf(pts),
        });
        if (!c.visible && !options.includeHidden) continue;
        for (const part of result.parts) {
          elements.push({
            id: `${c.componentId}:${view}:${part.suffix}`,
            componentId: c.componentId,
            relationshipId: null,
            view,
            layer: part.layer,
            role: part.role,
            d: part.path.toString(),
            fill: part.fill === 'self' ? fillOf(c) : part.fill,
            label: c.displayName,
            text: part.text
              ? { x: part.text.at.x, y: part.text.at.y, value: part.text.value }
              : null,
          });
          allPoints.push(...part.path.points);
        }
      }
      const trims = renderTrims(state, view, targets, options);
      for (const { points, ...el } of trims.elements) {
        elements.push(el);
        allPoints.push(...points);
      }
      warnings.push(...trims.warnings);
      const b = boundsOf(allPoints);
      views[view] = {
        view,
        available: true,
        reason: null,
        bounds: unionBounds([
          {
            x: b.x - MARGIN,
            y: b.y - MARGIN,
            width: b.width + 2 * MARGIN,
            height: b.height + 2 * MARGIN,
          },
        ]),
        elements,
      };
    }
    for (const info of Object.values(components))
      if (info.placeholders.length) {
        const c = state.components.find((x) => x.componentId === info.componentId)!;
        warnings.push({
          code: 'PLACEHOLDER_GEOMETRY',
          message: `${c.displayName} is drawn with default ${info.placeholders.map((k) => (k.split('.')[1] ?? k).replaceAll('_', ' ')).join(', ')}.`,
          componentId: info.componentId,
        });
      }
    // Keep the cache to what this state uses (old entries would only grow memory).
    if (cache.size > 2000) cache = new Map();
    return {
      format: 'garment-render/1',
      coordinateSpace: 'design_2d',
      units: 'mm',
      category: state.garmentCategory,
      capability: 'G2',
      views,
      components,
      patterns: fills.definitions(),
      warnings,
    };
  }

  return {
    render,
    stats,
    clear: () => {
      cache = new Map();
    },
  };
}

/** One-off render (no memoization across calls). */
export function renderGarment(
  state: GarmentDesignState,
  options: RenderOptions & { includeHidden?: boolean } = {},
): Scene {
  return createRenderer().render(state, options);
}
