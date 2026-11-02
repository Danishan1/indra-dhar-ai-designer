'use client';

import { reconstructShapes } from '@ai-designer/design-ai';
import {
  type ComponentShape,
  type DesignComponent,
  shapePathD,
  type ShapePoint,
} from '@ai-designer/garment-model';
import { DownloadIcon, PenToolIcon, SplitSquareHorizontalIcon, UploadIcon } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { isEditableTarget } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

import { useEditor, useEditorStore } from '../store-context';

import { commitShapeChange } from './shape-sync';

type View = 'front' | 'back';
type Compare = 'off' | 'overlay' | 'side';

interface Placed {
  component: DesignComponent;
  index: number;
  shape: ComponentShape;
}

type Drag =
  | { kind: 'move'; start: { x: number; y: number }; orig: ComponentShape; target: Placed }
  | {
      kind: 'resize';
      handle: string;
      start: { x: number; y: number };
      orig: ComponentShape;
      target: Placed;
      keepRatio: boolean;
    }
  | { kind: 'rotate'; orig: ComponentShape; target: Placed }
  | {
      kind: 'point' | 'c1' | 'c2';
      i: number;
      orig: ComponentShape;
      target: Placed;
    };

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function colorOf(c: DesignComponent, shape: ComponentShape): string {
  if (shape.style.fill) return shape.style.fill;
  const v = c.properties['appearance.color']?.value;
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#f1f5f9';
}

/** Box-local (0–1) → mm, rotation applied. */
function toMm(s: ComponentShape, p: { x: number; y: number }) {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const a = (s.rotation * Math.PI) / 180;
  const dx = s.x + p.x * s.width - cx;
  const dy = s.y + p.y * s.height - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}
