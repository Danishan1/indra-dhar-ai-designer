'use client';

import { type Bounds, panBy, type Viewport, zoomBy } from '@ai-designer/editor-core';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import {
  createRenderer,
  elementsOn,
  LAYERS,
  layoutViews,
  type Renderer,
  type Scene,
} from '@ai-designer/garment-render';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useArtifactRenderData } from '../canvas/artifact-render-info';
import { PatternDefs, SceneElementPath } from '../canvas/scene-svg';

/** Renders a design state with its own renderer (a revision is not the store's display state). */
export function useRenderedScene(orgId: string, state: GarmentDesignState | null): Scene | null {
  const [renderer] = useState<Renderer>(() => createRenderer());
  const empty = useMemo(() => ({ components: [], relationships: [] }) as never, []);
  const { resolvers } = useArtifactRenderData(orgId, state ?? empty);
  return useMemo(
    () => (state ? renderer.render(state, resolvers) : null),
    [renderer, state, resolvers],
  );
}

/** Content bounds of a scene laid out side by side (front + back). */
export const sceneBounds = (scene: Scene): Bounds => layoutViews(scene, 'split').bounds;

const ALL_LAYERS = new Set(LAYERS);

/**
 * One technical flat as an SVG layer (front + back). Pattern ids are prefixed so two flats can
 * share a page; `highlight` outlines changed components by their stable ids (FR-EDT-095).
 */
export function FlatSvg({
  scene,
  viewport,
  prefix,
  highlight,
  highlightColor = 'var(--color-status-needs-review, #d97706)',
  opacity = 1,
  label,
  testId,
}: {
  scene: Scene;
  viewport: Viewport;
  prefix: string;
  highlight?: ReadonlySet<string>;
  highlightColor?: string;
  opacity?: number;
  label: string;
  testId?: string;
}) {
  const { placements } = useMemo(() => layoutViews(scene, 'split'), [scene]);
  const patterns = useMemo(
    () => scene.patterns.map((p) => ({ ...p, id: `${prefix}-${p.id}` })),
    [scene, prefix],
  );
  const groups = useMemo(
    () =>
      placements.map((p) => ({
        ...p,
        elements: elementsOn(scene, p.view, ALL_LAYERS).map((e) =>
          e.fill.startsWith('url(#') ? { ...e, fill: `url(#${prefix}-${e.fill.slice(5)}` } : e,
        ),
      })),
    [placements, scene, prefix],
  );
  return (
    <svg
      className="absolute inset-0 size-full"
      role="img"
      aria-label={label}
      data-testid={testId}
      style={{ opacity }}
    >
      <PatternDefs patterns={patterns} />
      <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
        {groups.map((g) => (
          <g key={g.view} transform={g.dx ? `translate(${g.dx} 0)` : undefined}>
            {g.elements.map((e) => (
              <SceneElementPath key={e.id} e={e} />
            ))}
            {highlight?.size ? (
              <g pointerEvents="none">
                {g.elements
                  .filter((e) => e.componentId && highlight.has(e.componentId))
                  .map((e) => (
                    <path
                      key={`hl-${e.id}`}
                      d={e.d}
                      data-changed-component={e.componentId ?? undefined}
                      fill={e.role === 'panel' ? highlightColor : 'none'}
                      fillOpacity={0.15}
                      stroke={highlightColor}
                      strokeWidth={2.2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              </g>
            ) : null}
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * A pannable/zoomable area; every pane rendered with the same `viewport` stays in sync (the
 * camera is view state — never a design difference, FR-RV-186).
 */
export function PanZoomArea({
  viewport,
  onViewport,
  onSize,
  children,
  className,
  testId,
}: {
  viewport: Viewport;
  onViewport: (v: Viewport) => void;
  onSize?: (size: { width: number; height: number }) => void;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; v: Viewport } | null>(null);
  const latest = useRef({ viewport, onViewport, onSize });
  latest.current = { viewport, onViewport, onSize };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { viewport: v, onViewport: set } = latest.current;
      if (e.shiftKey) return set(panBy(v, -e.deltaY, 0));
      const rect = el.getBoundingClientRect();
      set(
        zoomBy(v, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        }),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(() =>
      onSize?.({ width: el.clientWidth, height: el.clientHeight }),
    );
    ro.observe(el);
    latest.current.onSize?.({ width: el.clientWidth, height: el.clientHeight });
    return () => {
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-testid={testId}
      className={`relative min-h-0 touch-none overflow-hidden bg-viewport select-none ${className ?? ''}`}
      style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v: viewport };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        onViewport({ ...d.v, panX: d.v.panX + e.clientX - d.x, panY: d.v.panY + e.clientY - d.y });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {children}
    </div>
  );
}
