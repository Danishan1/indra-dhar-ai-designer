'use client';

import { panBy, zoomBy, zoomLabel } from '@ai-designer/editor-core';
import { elementsOn, layoutViews, type SceneElement } from '@ai-designer/garment-render';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isEditableTarget } from '@/lib/shortcuts';

import { useEditor, useEditorStore } from '../store-context';

import { CapabilityBadge } from './capability-badge';
import { componentIdFromTarget, selectModeFor } from './hit-test';
import { useScene } from './scene-context';
import { PatternDefs, SceneElementPath } from './scene-svg';
import { ViewTabs } from './view-tabs';

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  panX: number;
  panY: number;
  moved: boolean;
  panning: boolean;
}

/**
 * The 2D viewport (I16): renders the scene with zoom/pan from the editor store (view state only —
 * never written to the design, FR-EDT-010…013), selects components by their stable id on click,
 * highlights hover and selection in an overlay that does not alter the drawing (FR-EDT-021).
 */
export function GarmentCanvas() {
  const store = useEditorStore();
  const scene = useScene();
  const viewMode = useEditor((s) => s.viewMode);
  const layers = useEditor((s) => s.layers);
  const viewport = useEditor((s) => s.viewport);
  const tool = useEditor((s) => s.tool.active);
  const selected = useEditor((s) => s.selection.ids);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const { placements, bounds } = useMemo(() => layoutViews(scene, viewMode), [scene, viewMode]);
  const visible = useMemo(
    () => new Set((Object.keys(layers) as (keyof typeof layers)[]).filter((k) => layers[k])),
    [layers],
  );
  const groups = useMemo(
    () =>
      placements.map((p) => ({
        ...p,
        elements: elementsOn(scene, p.view, visible),
        bounds: scene.views[p.view].bounds,
      })),
    [placements, scene, visible],
  );

  // Report size and content to the store (first report fits the garment to the view).
  const content = placements.length ? bounds : null;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () =>
      store.getState().setCanvas({ width: el.clientWidth, height: el.clientHeight }, content);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [store, content]);

  // Wheel / pinch zoom around the pointer; Shift+wheel pans. Needs a non-passive listener.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = store.getState();
      if (e.shiftKey) {
        s.setViewport(panBy(s.viewport, -e.deltaY, 0));
        return;
      }
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      s.setViewport(
        zoomBy(s.viewport, factor, { x: e.clientX - rect.left, y: e.clientY - rect.top }),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [store]);

  // Hold Space to pan (not while typing).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isEditableTarget(e.target)) {
        e.preventDefault();
        store.getState().holdTool('pan');
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') store.getState().releaseTool();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [store]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const v = store.getState().viewport;
    const panning = tool === 'pan' || e.button === 1;
    drag.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      panX: v.panX,
      panY: v.panY,
      moved: false,
      panning,
    };
    if (panning) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d && d.pointerId === e.pointerId) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (d.panning) {
        const v = store.getState().viewport;
        store.getState().setViewport({ ...v, panX: d.panX + dx, panY: d.panY + dy });
        return;
      }
    }
    const id = componentIdFromTarget(e.target);
    if (id !== hovered) setHovered(id);
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.pointerId !== e.pointerId || d.panning || d.moved || e.button !== 0) return;
    const id = componentIdFromTarget(e.target);
    if (id) store.getState().select(id, selectModeFor(e));
    else store.getState().clearSelection();
  };

  const highlight = (e: SceneElement) =>
    selected.includes(e.componentId ?? '') || e.componentId === hovered;
  const unavailable = placements.length === 0;
  const cursor = tool === 'pan' ? (drag.current?.panning ? 'grabbing' : 'grab') : 'default';

  return (
    <div
      ref={ref}
      data-testid="garment-canvas"
      className="relative size-full touch-none overflow-hidden select-none"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHovered(null)}
    >
      <svg
        className="absolute inset-0 size-full"
        role="img"
        aria-label={`Technical flat, ${viewMode} view`}
        data-view-mode={viewMode}
      >
        <PatternDefs patterns={scene.patterns} />
        <g transform={`translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`}>
          {groups.map((g) => (
            <g
              key={g.view}
              data-view={g.view}
              transform={g.dx ? `translate(${g.dx} 0)` : undefined}
            >
              {g.elements.map((e) => (
                <SceneElementPath key={e.id} e={e} />
              ))}
              {viewMode === 'split' ? (
                <text
                  x={g.bounds.x + g.bounds.width / 2}
                  y={g.bounds.y + g.bounds.height + 6}
                  fontSize={14 / Math.max(0.4, viewport.zoom) / 1.6}
                  textAnchor="middle"
                  className="fill-muted-foreground uppercase"
                  pointerEvents="none"
                >
                  {g.view}
                </text>
              ) : null}
              {/* Hover / selection overlay: never part of the drawing (FR-EDT-021). */}
              <g pointerEvents="none">
                {g.elements.filter(highlight).map((e) => {
                  const isSelected = selected.includes(e.componentId ?? '');
                  return (
                    <path
                      key={`hl-${e.id}`}
                      d={e.d}
                      data-highlight={isSelected ? 'selected' : 'hover'}
                      data-component-id-highlight={e.componentId ?? undefined}
                      fill={isSelected && e.role === 'panel' ? 'var(--color-primary)' : 'none'}
                      fillOpacity={0.12}
                      stroke="var(--color-primary)"
                      strokeOpacity={isSelected ? 1 : 0.55}
                      strokeWidth={isSelected ? 2.2 : 1.6}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
            </g>
          ))}
        </g>
      </svg>
      {unavailable ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-sm rounded-md border bg-panel/90 px-3 py-2 text-center text-[13px] text-muted-foreground">
            {scene.warnings[0]?.message ?? 'Nothing to draw for this view.'}
          </p>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        <div className="pointer-events-auto">
          <ViewTabs />
        </div>
        <div className="pointer-events-auto">
          <CapabilityBadge />
        </div>
      </div>
      <ZoomControls label={zoomLabel(viewport)} />
      <ScaleHint zoom={viewport.zoom} />
    </div>
  );
}

function ZoomControls({ label }: { label: string }) {
  const zoomIn = useEditor((s) => s.zoomIn);
  const zoomOut = useEditor((s) => s.zoomOut);
  const fit = useEditor((s) => s.fitToView);
  const reset = useEditor((s) => s.zoomReset);
  const btn = (aria: string, combo: string, onClick: () => void, icon: ReactNode) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6"
          aria-label={aria}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {aria} ({combo})
      </TooltipContent>
    </Tooltip>
  );
  return (
    <div className="absolute right-2 bottom-2 flex items-center gap-0.5 rounded-md border bg-panel/95 p-0.5 shadow-sm">
      {btn('Zoom out', '-', zoomOut, <MinusIcon />)}
      <button
        type="button"
        className="min-w-11 rounded px-1 text-center text-[11px] tabular-nums hover:bg-accent"
        aria-label="Zoom to 100%"
        title="Zoom to 100% (Shift+0)"
        onClick={reset}
        data-testid="zoom-level"
      >
        {label}
      </button>
      {btn('Zoom in', '+', zoomIn, <PlusIcon />)}
      {btn('Fit to view', 'Shift+1', fit, <MaximizeIcon />)}
    </div>
  );
}

/** A 100 mm scale bar (the drawing is in millimetres). */
function ScaleHint({ zoom }: { zoom: number }) {
  const px = 100 * zoom;
  if (px < 20 || px > 400) return null;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col items-start text-[10px] text-muted-foreground">
      <div className="h-1.5 border-x border-b border-current" style={{ width: px }} />
      <span>100 mm</span>
    </div>
  );
}