/** mm → box-local (0–1), undoing the rotation. */
function toLocal(s: ComponentShape, p: { x: number; y: number }) {
  const cx = s.x + s.width / 2;
  const cy = s.y + s.height / 2;
  const a = (-s.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const x = cx + dx * Math.cos(a) - dy * Math.sin(a);
  const y = cy + dx * Math.sin(a) + dy * Math.cos(a);
  return { x: (x - s.x) / s.width, y: (y - s.y) / s.height };
}

/**
 * The editable reconstruction (ADR-057): every component is a vector artifact you can select,
 * move, resize, rotate and reshape (points and curve handles). The uploaded original can be laid
 * under it or shown beside it for comparison. Each finished gesture is one design operation —
 * with the linked measurement and the dependent pattern pieces updated in the same undo step.
 */
export function ReconstructionCanvas() {
  const { active } = useOrganization();
  const store = useEditorStore();
  const state = useEditor((s) => s.display);
  const selected = useEditor((s) => s.selection.ids);
  const select = useEditor((s) => s.select);
  const clear = useEditor((s) => s.clearSelection);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const [view, setView] = useState<View>('front');
  const [compare, setCompare] = useState<Compare>('off');
  const [opacity, setOpacity] = useState(0.5);
  const [pointMode, setPointMode] = useState(false);
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    componentId: string;
    index: number;
    shape: ComponentShape;
  } | null>(null);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const placed: Placed[] = useMemo(() => {
    const out: Placed[] = [];
    for (const c of state.components) {
      if (!c.visible) continue;
      (c.shapes ?? []).forEach((shape, index) => {
        if (shape.view !== view) return;
        const p =
          preview && preview.componentId === c.componentId && preview.index === index
            ? preview.shape
            : shape;
        out.push({ component: c, index, shape: p });
      });
    }
    return out.sort((a, b) => a.shape.layer - b.shape.layer);
  }, [state.components, view, preview]);

  const source =
    (state.sources ?? []).find((s) => s.placement?.view === view) ??
    (state.sources ?? []).find((s) => s.role === 'sketch' || s.role === 'reference');
  const placement = source?.placement?.view === view ? source.placement : undefined;

  const bounds = useMemo(() => {
    const pts = placed.flatMap((p) => [
      toMm(p.shape, { x: 0, y: 0 }),
      toMm(p.shape, { x: 1, y: 0 }),
      toMm(p.shape, { x: 1, y: 1 }),
      toMm(p.shape, { x: 0, y: 1 }),
    ]);
    if (placement && compare === 'overlay')
      pts.push(
        { x: placement.x, y: placement.y },
        { x: placement.x + placement.width, y: placement.y + placement.height },
      );
    if (!pts.length) return { x: -400, y: -100, w: 800, h: 900 };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const pad = 60;
    return {
      x: x - pad,
      y: y - pad,
      w: Math.max(...xs) - x + pad * 2,
      h: Math.max(...ys) - y + pad * 2,
    };
  }, [placed, placement, compare]);

  const sel = placed.find((p) => selected.includes(p.component.componentId));
  const unit = bounds.w / 900; // ~1 screen px in mm for handle sizing

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  const start = (e: ReactPointerEvent, d: Drag) => {
    if (!canEdit || d.target.component.locked) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toSvg(e);
    const o = d.orig;
    let next: ComponentShape;
    if (d.kind === 'move') {
      next = { ...o, x: r1(o.x + p.x - d.start.x), y: r1(o.y + p.y - d.start.y) };
    } else if (d.kind === 'resize') {
      const local = toLocal(o, p);
      let x0 = 0;
      let y0 = 0;
      let x1 = 1;
      let y1 = 1;
      if (d.handle.includes('w')) x0 = Math.min(local.x, 0.95);
      if (d.handle.includes('e')) x1 = Math.max(local.x, 0.05);
      if (d.handle.includes('n')) y0 = Math.min(local.y, 0.95);
      if (d.handle.includes('s')) y1 = Math.max(local.y, 0.05);
      let w = (x1 - x0) * o.width;
      let h = (y1 - y0) * o.height;
      if (d.keepRatio && d.handle.length === 2) {
        const f = Math.max(w / o.width, h / o.height);
        w = o.width * f;
        h = o.height * f;
        if (d.handle.includes('w')) x0 = 1 - f;
        if (d.handle.includes('n')) y0 = 1 - f;
      }
      next = {
        ...o,
        x: r1(o.x + x0 * o.width),
        y: r1(o.y + y0 * o.height),
        width: r1(Math.max(2, w)),
        height: r1(Math.max(2, h)),
      };
    } else if (d.kind === 'rotate') {
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      next = { ...o, rotation: r1(((deg + 540) % 360) - 180) };
    } else {
      const l = toLocal(o, p);
      const pt = {
        x: r4(Math.min(1.5, Math.max(-0.5, l.x))),
        y: r4(Math.min(1.5, Math.max(-0.5, l.y))),
      };
      const path = o.path.map((q, i) => {
        if (i !== d.i) return q;
        if (d.kind === 'point') {
          const dx = pt.x - q.x;
          const dy = pt.y - q.y;
          return {
            ...pt,
            ...(q.c1 ? { c1: { x: r4(q.c1.x + dx), y: r4(q.c1.y + dy) } } : {}),
            ...(q.c2 ? { c2: { x: r4(q.c2.x + dx), y: r4(q.c2.y + dy) } } : {}),
          };
        }
        return { ...q, [d.kind]: pt };
      });
      next = { ...o, path };
    }
    setPreview({ componentId: d.target.component.componentId, index: d.target.index, shape: next });
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !preview) {
      setPreview(null);
      return;
    }
    const name = d.target.component.displayName.toLowerCase();
    const label =
      d.kind === 'move'
        ? `Move ${name}`
        : d.kind === 'resize'
          ? `Resize ${name}`
          : d.kind === 'rotate'
            ? `Rotate ${name}`
            : `Reshape ${name}`;
    const shape = { ...preview.shape, source: 'user' as const, confidence: null };
    setPreview(null);
    commitShapeChange(store, d.target.component.componentId, d.target.index, shape, label);
  };

  // Keyboard: arrows nudge (Shift = 10 mm), Delete removes the active point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel || !canEdit || sel.component.locked || isEditableTarget(e.target)) return;
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const m = moves[e.key];
      if (m) {
        e.preventDefault();
        commitShapeChange(
          store,
          sel.component.componentId,
          sel.index,
          {
            ...sel.shape,
            x: r1(sel.shape.x + m[0]),
            y: r1(sel.shape.y + m[1]),
            source: 'user',
            confidence: null,
          },
          `Move ${sel.component.displayName.toLowerCase()}`,
        );
      }
      if (
        pointMode &&
        activePoint !== null &&
        (e.key === 'Delete' || e.key === 'Backspace') &&
        sel.shape.path.length > 3
      ) {
        e.preventDefault();
        commitShapeChange(
          store,
          sel.component.componentId,
          sel.index,
          {
            ...sel.shape,
            path: sel.shape.path.filter((_, i) => i !== activePoint),
            source: 'user',
            confidence: null,
          },
          `Remove a point of ${sel.component.displayName.toLowerCase()}`,
        );
        setActivePoint(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, canEdit, pointMode, activePoint, store]);

  const addPoint = (e: React.MouseEvent, p: Placed) => {
    if (!pointMode || !canEdit) return;
    const l = toLocal(p.shape, toSvg(e));
    // insert after the nearest segment start
    let best = 0;
    let bestD = Infinity;
    const path = p.shape.path;
    for (let i = 0; i < path.length; i++) {
      const a = path[i]!;
      const b = path[(i + 1) % path.length]!;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((l.x - a.x) * (b.x - a.x) + (l.y - a.y) * (b.y - a.y)) /
            ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1),
        ),
      );
      const dd = Math.hypot(a.x + t * (b.x - a.x) - l.x, a.y + t * (b.y - a.y) - l.y);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    const np: ShapePoint = { x: r4(l.x), y: r4(l.y) };
    commitShapeChange(
      store,
      p.component.componentId,
      p.index,
      {
        ...p.shape,
        path: [...path.slice(0, best + 1), np, ...path.slice(best + 1)],
        source: 'user',
        confidence: null,
      },
      `Add a point to ${p.component.displayName.toLowerCase()}`,
    );
  };

  const toggleSmooth = (p: Placed, i: number) => {
    const path = p.shape.path;
    const q = path[i]!;
    const n = path.length;
    const prev = path[(i - 1 + n) % n]!;
    const nxt = path[(i + 1) % n]!;
    const smooth: ShapePoint =
      q.c1 || q.c2
        ? { x: q.x, y: q.y }
        : {
            x: q.x,
            y: q.y,
            c1: { x: r4(q.x - (nxt.x - prev.x) / 6), y: r4(q.y - (nxt.y - prev.y) / 6) },
            c2: { x: r4(q.x + (nxt.x - prev.x) / 6), y: r4(q.y + (nxt.y - prev.y) / 6) },
          };
    commitShapeChange(
      store,
      p.component.componentId,
      p.index,
      {
        ...p.shape,
        path: path.map((x, k) => (k === i ? smooth : x)),
        source: 'user',
        confidence: null,
      },
      `Curve a point of ${p.component.displayName.toLowerCase()}`,
    );
  };

  const exportSvg = () => {
    const body = placed
      .map(
        (p) =>
          `<path id="${p.component.componentId}" data-type="${p.component.componentType}" d="${shapePathD(p.shape)}" transform="rotate(${p.shape.rotation} ${p.shape.x + p.shape.width / 2} ${p.shape.y + p.shape.height / 2})" fill="${colorOf(p.component, p.shape)}" stroke="${p.shape.style.stroke}" stroke-width="1.5"><title>${p.component.displayName.replace(/[<&>"]/g, '')}</title></path>`,
      )
      .join('');
    download(
      `reconstruction-${view}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}" width="${Math.round(bounds.w)}mm" height="${Math.round(bounds.h)}mm">${body}</svg>`,
      'image/svg+xml',
    );
  };
  const exportJson = () => {
    const data = state.components
      .filter((c) => c.shapes?.length)
      .map((c) => ({
        componentId: c.componentId,
        name: c.displayName,
        type: c.componentType,
        shapes: c.shapes,
      }));
    download(
      'reconstruction.json',
      JSON.stringify({ format: 'ai-designer-shapes/1', units: 'mm', components: data }, null, 2),
      'application/json',
    );
  };
  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        components?: { componentId: string; shapes: ComponentShape[] }[];
      };
      const groupId = globalThis.crypto.randomUUID();
      let n = 0;
      for (const item of parsed.components ?? []) {
        if (!state.components.some((c) => c.componentId === item.componentId)) continue;
        if (
          store
            .getState()
            .apply(
              { type: 'set_component_shapes', componentId: item.componentId, shapes: item.shapes },
              { label: 'Import shapes', groupId },
            )
        )
          n++;
      }
      toast.info(`Imported shapes for ${n} component(s)`);
    } catch {
      /* invalid file: ignored */
    }
  };

  const shapeEls = (p: Placed, interactive: boolean) => {
    const s = p.shape;
    const isSel = selected.includes(p.component.componentId);
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    return (
      <g
        key={`${p.component.componentId}-${p.index}`}
        transform={`rotate(${s.rotation} ${cx} ${cy})`}
      >
        <path
          d={shapePathD(s)}
          fill={colorOf(p.component, s)}
          fillOpacity={s.style.opacity * (compare === 'overlay' ? 0.75 : 1)}
          stroke={isSel ? 'var(--color-primary, #2563eb)' : s.style.stroke}
          strokeWidth={(isSel ? 2.4 : 1.4) * unit}
          strokeDasharray={s.source === 'inferred' ? `${6 * unit} ${4 * unit}` : undefined}
          data-component-id={p.component.componentId}
          aria-label={p.component.displayName}
          role="button"
          className={cn(interactive && 'cursor-move')}
          onPointerDown={
            interactive
              ? (e) => {
                  select(p.component.componentId, e.shiftKey ? 'toggle' : 'replace');
                  if (!pointMode) start(e, { kind: 'move', start: toSvg(e), orig: s, target: p });
                }
              : undefined
          }
          onDoubleClick={interactive ? (e) => addPoint(e, p) : undefined}
        />
        {s.details.map((d, k) =>
          d.kind === 'button' ? (
            d.points.map((pt, j) => (
              <circle
                key={`${k}-${j}`}
                cx={s.x + pt.x * s.width}
                cy={s.y + pt.y * s.height}
                r={4}
                fill="#fff"
                stroke="#374151"
                strokeWidth={unit}
                pointerEvents="none"
              />
            ))
          ) : (
            <polyline
              key={k}
              points={d.points
                .map((pt) => `${s.x + pt.x * s.width},${s.y + pt.y * s.height}`)
                .join(' ')}
              fill="none"
              stroke="#374151"
              strokeWidth={unit}
              strokeDasharray={
                d.kind === 'stitch'
                  ? `${4 * unit} ${3 * unit}`
                  : d.kind === 'fold'
                    ? `${10 * unit} ${4 * unit}`
                    : undefined
              }
              pointerEvents="none"
            />
          ),
        )}
      </g>
    );
  };

  const handles = (p: Placed) => {
    const s = p.shape;
    const hs = 7 * unit;
    const local: Record<string, { x: number; y: number }> = {
      nw: { x: 0, y: 0 },
      n: { x: 0.5, y: 0 },
      ne: { x: 1, y: 0 },
      e: { x: 1, y: 0.5 },
      se: { x: 1, y: 1 },
      s: { x: 0.5, y: 1 },
      sw: { x: 0, y: 1 },
      w: { x: 0, y: 0.5 },
    };
    const cx = s.x + s.width / 2;
    const cy = s.y + s.height / 2;
    if (pointMode)
      return (
        <g transform={`rotate(${s.rotation} ${cx} ${cy})`} data-testid="point-handles">
          {s.path.map((q, i) => {
            const X = (v: number) => s.x + v * s.width;
            const Y = (v: number) => s.y + v * s.height;
            return (
              <g key={i}>
                {activePoint === i && q.c1 ? (
                  <>
                    <line
                      x1={X(q.x)}
                      y1={Y(q.y)}
                      x2={X(q.c1.x)}
                      y2={Y(q.c1.y)}
                      stroke="#2563eb"
                      strokeWidth={unit}
                    />
                    <circle
                      cx={X(q.c1.x)}
                      cy={Y(q.c1.y)}
                      r={hs / 1.6}
                      fill="#fff"
                      stroke="#2563eb"
                      strokeWidth={unit}
                      className="cursor-pointer"
                      onPointerDown={(e) => start(e, { kind: 'c1', i, orig: s, target: p })}
                    />
                  </>
                ) : null}
                {activePoint === i && q.c2 ? (
                  <>
                    <line
                      x1={X(q.x)}
                      y1={Y(q.y)}
                      x2={X(q.c2.x)}
                      y2={Y(q.c2.y)}
                      stroke="#2563eb"
                      strokeWidth={unit}
                    />
                    <circle
                      cx={X(q.c2.x)}
                      cy={Y(q.c2.y)}
                      r={hs / 1.6}
                      fill="#fff"
                      stroke="#2563eb"
                      strokeWidth={unit}
                      className="cursor-pointer"
                      onPointerDown={(e) => start(e, { kind: 'c2', i, orig: s, target: p })}
                    />
                  </>
                ) : null}
                <rect
                  x={X(q.x) - hs / 2}
                  y={Y(q.y) - hs / 2}
                  width={hs}
                  height={hs}
                  fill={activePoint === i ? '#2563eb' : '#fff'}
                  stroke="#2563eb"
                  strokeWidth={unit}
                  className="cursor-pointer"
                  data-testid="shape-point"
                  onPointerDown={(e) => {
                    setActivePoint(i);
                    start(e, { kind: 'point', i, orig: s, target: p });
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    toggleSmooth(p, i);
                  }}
                />
              </g>
            );
          })}
        </g>
      );
    return (
      <g transform={`rotate(${s.rotation} ${cx} ${cy})`} data-testid="shape-handles">
        <rect
          x={s.x}
          y={s.y}
          width={s.width}
          height={s.height}
          fill="none"
          stroke="#2563eb"
          strokeWidth={unit}
          strokeDasharray={`${4 * unit} ${3 * unit}`}
          pointerEvents="none"
        />
        <line x1={cx} y1={s.y} x2={cx} y2={s.y - 24 * unit} stroke="#2563eb" strokeWidth={unit} />
        <circle
          cx={cx}
          cy={s.y - 24 * unit}
          r={hs / 1.4}
          fill="#fff"
          stroke="#2563eb"
          strokeWidth={unit}
          className="cursor-grab"
          aria-label="Rotate"
          onPointerDown={(e) => start(e, { kind: 'rotate', orig: s, target: p })}
        />
        {HANDLES.map((h) => (
          <rect
            key={h}
            x={s.x + local[h]!.x * s.width - hs / 2}
            y={s.y + local[h]!.y * s.height - hs / 2}
            width={hs}
            height={hs}
            fill="#fff"
            stroke="#2563eb"
            strokeWidth={unit}
            data-testid={`handle-${h}`}
            className={cn(
              h === 'n' || h === 's'
                ? 'cursor-ns-resize'
                : h === 'e' || h === 'w'
                  ? 'cursor-ew-resize'
                  : h === 'nw' || h === 'se'
                    ? 'cursor-nwse-resize'
                    : 'cursor-nesw-resize',
            )}
            onPointerDown={(e) =>
              start(e, {
                kind: 'resize',
                handle: h,
                start: toSvg(e),
                orig: s,
                target: p,
                keepRatio: e.shiftKey,
              })
            }
          />
        ))}
      </g>
    );
  };

  const hasShapes = state.components.some((c) => c.shapes?.length);
  /** Shapes for a design started from a template (or blank): technical-flat geometry or boxes. */
  const createShapes = () => {
    const draft = structuredClone(state);
    reconstructShapes(draft, null);
    const groupId = globalThis.crypto.randomUUID();
    for (const c of draft.components)
      if (c.shapes?.length)
        store
          .getState()
          .apply(
            { type: 'set_component_shapes', componentId: c.componentId, shapes: c.shapes },
            { label: 'Create editable shapes', groupId },
          );
  };
  const img =
    placement && source ? (
      <image
        href={assetContentUrl(active.id, source.assetId, 'preview_1024')}
        x={placement.x}
        y={placement.y}
        width={placement.width}
        height={placement.height}
        preserveAspectRatio="none"
        opacity={compare === 'overlay' ? opacity : 1}
        pointerEvents="none"
      />
    ) : null;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col bg-muted/30"
      data-testid="reconstruction-view"
    >
      <div className="flex flex-wrap items-center gap-1 border-b bg-panel/95 px-2 py-1 text-xs">
        <div role="group" aria-label="Side" className="flex rounded-md border p-0.5">
          {(['front', 'back'] as const).map((v) => (
            <Button
              key={v}
              size="sm"
              variant="ghost"
              aria-pressed={view === v}
              className={cn('h-6 px-2 text-xs', view === v && 'bg-accent')}
              onClick={() => setView(v)}
            >
              {v === 'front' ? 'Front' : 'Back'}
            </Button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Compare with original"
          className="flex rounded-md border p-0.5"
        >
          {(['off', 'overlay', 'side'] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              variant="ghost"
              aria-pressed={compare === c}
              disabled={c !== 'off' && !source}
              className={cn('h-6 px-2 text-xs', compare === c && 'bg-accent')}
              onClick={() => setCompare(c)}
              data-testid={`compare-${c}`}
            >
              {c === 'off' ? (
                'Reconstruction'
              ) : c === 'overlay' ? (
                'Overlay original'
              ) : (
                <>
                  <SplitSquareHorizontalIcon className="size-3" /> Side by side
                </>
              )}
            </Button>
          ))}
        </div>
        {compare === 'overlay' ? (
          <label className="flex items-center gap-1">
            Original
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              aria-label="Original opacity"
            />
          </label>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={pointMode}
          className={cn('h-6 px-2 text-xs', pointMode && 'bg-accent')}
          onClick={() => {
            setPointMode((v) => !v);
            setActivePoint(null);
          }}
          disabled={!canEdit}
          data-testid="edit-points"
        >
          <PenToolIcon className="size-3" /> Edit points
        </Button>
        <span className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={exportSvg}
            disabled={!hasShapes}
          >
            <DownloadIcon className="size-3" /> SVG
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={exportJson}
            disabled={!hasShapes}
          >
            <DownloadIcon className="size-3" /> JSON
          </Button>
          {canEdit ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon className="size-3" /> Import
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importJson(f);
                  e.target.value = '';
                }}
              />
            </>
          ) : null}
        </span>
      </div>
      <div
        className={cn('grid min-h-0 flex-1', compare === 'side' ? 'grid-cols-2' : 'grid-cols-1')}
      >
        {compare === 'side' && source ? (
          <div
            className="flex min-h-0 items-center justify-center border-r p-4"
            data-testid="original-side"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- authorized API stream */}
            <img
              src={assetContentUrl(active.id, source.assetId, 'preview_1024')}
              alt="Original upload"
              className="max-h-full max-w-full rounded border bg-white object-contain"
            />
          </div>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
          className="h-full min-h-0 w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerDown={(e) => {
            if (e.target === svgRef.current) {
              clear();
              setActivePoint(null);
            }
          }}
          role="application"
          aria-label={`Editable reconstruction, ${view}`}
        >
          {compare === 'overlay' ? img : null}
          {placed.map((p) => shapeEls(p, true))}
          {sel ? handles(sel) : null}
        </svg>
      </div>
      {!hasShapes ? (
        <div className="absolute inset-x-0 top-1/2 flex flex-col items-center gap-2 text-center text-[13px] text-muted-foreground">
          <p>This design has no editable shapes yet.</p>
          {canEdit ? (
            <Button size="sm" onClick={createShapes} data-testid="create-shapes">
              Create editable shapes
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="border-t px-3 py-1 text-[11px] text-muted-foreground">
        Drag to move · handles resize (Shift keeps proportions) · top handle rotates · Edit points:
        drag points, double-click an edge to add one, double-click a point to curve it, Delete
        removes it · dashed outlines are AI guesses
      </p>
    </div>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
