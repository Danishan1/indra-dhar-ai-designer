'use client';

import type { PatternPiece } from '@ai-designer/garment-model';
import {
  type CutLine,
  deleteNodes,
  ensurePath,
  insertNode,
  moveHandle,
  moveNodes,
  nearestOnPath,
  layoutCanvas,
  pieceBounds,
  spreadPiece,
  withPath,
} from '@ai-designer/pattern-model';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '@/lib/utils';

import { fmt, type Unit } from '../options';

import { PieceVector } from './piece-vector';

/**
 * CAD canvas for flat patterns (ADR-059): real-scale rulers and grid, zoom to true size (1:1,
 * calibrated), snapping to grid and points, and tools — select/move, direct point & curve editing,
 * measure, lengthen and widen across a line. Everything is in millimetres; edits are committed once
 * per gesture through `onCommit` (one undo step).
 */

export type CadTool = 'select' | 'point' | 'measure' | 'lengthen' | 'widen' | 'pan';

export interface CadSettings {
  snapGrid: boolean;
  snapPoints: boolean;
  showGrid: boolean;
  showAllowance: boolean;
  /** Seam names and lengths on every piece (otherwise only the selected one). */
  showDimensions: boolean;
  /** Screen pixels per millimetre at 100 % (calibration). */
  pxPerMm: number;
}

export interface CadApi {
  zoomTo(level: 'fit' | 'actual' | 'in' | 'out'): void;
}

const RULER = 22;
const STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

type Pt = { x: number; y: number };

function autoLayout(pieces: readonly PatternPiece[]): Map<string, Pt> {
  return layoutCanvas(pieces);
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move-piece'; piece: PatternPiece; start: Pt; origin: Pt }
  | { kind: 'nodes'; piece: PatternPiece; start: Pt; indices: number[]; anchor: Pt }
  | { kind: 'handle'; piece: PatternPiece; index: number; which: 'in' | 'out' }
  | { kind: 'box'; piece: PatternPiece; start: Pt; end: Pt; add: boolean }
  | { kind: 'spread'; piece: PatternPiece; line: CutLine; start: Pt };

export function PatternCad({
  pieces,
  unit,
  editable,
  tool,
  onTool,
  settings,
  selectedId,
  onSelect,
  nodes,
  onNodes,
  onCommit,
  apiRef,
  overlay,
}: {
  pieces: readonly PatternPiece[];
  unit: Unit;
  editable: boolean;
  tool: CadTool;
  onTool: (t: CadTool) => void;
  settings: CadSettings;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  nodes: readonly number[];
  onNodes: (n: number[]) => void;
  onCommit: (piece: PatternPiece, label: string, group?: string) => void;
  apiRef?: React.RefObject<CadApi | null>;
  overlay?: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<{ z: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PatternPiece | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snapMark, setSnapMark] = useState<Pt | null>(null);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt | null } | null>(null);
  const [spread, setSpread] = useState<{ pieceId: string; line: CutLine; amount: number } | null>(
    null,
  );
  const [space, setSpace] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const nudgeGroup = useRef<{ id: string; at: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e)
        setSize({
          w: Math.max(100, e.contentRect.width - RULER),
          h: Math.max(100, e.contentRect.height - RULER),
        });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => autoLayout(pieces), [pieces]);
  const shown = useMemo(
    () => pieces.map((p) => (draft && p.pieceId === draft.pieceId ? draft : p)),
    [pieces, draft],
  );
  const offset = useCallback(
    (p: PatternPiece): Pt =>
      draft && draft.pieceId === p.pieceId && draft.canvas
        ? draft.canvas
        : (layout.get(p.pieceId) ?? { x: 0, y: 0 }),
    [layout, draft],
  );

  const extent = useMemo(() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of pieces) {
      const o = layout.get(p.pieceId) ?? { x: 0, y: 0 };
      const b = pieceBounds(p);
      x0 = Math.min(x0, b.x + o.x);
      y0 = Math.min(y0, b.y + o.y);
      x1 = Math.max(x1, b.x + b.width + o.x);
      y1 = Math.max(y1, b.y + b.height + o.y);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1000, y1: 800 };
  }, [pieces, layout]);

  const fit = useCallback(() => {
    const pad = 60;
    const z = Math.min(
      size.w / (extent.x1 - extent.x0 + pad * 2),
      size.h / (extent.y1 - extent.y0 + pad * 2),
    );
    setView({
      z,
      x: extent.x0 - pad - (size.w / z - (extent.x1 - extent.x0 + pad * 2)) / 2,
      y: extent.y0 - pad,
    });
  }, [extent, size]);

  useEffect(() => {
    if (!view && pieces.length) fit();
  }, [view, pieces.length, fit]);

  const v = view ?? { z: 1, x: 0, y: 0 };
  const zoomAt = useCallback(
    (factor: number, at?: Pt) => {
      setView((cur) => {
        const c = cur ?? v;
        const z = Math.min(80, Math.max(0.05, c.z * factor));
        const cx = at?.x ?? c.x + size.w / c.z / 2;
        const cy = at?.y ?? c.y + size.h / c.z / 2;
        return { z, x: cx - (cx - c.x) * (c.z / z), y: cy - (cy - c.y) * (c.z / z) };
      });
    },
    [size, v],
  );

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      zoomTo: (level) => {
        if (level === 'fit') fit();
        else if (level === 'in') zoomAt(1.25);
        else if (level === 'out') zoomAt(0.8);
        else zoomAt(settings.pxPerMm / v.z);
      },
    };
  }, [apiRef, fit, zoomAt, settings.pxPerMm, v.z]);

  const toMm = useCallback(
    (e: { clientX: number; clientY: number }): Pt => {
      const r = svgRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: v.x + (e.clientX - r.left) / v.z, y: v.y + (e.clientY - r.top) / v.z };
    },
    [v],
  );

  // Grid step: the smallest step that is at least 8 px on screen.
  const step = STEPS.find((s) => s * v.z >= 8) ?? 1000;
  const major = step * (STEPS.indexOf(step) % 3 === 1 ? 5 : 10) >= 10 ? step * 10 : step * 5;

  /** Snap a canvas point (mm): other pieces' nodes and this piece's nodes, then the grid. */
  const snap = useCallback(
    (
      p: Pt,
      opts: { exclude?: { pieceId: string; nodes: Set<number> } } = {},
    ): { p: Pt; snapped: boolean } => {
      const tol = 8 / v.z;
      if (settings.snapPoints) {
        let best: Pt | null = null;
        let bd = tol;
        for (const piece of shown) {
          const o = offset(piece);
          const path = piece.path ?? [];
          path.forEach((nd, i) => {
            if (opts.exclude && opts.exclude.pieceId === piece.pieceId && opts.exclude.nodes.has(i))
              return;
            const q = { x: nd.x + o.x, y: nd.y + o.y };
            const d = Math.hypot(q.x - p.x, q.y - p.y);
            if (d < bd) {
              bd = d;
              best = q;
            }
          });
        }
        if (best) return { p: best, snapped: true };
      }
      if (settings.snapGrid) {
        const g = step < 1 ? 1 : step;
        return { p: { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g }, snapped: true };
      }
      return { p, snapped: false };
    },
    [shown, offset, settings.snapGrid, settings.snapPoints, step, v.z],
  );

  const constrain = (from: Pt, to: Pt, on: boolean): Pt => {
    if (!on) return to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const L = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(a) * L, y: from.y + Math.sin(a) * L };
  };

  const selected = shown.find((p) => p.pieceId === selectedId) ?? null;
  const selectedPath = useMemo(() => (selected ? ensurePath(selected) : null), [selected]);

  // ── pointer handling ──
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    wrap.current?.focus();
    const p = toMm(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (tool === 'pan' || space || e.button === 1) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      return;
    }
    const target = e.target as Element;
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null;
    const piece = pieceId ? (shown.find((x) => x.pieceId === pieceId) ?? null) : null;
    if (tool === 'measure') {
      const s = snap(p).p;
      setMeasure((m) => (!m || m.b ? { a: s, b: null } : { a: m.a, b: s }));
      return;
    }
    if ((tool === 'lengthen' || tool === 'widen') && editable) {
      const target2 = piece ?? selected;
      if (!target2) return;
      const o = offset(target2);
      const local = { x: p.x - o.x, y: p.y - o.y };
      const line: CutLine =
        tool === 'lengthen'
          ? { point: local, dir: { x: 1, y: 0 } }
          : { point: local, dir: { x: 0, y: 1 } };
      onSelect(target2.pieceId);
      gesture.current = { kind: 'spread', piece: target2, line, start: p };
      setSpread({ pieceId: target2.pieceId, line, amount: 0 });
      return;
    }
    if (!piece) {
      if (tool === 'point' && selected && editable) {
        gesture.current = { kind: 'box', piece: selected, start: p, end: p, add: e.shiftKey };
        return;
      }
      onSelect(null);
      onNodes([]);
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      return;
    }
    if (piece.pieceId !== selectedId) {
      onSelect(piece.pieceId);
      onNodes([]);
    }
    if (editable && tool === 'select')
      gesture.current = { kind: 'move-piece', piece, start: p, origin: offset(piece) };
    else if (editable && tool === 'point') {
      // Click on the outline body with the point tool: start a box selection.
      gesture.current = { kind: 'box', piece, start: p, end: p, add: e.shiftKey };
    }
  };

  const onNodeDown = (e: ReactPointerEvent, piece: PatternPiece, index: number) => {
    if (!editable || tool === 'measure' || tool === 'pan') return;
    e.stopPropagation();
    wrap.current?.focus();
    svgRef.current?.setPointerCapture(e.pointerId);
    const sel = e.shiftKey
      ? nodes.includes(index)
        ? nodes.filter((n) => n !== index)
        : [...nodes, index]
      : nodes.includes(index)
        ? [...nodes]
        : [index];
    onNodes(sel);
    const path = ensurePath(piece);
    const o = offset(piece);
    gesture.current = {
      kind: 'nodes',
      piece,
      start: toMm(e),
      indices: sel,
      anchor: { x: path[index]!.x + o.x, y: path[index]!.y + o.y },
    };
  };

  const onHandleDown = (
    e: ReactPointerEvent,
    piece: PatternPiece,
    index: number,
    which: 'in' | 'out',
  ) => {
    if (!editable) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'handle', piece, index, which };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = toMm(e);
    setCursor(p);
    const g = gesture.current;
    if (tool === 'measure' && measure && !measure.b)
      setSnapMark(snap(p).snapped ? snap(p).p : null);
    if (!g) return;
    if (g.kind === 'pan') {
      setView({ z: v.z, x: g.vx - (e.clientX - g.sx) / v.z, y: g.vy - (e.clientY - g.sy) / v.z });
      return;
    }
    if (g.kind === 'move-piece') {
      const to = constrain(g.start, p, e.shiftKey);
      setDraft({
        ...g.piece,
        canvas: {
          x: Math.round(g.origin.x + to.x - g.start.x),
          y: Math.round(g.origin.y + to.y - g.start.y),
        },
      });
      return;
    }
    if (g.kind === 'nodes') {
      const want = constrain(
        g.anchor,
        { x: g.anchor.x + p.x - g.start.x, y: g.anchor.y + p.y - g.start.y },
        e.shiftKey,
      );
      const s = e.altKey
        ? { p: want, snapped: false }
        : snap(want, { exclude: { pieceId: g.piece.pieceId, nodes: new Set(g.indices) } });
      setSnapMark(s.snapped ? s.p : null);
      const dx = Math.round((s.p.x - g.anchor.x) * 10) / 10;
      const dy = Math.round((s.p.y - g.anchor.y) * 10) / 10;
      setDraft(withPath(g.piece, moveNodes(ensurePath(g.piece), g.indices, dx, dy)));
      return;
    }
    if (g.kind === 'handle') {
      const o = offset(g.piece);
      setDraft(
        withPath(
          g.piece,
          moveHandle(ensurePath(g.piece), g.index, g.which, { x: p.x - o.x, y: p.y - o.y }),
        ),
      );
      return;
    }
    if (g.kind === 'box') {
      gesture.current = { ...g, end: p };
      setDraft(null);
      setSnapMark(null);
      return;
    }
    if (g.kind === 'spread') {
      const nrm = { x: -g.line.dir.y, y: g.line.dir.x };
      const amount =
        Math.round(
          ((p.x - g.start.x) * nrm.x + (p.y - g.start.y) * nrm.y) * (settings.snapGrid ? 1 : 10),
        ) / (settings.snapGrid ? 1 : 10);
      setSpread({ pieceId: g.piece.pieceId, line: g.line, amount });
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setSnapMark(null);
    if (!g) return;
    if (g.kind === 'move-piece' && draft?.canvas)
      onCommit({ ...g.piece, canvas: draft.canvas }, `Move ${g.piece.name}`);
    else if ((g.kind === 'nodes' || g.kind === 'handle') && draft)
      onCommit(
        draft,
        g.kind === 'nodes'
          ? `Move ${g.indices.length > 1 ? `${g.indices.length} points` : 'a point'} of ${draft.name}`
          : `Shape a curve of ${draft.name}`,
      );
    else if (g.kind === 'box') {
      const o = offset(g.piece);
      const x0 = Math.min(g.start.x, g.end.x) - o.x;
      const x1 = Math.max(g.start.x, g.end.x) - o.x;
      const y0 = Math.min(g.start.y, g.end.y) - o.y;
      const y1 = Math.max(g.start.y, g.end.y) - o.y;
      const hit = ensurePath(g.piece)
        .map((nd, i) => (nd.x >= x0 && nd.x <= x1 && nd.y >= y0 && nd.y <= y1 ? i : -1))
        .filter((i) => i >= 0);
      onNodes(g.add ? [...new Set([...nodes, ...hit])] : hit);
    }
    setDraft(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!editable || tool !== 'point' || !selected || !selectedPath) return;
    const o = offset(selected);
    const p = toMm(e);
    const near = nearestOnPath(selectedPath, { x: p.x - o.x, y: p.y - o.y });
    if (near.d * v.z > 10) return;
    const next = insertNode(selectedPath, near.seg, near.t);
    onCommit(withPath(selected, next), `Add a point to ${selected.name}`);
    onNodes([near.seg + 1]);
  };

  const applySpread = useCallback(() => {
    if (!spread) return;
    const piece = pieces.find((p) => p.pieceId === spread.pieceId);
    if (piece && Math.abs(spread.amount) >= 0.1)
      onCommit(
        spreadPiece(piece, spread.line, spread.amount),
        `${spread.line.dir.x ? 'Lengthen' : 'Widen'} ${piece.name} by ${fmt(Math.abs(spread.amount), unit)} ${unit}`,
      );
    setSpread(null);
  }, [spread, pieces, onCommit, unit]);

  // ── keyboard ──
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.ctrlKey || e.metaKey) return; // undo/redo/save stay global
    const k = e.key.toLowerCase();
    const map: Record<string, CadTool> = {
      v: 'select',
      a: 'point',
      m: 'measure',
      l: 'lengthen',
      w: 'widen',
      h: 'pan',
    };
    if (map[k] && !e.altKey) {
      onTool(map[k]!);
      setMeasure(null);
      setSpread(null);
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (k === ' ') {
      setSpace(true);
      e.preventDefault();
      return;
    }
    if (k === 'escape') {
      setMeasure(null);
      setSpread(null);
      onNodes([]);
      e.stopPropagation();
      return;
    }
    if (k === 'enter' && spread) {
      applySpread();
      e.stopPropagation();
      return;
    }
    if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-') zoomAt(0.8);
    else if (k === '0') fit();
    else if (k === '1') zoomAt(settings.pxPerMm / v.z);
    else if ((k === 'delete' || k === 'backspace') && editable && selected && nodes.length) {
      onCommit(
        withPath(selected, deleteNodes(ensurePath(selected), nodes)),
        `Delete ${nodes.length} point${nodes.length > 1 ? 's' : ''} of ${selected.name}`,
      );
      onNodes([]);
    } else if (k.startsWith('arrow') && editable && selected) {
      const d = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0;
      const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
      const now = Date.now();
      if (!nudgeGroup.current || now - nudgeGroup.current.at > 1200)
        nudgeGroup.current = { id: crypto.randomUUID(), at: now };
      nudgeGroup.current.at = now;
      if (nodes.length)
        onCommit(
          withPath(selected, moveNodes(ensurePath(selected), nodes, dx, dy)),
          `Nudge points of ${selected.name}`,
          nudgeGroup.current.id,
        );
      else {
        const o = offset(selected);
        onCommit(
          { ...selected, canvas: { x: o.x + dx, y: o.y + dy } },
          `Move ${selected.name}`,
          nudgeGroup.current.id,
        );
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // ── render helpers ──
  const sw = (px: number) => px; // with vector-effect the width is in screen px
  const fs = 12 / v.z;
  const visible = { x0: v.x, y0: v.y, x1: v.x + size.w / v.z, y1: v.y + size.h / v.z };
  const gridLines = useMemo(() => {
    if (!settings.showGrid || !view)
      return [] as { x1: number; y1: number; x2: number; y2: number; major: boolean }[];
    const out: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    const s = step < 1 ? 1 : step;
    for (let x = Math.ceil(visible.x0 / s) * s; x <= visible.x1 && out.length < 600; x += s)
      out.push({
        x1: x,
        y1: visible.y0,
        x2: x,
        y2: visible.y1,
        major: Math.abs(x / major - Math.round(x / major)) < 1e-6,
      });
    for (let y = Math.ceil(visible.y0 / s) * s; y <= visible.y1 && out.length < 1200; y += s)
      out.push({
        x1: visible.x0,
        y1: y,
        x2: visible.x1,
        y2: y,
        major: Math.abs(y / major - Math.round(y / major)) < 1e-6,
      });
    return out;
  }, [settings.showGrid, view, step, major, visible.x0, visible.x1, visible.y0, visible.y1]);

  const spreadPreview = useMemo(() => {
    if (!spread) return null;
    const piece = pieces.find((p) => p.pieceId === spread.pieceId);
    return piece ? spreadPiece(piece, spread.line, spread.amount) : null;
  }, [spread, pieces]);

  const box = gesture.current?.kind === 'box' ? gesture.current : null;
  const cursorLabel = cursor ? `X ${fmt(cursor.x, unit)}  Y ${fmt(cursor.y, unit)} ${unit}` : '';
  const zoomPct = Math.round((v.z / settings.pxPerMm) * 100);

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && setSpace(false)}
      className="relative h-full min-h-0 w-full overflow-hidden bg-white outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-testid="pattern-cad"
      data-zoom={zoomPct}
    >
      <Rulers v={v} size={size} unit={unit} cursor={cursor} />
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={`${v.x} ${v.y} ${size.w / v.z} ${size.h / v.z}`}
        className={cn(
          'absolute touch-none select-none',
          tool === 'pan' || space
            ? 'cursor-grab'
            : tool === 'measure' || tool === 'lengthen' || tool === 'widen'
              ? 'cursor-crosshair'
              : 'cursor-default',
        )}
        style={{ left: RULER, top: RULER }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={onDoubleClick}
        onWheel={(e) => zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, toMm(e))}
        role="img"
        aria-label="Pattern pieces (CAD)"
        data-testid="pattern-canvas"
      >
        {gridLines.map(({ major: isMajor, ...l }, i) => (
          <line
            key={i}
            {...l}
            stroke={isMajor ? '#d6dde8' : '#eef2f7'}
            strokeWidth={sw(1)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {shown.map((p) => {
          const o = offset(p);
          const isSel = p.pieceId === selectedId;
          const show = spreadPreview && spreadPreview.pieceId === p.pieceId ? spreadPreview : p;
          return (
            <g
              key={p.pieceId}
              transform={`translate(${o.x} ${o.y})`}
              data-piece-id={p.pieceId}
              data-piece-name={p.name}
              data-testid="pattern-piece"
            >
              <PieceVector
                piece={show}
                selected={isSel}
                k={1 / v.z}
                unit={unit}
                showAllowance={settings.showAllowance}
                detailed={isSel || settings.showDimensions}
                fs={fs}
              />
            </g>
          );
        })}
        {/* Nodes and handles of the selected piece. */}
        {selected && selectedPath && editable && (tool === 'point' || tool === 'select') ? (
          <g
            transform={`translate(${offset(selected).x} ${offset(selected).y})`}
            data-testid="node-layer"
          >
            {selectedPath.map((nd, i) => {
              const sel = nodes.includes(i);
              const r = (sel ? 5 : 4) / v.z;
              const prev = selectedPath[(i - 1 + selectedPath.length) % selectedPath.length]!;
              const showHandles =
                tool === 'point' &&
                (sel ||
                  nodes.includes((i + 1) % selectedPath.length) ||
                  nodes.includes((i - 1 + selectedPath.length) % selectedPath.length));
              void prev;
              return (
                <g key={i}>
                  {showHandles
                    ? (['in', 'out'] as const).map((w) =>
                        nd[w] ? (
                          <g key={w}>
                            <line
                              x1={nd.x}
                              y1={nd.y}
                              x2={nd[w]!.x}
                              y2={nd[w]!.y}
                              stroke="#64748b"
                              strokeWidth={1}
                              vectorEffect="non-scaling-stroke"
                            />
                            <circle
                              cx={nd[w]!.x}
                              cy={nd[w]!.y}
                              r={3.5 / v.z}
                              fill="#fff"
                              stroke="#2563eb"
                              strokeWidth={1.5}
                              vectorEffect="non-scaling-stroke"
                              className="cursor-pointer"
                              data-testid="curve-handle"
                              onPointerDown={(e) => onHandleDown(e, selected, i, w)}
                            />
                          </g>
                        ) : null,
                      )
                    : null}
                  {nd.smooth ? (
                    <circle
                      cx={nd.x}
                      cy={nd.y}
                      r={r}
                      fill={sel ? '#2563eb' : '#fff'}
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      className="cursor-move"
                      data-testid="path-node"
                      data-index={i}
                      onPointerDown={(e) => onNodeDown(e, selected, i)}
                    />
                  ) : (
                    <rect
                      x={nd.x - r}
                      y={nd.y - r}
                      width={r * 2}
                      height={r * 2}
                      fill={sel ? '#2563eb' : '#fff'}
                      stroke="#2563eb"
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      className="cursor-move"
                      data-testid="path-node"
                      data-index={i}
                      onPointerDown={(e) => onNodeDown(e, selected, i)}
                    />
                  )}
                </g>
              );
            })}
          </g>
        ) : null}
        {box ? (
          <rect
            x={Math.min(box.start.x, box.end.x)}
            y={Math.min(box.start.y, box.end.y)}
            width={Math.abs(box.end.x - box.start.x)}
            height={Math.abs(box.end.y - box.start.y)}
            fill="#2563eb22"
            stroke="#2563eb"
            strokeDasharray="4 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {spread ? (
          <SpreadLine
            spread={spread}
            offset={offset(pieces.find((p) => p.pieceId === spread.pieceId)!)}
            visible={visible}
            k={1 / v.z}
            unit={unit}
          />
        ) : (tool === 'lengthen' || tool === 'widen') && cursor ? (
          <line
            x1={tool === 'lengthen' ? visible.x0 : cursor.x}
            y1={tool === 'lengthen' ? cursor.y : visible.y0}
            x2={tool === 'lengthen' ? visible.x1 : cursor.x}
            y2={tool === 'lengthen' ? cursor.y : visible.y1}
            stroke="#db2777"
            strokeDasharray="6 4"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
        {measure ? (
          <MeasureOverlay
            a={measure.a}
            b={measure.b ?? (cursor ? snap(cursor).p : null)}
            k={1 / v.z}
            unit={unit}
          />
        ) : null}
        {snapMark ? (
          <circle
            cx={snapMark.x}
            cy={snapMark.y}
            r={7 / v.z}
            fill="none"
            stroke="#db2777"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}
      </svg>
      {/* Status line */}
      <div
        className="pointer-events-none absolute bottom-1 left-7 rounded bg-background/85 px-2 py-0.5 text-[11px] tabular-nums shadow-sm"
        data-testid="cad-status"
      >
        {cursorLabel ? `${cursorLabel} · ` : ''}zoom {zoomPct}% · grid{' '}
        {fmt(step < 1 ? 1 : step, unit)} {unit}
        {measure?.b
          ? ` · distance ${fmt(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y), unit)} ${unit}`
          : ''}
      </div>
      {spread ? (
        <div
          className="absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-background px-2 py-1 text-[12px] shadow"
          data-testid="spread-bar"
        >
          {spread.line.dir.x ? 'Lengthen' : 'Widen'} by
          <input
            className="h-6 w-20 rounded border px-1 text-right"
            aria-label="Spread amount"
            value={fmt(spread.amount, unit)}
            onChange={(e) => {
              const val = Number(e.target.value.replace(',', '.'));
              if (Number.isFinite(val))
                setSpread({
                  ...spread,
                  amount: unit === 'mm' ? val : unit === 'in' ? val * 25.4 : val * 10,
                });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySpread();
              if (e.key === 'Escape') setSpread(null);
            }}
            data-testid="spread-amount"
          />
          {unit}
          <button
            type="button"
            className="rounded bg-primary px-2 py-0.5 text-primary-foreground"
            onClick={applySpread}
            data-testid="spread-apply"
          >
            Apply
          </button>
          <button
            type="button"
            className="rounded border px-2 py-0.5"
            onClick={() => setSpread(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

function SpreadLine({
  spread,
  offset,
  visible,
  k,
  unit,
}: {
  spread: { line: CutLine; amount: number };
  offset: Pt;
  visible: { x0: number; x1: number; y0: number; y1: number };
  k: number;
  unit: Unit;
}) {
  const p = { x: spread.line.point.x + offset.x, y: spread.line.point.y + offset.y };
  const horiz = !!spread.line.dir.x;
  const nrm = { x: -spread.line.dir.y, y: spread.line.dir.x };
  const q = { x: p.x + nrm.x * spread.amount, y: p.y + nrm.y * spread.amount };
  return (
    <g pointerEvents="none" data-testid="spread-line">
      <line
        x1={horiz ? visible.x0 : p.x}
        y1={horiz ? p.y : visible.y0}
        x2={horiz ? visible.x1 : p.x}
        y2={horiz ? p.y : visible.y1}
        stroke="#db2777"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={horiz ? visible.x0 : q.x}
        y1={horiz ? q.y : visible.y0}
        x2={horiz ? visible.x1 : q.x}
        y2={horiz ? q.y : visible.y1}
        stroke="#db2777"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text x={q.x + 6 * k} y={q.y - 6 * k} fontSize={12 * k} fill="#db2777">
        {spread.amount >= 0 ? '+' : ''}
        {fmt(spread.amount, unit)} {unit}
      </text>
    </g>
  );
}

function MeasureOverlay({ a, b, k, unit }: { a: Pt; b: Pt | null; k: number; unit: Unit }) {
  if (!b) return <circle cx={a.x} cy={a.y} r={4 * k} fill="#db2777" />;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return (
    <g pointerEvents="none" data-testid="measure-overlay">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke="#db2777"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={a.x} cy={a.y} r={3.5 * k} fill="#db2777" />
      <circle cx={b.x} cy={b.y} r={3.5 * k} fill="#db2777" />
      <rect
        x={(a.x + b.x) / 2 + 6 * k}
        y={(a.y + b.y) / 2 - 16 * k}
        width={150 * k}
        height={20 * k}
        rx={3 * k}
        fill="#fff"
        stroke="#db2777"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={(a.x + b.x) / 2 + 12 * k}
        y={(a.y + b.y) / 2 - 2 * k}
        fontSize={12 * k}
        fill="#0f172a"
        data-testid="measure-value"
      >
        {fmt(d, unit)} {unit} · Δx {fmt(Math.abs(b.x - a.x), unit)} · Δy{' '}
        {fmt(Math.abs(b.y - a.y), unit)}
      </text>
    </g>
  );
}

/** Top and left rulers in the current unit (ticks adapt to the zoom). */
function Rulers({
  v,
  size,
  unit,
  cursor,
}: {
  v: { z: number; x: number; y: number };
  size: { w: number; h: number };
  unit: Unit;
  cursor: Pt | null;
}) {
  const unitMm = unit === 'mm' ? 1 : unit === 'in' ? 25.4 : 10;
  const candidates =
    unit === 'in' ? [25.4 / 16, 25.4 / 8, 25.4 / 4, 25.4 / 2, 25.4, 50.8, 127, 254, 508] : STEPS;
  const minor = candidates.find((s) => s * v.z >= 6) ?? 1000;
  const labelEvery = candidates.find((s) => s * v.z >= 60) ?? 1000;
  const ticks = (from: number, to: number) => {
    const out: { mm: number; major: boolean }[] = [];
    for (let m = Math.ceil(from / minor) * minor; m <= to && out.length < 800; m += minor)
      out.push({ mm: m, major: Math.abs(m / labelEvery - Math.round(m / labelEvery)) < 1e-6 });
    return out;
  };
  const label = (mm: number) => {
    const val = mm / unitMm;
    return Math.abs(val) >= 100 || Number.isInteger(Math.round(val * 100) / 100)
      ? String(Math.round(val))
      : val.toFixed(1);
  };
  return (
    <>
      <div
        className="absolute top-0 left-0 z-10 border-r border-b bg-muted"
        style={{ width: RULER, height: RULER }}
      />
      <svg
        className="absolute top-0 border-b bg-muted/80 text-muted-foreground"
        style={{ left: RULER, width: size.w, height: RULER }}
        data-testid="ruler-top"
      >
        {ticks(v.x, v.x + size.w / v.z).map((t) => {
          const x = (t.mm - v.x) * v.z;
          return (
            <g key={t.mm}>
              <line
                x1={x}
                y1={t.major ? 6 : 15}
                x2={x}
                y2={RULER}
                stroke="currentColor"
                strokeWidth={1}
              />
              {t.major ? (
                <text x={x + 2} y={10} fontSize={9} fill="currentColor">
                  {label(t.mm)}
                </text>
              ) : null}
            </g>
          );
        })}
        {cursor ? (
          <line
            x1={(cursor.x - v.x) * v.z}
            y1={0}
            x2={(cursor.x - v.x) * v.z}
            y2={RULER}
            stroke="#db2777"
          />
        ) : null}
      </svg>
      <svg
        className="absolute left-0 border-r bg-muted/80 text-muted-foreground"
        style={{ top: RULER, width: RULER, height: size.h }}
        data-testid="ruler-left"
      >
        {ticks(v.y, v.y + size.h / v.z).map((t) => {
          const y = (t.mm - v.y) * v.z;
          return (
            <g key={t.mm}>
              <line
                x1={t.major ? 6 : 15}
                y1={y}
                x2={RULER}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
              />
              {t.major ? (
                <text
                  x={10}
                  y={y + 2}
                  fontSize={9}
                  fill="currentColor"
                  transform={`rotate(-90 10 ${y + 2})`}
                >
                  {label(t.mm)}
                </text>
              ) : null}
            </g>
          );
        })}
        {cursor ? (
          <line
            x1={0}
            y1={(cursor.y - v.y) * v.z}
            x2={RULER}
            y2={(cursor.y - v.y) * v.z}
            stroke="#db2777"
          />
        ) : null}
      </svg>
    </>
  );
}
