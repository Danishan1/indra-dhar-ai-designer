'use client';

import type { PatternPiece } from '@ai-designer/garment-model';
import {
  type CutLine,
  deleteNodes,
  EDGE_LABELS,
  ensurePath,
  insertNode,
  layoutCanvas,
  moveHandle,
  moveNodes,
  nearestOnPath,
  pathEdgeLength,
  pieceBounds,
  rotatePiece,
  scalePieceFrom,
  setEdgeLength,
  setSegmentCurved,
  setSmooth,
  spreadAtLines,
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
import { type CadTool, POINT_TOOLS, TOOL_BY_KEY, TOOLS } from './tools';

export type { CadTool } from './tools';

/**
 * CAD canvas for flat patterns (ADR-059, tools ADR-062): real-scale rulers and grid, zoom to true
 * size (1:1, calibrated), snapping to grid and points, and one active tool at a time. Each tool
 * only reacts to the gestures it owns; switching tools cancels what the previous one had started.
 * Everything is in millimetres; edits are committed once per gesture through `onCommit` (one undo
 * step).
 */

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
/** Pick distance in screen pixels. */
const HIT = 9;

type Pt = { x: number; y: number };
type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { kind: 'move-piece'; piece: PatternPiece; start: Pt; origin: Pt; moved: boolean }
  | { kind: 'nodes'; piece: PatternPiece; start: Pt; indices: number[]; anchor: Pt }
  | { kind: 'handle'; piece: PatternPiece; index: number; which: 'in' | 'out' }
  | { kind: 'box'; piece: PatternPiece; start: Pt; add: boolean }
  | { kind: 'spread'; start: Pt; base: number }
  | { kind: 'scale'; piece: PatternPiece; handle: Handle }
  | { kind: 'rotate'; piece: PatternPiece; center: Pt; a0: number }
  | { kind: 'grain'; piece: PatternPiece; from: Pt };

/** Multi-line spread in progress (lengthen / widen). Lines are in piece coordinates. */
interface Spread {
  pieceId: string;
  dir: Pt;
  points: Pt[];
  amount: number;
}

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
  fabric,
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
  /** Arrange: the fabric band pieces are packed into (canvas mm). */
  fabric?: { x: number; y: number; width: number; length: number } | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<{ z: number; x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<PatternPiece | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [snapMark, setSnapMark] = useState<Pt | null>(null);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt | null } | null>(null);
  const [spread, setSpread] = useState<Spread | null>(null);
  const [box, setBox] = useState<{ start: Pt; end: Pt } | null>(null);
  const [seam, setSeam] = useState<{ pieceId: string; edge: string } | null>(null);
  const [hover, setHover] = useState<{ pieceId: string; point: Pt; edge: string | null } | null>(
    null,
  );
  const [space, setSpace] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const nudgeGroup = useRef<{ id: string; at: number } | null>(null);
  const onNodesRef = useRef(onNodes);
  onNodesRef.current = onNodes;

  // Switching tools cancels whatever the previous tool had started.
  useEffect(() => {
    gesture.current = null;
    setMeasure(null);
    setSpread(null);
    setDraft(null);
    setBox(null);
    setSeam(null);
    setHover(null);
    setSnapMark(null);
    if (!POINT_TOOLS.has(tool)) onNodesRef.current([]);
  }, [tool]);
  // A spread or seam belongs to one piece: selecting another piece drops it.
  useEffect(() => {
    setSpread((s) => (s && s.pieceId !== selectedId ? null : s));
    setSeam((s) => (s && s.pieceId !== selectedId ? null : s));
  }, [selectedId]);

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

  const layout = useMemo(() => layoutCanvas(pieces), [pieces]);
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
    if (fabric) {
      x0 = Math.min(x0, fabric.x);
      y0 = Math.min(y0, fabric.y);
      x1 = Math.max(x1, fabric.x + fabric.width);
      y1 = Math.max(y1, fabric.y + fabric.length);
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1000, y1: 800 };
  }, [pieces, layout, fabric]);

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

  /** Snap a canvas point (mm): pieces' points first, then the grid. */
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

  const constrain = (from: Pt, to: Pt, on: boolean, stepDeg = 45): Pt => {
    if (!on) return to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const unitA = (stepDeg * Math.PI) / 180;
    const a = Math.round(Math.atan2(dy, dx) / unitA) * unitA;
    const L = Math.hypot(dx, dy);
    return { x: from.x + Math.cos(a) * L, y: from.y + Math.sin(a) * L };
  };

  const selected = shown.find((p) => p.pieceId === selectedId) ?? null;
  const base = pieces.find((p) => p.pieceId === selectedId) ?? null;
  const selectedPath = useMemo(() => (selected ? ensurePath(selected) : null), [selected]);

  /** Piece under a canvas point (topmost), via the SVG hit target or a geometric test. */
  const pieceAt = (target: Element): PatternPiece | null => {
    const id = target.closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null;
    return id ? (shown.find((x) => x.pieceId === id) ?? null) : null;
  };
  /** Nearest seam-line point of a piece (piece coords) and the edge it is on. */
  const nearOutline = (piece: PatternPiece, p: Pt) => {
    const o = offset(piece);
    const path = ensurePath(piece);
    const near = nearestOnPath(path, { x: p.x - o.x, y: p.y - o.y });
    return { ...near, edge: path[near.seg]?.seg ?? null, path, o };
  };
  /** Piece whose seam line is within the pick distance (selected piece first). */
  const outlineAt = (p: Pt) => {
    const order = selected ? [selected, ...shown.filter((x) => x !== selected)] : shown;
    for (const piece of order) {
      const n = nearOutline(piece, p);
      if (n.d * v.z <= HIT) return { piece, ...n };
    }
    return null;
  };

  // Scale tool geometry (piece coords) for the selected piece.
  const scaleBox = selected && tool === 'scale' ? pieceBounds(selected) : null;
  const handlePoint = (b: ReturnType<typeof pieceBounds>, h: Handle): Pt => ({
    x: h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : b.cx,
    y: h.includes('n') ? b.y : h.includes('s') ? b.y + b.height : b.cy,
  });

  const commitSpread = useCallback(
    (typed?: number) => {
      if (!spread) return;
      const amount = typed ?? spread.amount;
      const piece = pieces.find((p) => p.pieceId === spread.pieceId);
      if (piece && Math.abs(amount) >= 0.1 && spread.points.length) {
        const lines: CutLine[] = spread.points.map((point) => ({ point, dir: spread.dir }));
        const verb = spread.dir.x
          ? amount > 0
            ? 'Lengthen'
            : 'Shorten'
          : amount > 0
            ? 'Widen'
            : 'Narrow';
        onCommit(
          spreadAtLines(piece, lines, amount),
          `${verb} ${piece.name} by ${fmt(Math.abs(amount), unit)} ${unit}${lines.length > 1 ? ` at ${lines.length} lines` : ''}`,
        );
      }
      setSpread(null);
    },
    [spread, pieces, onCommit, unit],
  );

  // ── pointer handling ──
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    wrap.current?.focus();
    const p = toMm(e);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (tool === 'pan' || space || e.button === 1) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
      return;
    }
    if (e.button !== 0) return;
    const piece = pieceAt(e.target as Element);
    const startPan = () => {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y };
    };
    const choose = (pc: PatternPiece | null) => {
      if ((pc?.pieceId ?? null) !== selectedId) {
        onSelect(pc?.pieceId ?? null);
        onNodes([]);
      }
    };
    switch (tool) {
      case 'measure': {
        const s = snap(p).p;
        setMeasure((m) => (!m || m.b ? { a: s, b: null } : { a: m.a, b: s }));
        return;
      }
      case 'select': {
        choose(piece);
        if (!piece) return startPan();
        if (editable)
          gesture.current = {
            kind: 'move-piece',
            piece,
            start: p,
            origin: offset(piece),
            moved: false,
          };
        return;
      }
      case 'point': {
        if (piece && piece.pieceId !== selectedId) {
          choose(piece);
          return;
        }
        if (!selected) return startPan();
        gesture.current = { kind: 'box', piece: selected, start: p, add: e.shiftKey };
        setBox({ start: p, end: p });
        return;
      }
      case 'delete-point':
      case 'convert': {
        // Points are handled by onNodeDown; here: segments (convert) or choosing a piece.
        if (tool === 'convert' && editable && selected) {
          const n = nearOutline(selected, p);
          if (n.d * v.z <= HIT) {
            const path = n.path;
            const curved = !!(path[n.seg]?.out || path[(n.seg + 1) % path.length]?.in);
            onCommit(
              withPath(selected, setSegmentCurved(path, n.seg, !curved)),
              `${curved ? 'Straighten' : 'Curve'} a seam of ${selected.name}`,
            );
            return;
          }
        }
        if (piece) choose(piece);
        else startPan();
        return;
      }
      case 'add-point':
      case 'notch': {
        const hit = outlineAt(p);
        if (!hit) {
          if (piece) choose(piece);
          else startPan();
          return;
        }
        choose(hit.piece);
        if (!editable) return;
        if (tool === 'add-point') {
          const next = insertNode(hit.path, hit.seg, hit.t);
          onCommit(withPath(hit.piece, next), `Add a point to ${hit.piece.name}`);
          return;
        }
        // Notch: remove the one under the cursor, else add one on the seam line.
        const local = { x: p.x - hit.o.x, y: p.y - hit.o.y };
        const existing = hit.piece.notches.findIndex(
          (q) => Math.hypot(q.x - local.x, q.y - local.y) * v.z <= HIT,
        );
        if (existing >= 0)
          onCommit(
            { ...hit.piece, notches: hit.piece.notches.filter((_, i) => i !== existing) },
            `Remove a notch from ${hit.piece.name}`,
          );
        else
          onCommit(
            {
              ...hit.piece,
              notches: [
                ...hit.piece.notches,
                { x: Math.round(hit.point.x * 10) / 10, y: Math.round(hit.point.y * 10) / 10 },
              ],
            },
            `Add a notch to ${hit.piece.name}`,
          );
        return;
      }
      case 'seam': {
        const hit = outlineAt(p);
        if (hit && hit.edge) {
          choose(hit.piece);
          setSeam({ pieceId: hit.piece.pieceId, edge: hit.edge });
        } else {
          setSeam(null);
          if (piece) choose(piece);
          else startPan();
        }
        return;
      }
      case 'lengthen':
      case 'widen': {
        const target = piece ?? selected;
        if (!target || !editable) return startPan();
        choose(target);
        const o = offset(target);
        const local = { x: p.x - o.x, y: p.y - o.y };
        const dir = tool === 'lengthen' ? { x: 1, y: 0 } : { x: 0, y: 1 };
        setSpread((s) =>
          s && s.pieceId === target.pieceId
            ? { ...s, points: [...s.points, local] }
            : { pieceId: target.pieceId, dir, points: [local], amount: 0 },
        );
        gesture.current = {
          kind: 'spread',
          start: p,
          base: spread && spread.pieceId === target.pieceId ? spread.amount : 0,
        };
        return;
      }
      case 'scale': {
        // Handles are hit on their own elements (onHandle); a click elsewhere selects.
        choose(piece);
        if (!piece) startPan();
        return;
      }
      case 'rotate': {
        const target = piece ?? selected;
        if (!target) return startPan();
        choose(target);
        if (!editable) return;
        const b = pieceBounds(target);
        const o = offset(target);
        const center = { x: b.cx + o.x, y: b.cy + o.y };
        gesture.current = {
          kind: 'rotate',
          piece: target,
          center,
          a0: Math.atan2(p.y - center.y, p.x - center.x),
        };
        return;
      }
      case 'grain': {
        const target = piece ?? selected;
        if (!target) return startPan();
        choose(target);
        if (!editable) return;
        const o = offset(target);
        gesture.current = { kind: 'grain', piece: target, from: { x: p.x - o.x, y: p.y - o.y } };
        return;
      }
      case 'fit':
      default: {
        choose(piece);
        if (!piece) startPan();
      }
    }
  };

  const onNodeDown = (e: ReactPointerEvent, piece: PatternPiece, index: number) => {
    if (!editable || !POINT_TOOLS.has(tool) || space) return;
    e.stopPropagation();
    wrap.current?.focus();
    if (tool === 'delete-point') {
      const path = ensurePath(piece);
      if (path.length <= 3) return;
      onCommit(withPath(piece, deleteNodes(path, [index])), `Delete a point of ${piece.name}`);
      onNodes([]);
      return;
    }
    if (tool === 'convert') {
      const path = ensurePath(piece);
      const smooth = !path[index]!.smooth;
      onCommit(
        withPath(piece, setSmooth(path, index, smooth)),
        `Make a point ${smooth ? 'smooth' : 'a corner'} on ${piece.name}`,
      );
      onNodes([index]);
      return;
    }
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
    if (!editable || tool !== 'point') return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'handle', piece, index, which };
  };

  const onScaleHandleDown = (e: ReactPointerEvent, h: Handle) => {
    if (!editable || !base) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    gesture.current = { kind: 'scale', piece: base, handle: h };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = toMm(e);
    setCursor(p);
    const g = gesture.current;
    if (!g) {
      if (tool === 'measure' && measure && !measure.b) {
        const s = snap(p);
        setSnapMark(s.snapped ? s.p : null);
      }
      if (tool === 'add-point' || tool === 'notch' || tool === 'seam' || tool === 'convert') {
        const hit = outlineAt(p);
        setHover(hit ? { pieceId: hit.piece.pieceId, point: hit.point, edge: hit.edge } : null);
      }
      return;
    }
    if (g.kind === 'pan') {
      setView({ z: v.z, x: g.vx - (e.clientX - g.sx) / v.z, y: g.vy - (e.clientY - g.sy) / v.z });
      return;
    }
    if (g.kind === 'move-piece') {
      const to = constrain(g.start, p, e.shiftKey);
      if (!g.moved && Math.hypot(to.x - g.start.x, to.y - g.start.y) * v.z < 3) return;
      g.moved = true;
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
      setBox({ start: g.start, end: p });
      return;
    }
    if (g.kind === 'spread') {
      if (!spread) return;
      const nrm = { x: -spread.dir.y, y: spread.dir.x };
      const raw = (p.x - g.start.x) * nrm.x + (p.y - g.start.y) * nrm.y;
      if (Math.abs(raw) * v.z < 3) return;
      const r = settings.snapGrid ? 1 : 10;
      setSpread({ ...spread, amount: Math.round((g.base + raw) * r) / r });
      return;
    }
    if (g.kind === 'scale') {
      const piece = g.piece;
      const b = pieceBounds(piece);
      const o = offset(piece);
      const local = { x: p.x - o.x, y: p.y - o.y };
      const fromCentre = e.altKey;
      const opposite: Handle = (
        {
          nw: 'se',
          n: 's',
          ne: 'sw',
          e: 'w',
          se: 'nw',
          s: 'n',
          sw: 'ne',
          w: 'e',
        } as const
      )[g.handle];
      const anchor = fromCentre ? { x: b.cx, y: b.cy } : handlePoint(b, opposite);
      const grip = handlePoint(b, g.handle);
      const horiz = g.handle.includes('e') || g.handle.includes('w');
      const vert = g.handle.includes('n') || g.handle.includes('s');
      let sx =
        horiz && Math.abs(grip.x - anchor.x) > 0.01
          ? (local.x - anchor.x) / (grip.x - anchor.x)
          : 1;
      let sy =
        vert && Math.abs(grip.y - anchor.y) > 0.01 ? (local.y - anchor.y) / (grip.y - anchor.y) : 1;
      if (horiz && vert && !e.shiftKey) sx = sy = Math.max(sx, sy);
      sx = Math.max(0.05, sx);
      sy = Math.max(0.05, sy);
      // Round to 0.5 mm of the resulting size.
      const W = Math.round(b.width * sx * 2) / 2;
      const H = Math.round(b.height * sy * 2) / 2;
      setDraft({ ...scalePieceFrom(piece, W / b.width, H / b.height, anchor), canvas: o });
      return;
    }
    if (g.kind === 'rotate') {
      let deg = ((Math.atan2(p.y - g.center.y, p.x - g.center.x) - g.a0) * 180) / Math.PI;
      deg = e.shiftKey ? Math.round(deg / 15) * 15 : Math.round(deg * 2) / 2;
      setDraft({ ...rotatePiece(g.piece, deg), canvas: offset(g.piece), notes: [String(deg)] });
      return;
    }
    if (g.kind === 'grain') {
      const o = offset(g.piece);
      const to0 = { x: p.x - o.x, y: p.y - o.y };
      const to = constrain(g.from, to0, e.shiftKey);
      setDraft({ ...g.piece, grainline: { from: g.from, to }, canvas: o });
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    setSnapMark(null);
    if (!g) return;
    if (g.kind === 'move-piece' && g.moved && draft?.canvas)
      onCommit({ ...g.piece, canvas: draft.canvas }, `Move ${g.piece.name}`);
    else if ((g.kind === 'nodes' || g.kind === 'handle') && draft)
      onCommit(
        draft,
        g.kind === 'nodes'
          ? `Move ${g.indices.length > 1 ? `${g.indices.length} points` : 'a point'} of ${draft.name}`
          : `Shape a curve of ${draft.name}`,
      );
    else if (g.kind === 'box') {
      const end = toMm(e);
      const o = offset(g.piece);
      const x0 = Math.min(g.start.x, end.x) - o.x;
      const x1 = Math.max(g.start.x, end.x) - o.x;
      const y0 = Math.min(g.start.y, end.y) - o.y;
      const y1 = Math.max(g.start.y, end.y) - o.y;
      const moved = Math.hypot(end.x - g.start.x, end.y - g.start.y) * v.z > 3;
      const hit = moved
        ? ensurePath(g.piece)
            .map((nd, i) => (nd.x >= x0 && nd.x <= x1 && nd.y >= y0 && nd.y <= y1 ? i : -1))
            .filter((i) => i >= 0)
        : [];
      onNodes(g.add ? [...new Set([...nodes, ...hit])] : hit);
      setBox(null);
    } else if (g.kind === 'scale' && draft) {
      const b0 = pieceBounds(g.piece);
      const b1 = pieceBounds(draft);
      if (Math.abs(b1.width - b0.width) > 0.2 || Math.abs(b1.height - b0.height) > 0.2)
        onCommit(
          { ...draft, canvas: g.piece.canvas ?? draft.canvas },
          `Scale ${g.piece.name} to ${fmt(b1.width, unit)} × ${fmt(b1.height, unit)} ${unit}`,
        );
    } else if (g.kind === 'rotate' && draft) {
      const deg = Number(draft.notes[0] ?? 0);
      if (Math.abs(deg) >= 0.5)
        onCommit(
          { ...rotatePiece(g.piece, deg), canvas: g.piece.canvas ?? offset(g.piece) },
          `Rotate ${g.piece.name} ${deg > 0 ? '+' : ''}${deg}°`,
        );
    } else if (g.kind === 'grain' && draft?.grainline) {
      const gl = draft.grainline;
      if (Math.hypot(gl.to.x - gl.from.x, gl.to.y - gl.from.y) * v.z > 6)
        onCommit(
          {
            ...g.piece,
            grainline: {
              from: { x: Math.round(gl.from.x * 10) / 10, y: Math.round(gl.from.y * 10) / 10 },
              to: { x: Math.round(gl.to.x * 10) / 10, y: Math.round(gl.to.y * 10) / 10 },
            },
          },
          `Set the grainline of ${g.piece.name}`,
        );
    }
    setDraft(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Point tool shortcut: double-click a seam to add a point.
    if (!editable || tool !== 'point' || !selected) return;
    const n = nearOutline(selected, toMm(e));
    if (n.d * v.z > HIT) return;
    onCommit(withPath(selected, insertNode(n.path, n.seg, n.t)), `Add a point to ${selected.name}`);
    onNodes([n.seg + 1]);
  };

  // ── keyboard ──
  const cancel = () => {
    if (gesture.current) {
      gesture.current = null;
      setDraft(null);
      setBox(null);
      return true;
    }
    if (spread || measure || seam || nodes.length) {
      setSpread(null);
      setMeasure(null);
      setSeam(null);
      onNodes([]);
      return true;
    }
    return false;
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey) return; // undo/redo/save stay global
    const k = e.key.toLowerCase();
    if (TOOL_BY_KEY[k] && !e.altKey) {
      const t = TOOL_BY_KEY[k]!;
      if (editable || !TOOLS[t].edits) onTool(t);
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
      // First Esc cancels what is in progress; the next returns to the select tool.
      if (!cancel() && tool !== 'select') onTool('select');
      e.stopPropagation();
      return;
    }
    if (k === 'enter' && spread) {
      commitSpread();
      e.stopPropagation();
      return;
    }
    if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-') zoomAt(0.8);
    else if (k === '0') fit();
    else if (k === '1') zoomAt(settings.pxPerMm / v.z);
    else if (
      (k === 'delete' || k === 'backspace') &&
      editable &&
      selected &&
      tool === 'point' &&
      nodes.length
    ) {
      onCommit(
        withPath(selected, deleteNodes(ensurePath(selected), nodes)),
        `Delete ${nodes.length} point${nodes.length > 1 ? 's' : ''} of ${selected.name}`,
      );
      onNodes([]);
    } else if (
      k.startsWith('arrow') &&
      editable &&
      selected &&
      (tool === 'select' || (tool === 'point' && nodes.length))
    ) {
      const d = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0;
      const dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
      const now = Date.now();
      if (!nudgeGroup.current || now - nudgeGroup.current.at > 1200)
        nudgeGroup.current = { id: crypto.randomUUID(), at: now };
      nudgeGroup.current.at = now;
      if (tool === 'point')
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
    if (!spread || !spread.points.length) return null;
    const piece = pieces.find((p) => p.pieceId === spread.pieceId);
    return piece
      ? spreadAtLines(
          piece,
          spread.points.map((point) => ({ point, dir: spread.dir })),
          spread.amount,
        )
      : null;
  }, [spread, pieces]);

  const cursorLabel = cursor ? `X ${fmt(cursor.x, unit)}  Y ${fmt(cursor.y, unit)} ${unit}` : '';
  const zoomPct = Math.round((v.z / settings.pxPerMm) * 100);
  const showNodes = !!(selected && selectedPath && editable && POINT_TOOLS.has(tool));
  const seamPiece = seam ? (shown.find((p) => p.pieceId === seam.pieceId) ?? null) : null;
  const cursorClass =
    tool === 'pan' || space
      ? 'cursor-grab'
      : tool === 'select'
        ? 'cursor-default'
        : tool === 'rotate'
          ? 'cursor-alias'
          : 'cursor-crosshair';

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => e.key === ' ' && setSpace(false)}
      className="relative h-full min-h-0 w-full overflow-hidden bg-white outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      data-testid="pattern-cad"
      data-zoom={zoomPct}
      data-tool={tool}
    >
      <Rulers v={v} size={size} unit={unit} cursor={cursor} />
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        viewBox={`${v.x} ${v.y} ${size.w / v.z} ${size.h / v.z}`}
        className={cn('absolute touch-none select-none', cursorClass)}
        style={{ left: RULER, top: RULER }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setCursor(null);
          setHover(null);
        }}
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
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {fabric ? (
          <g pointerEvents="none" data-testid="fabric-band">
            <rect
              x={fabric.x}
              y={fabric.y}
              width={fabric.width}
              height={Math.max(fabric.length, 1)}
              fill="#fef9c3"
              fillOpacity={0.45}
              stroke="#ca8a04"
              strokeDasharray="10 6"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <text x={fabric.x + 8 * (1 / v.z)} y={fabric.y - 6 / v.z} fontSize={fs} fill="#a16207">
              Fabric {fmt(fabric.width, unit)} {unit} wide · used length {fmt(fabric.length, unit)}{' '}
              {unit}
            </text>
          </g>
        ) : null}
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
        {/* Seam tool: highlight of the chosen / hovered seam. */}
        {seamPiece && seam ? (
          <EdgeHighlight
            piece={seamPiece}
            edge={seam.edge}
            offset={offset(seamPiece)}
            color="#ea580c"
            width={4}
            testId="seam-highlight"
          />
        ) : null}
        {hover && tool === 'seam' && hover.edge && hover.edge !== seam?.edge ? (
          <EdgeHighlight
            piece={shown.find((p) => p.pieceId === hover.pieceId)!}
            edge={hover.edge}
            offset={offset(shown.find((p) => p.pieceId === hover.pieceId)!)}
            color="#fb923c"
            width={2.5}
          />
        ) : null}
        {hover &&
        (tool === 'add-point' || tool === 'notch' || tool === 'convert' || tool === 'seam') ? (
          <circle
            cx={hover.point.x + offset(shown.find((p) => p.pieceId === hover.pieceId)!).x}
            cy={hover.point.y + offset(shown.find((p) => p.pieceId === hover.pieceId)!).y}
            r={5 / v.z}
            fill={tool === 'notch' ? '#0f172a' : '#fff'}
            stroke="#2563eb"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            data-testid="outline-hover"
          />
        ) : null}
        {/* Points and handles of the selected piece (point tools only). */}
        {showNodes && selected && selectedPath ? (
          <g
            transform={`translate(${offset(selected).x} ${offset(selected).y})`}
            data-testid="node-layer"
          >
            {selectedPath.map((nd, i) => {
              const sel = nodes.includes(i);
              const r = (sel ? 5 : 4) / v.z;
              const showHandles =
                tool === 'point' &&
                (sel ||
                  nodes.includes((i + 1) % selectedPath.length) ||
                  nodes.includes((i - 1 + selectedPath.length) % selectedPath.length));
              const stroke = tool === 'delete-point' ? '#dc2626' : '#2563eb';
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
                      fill={sel ? stroke : '#fff'}
                      stroke={stroke}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      className={tool === 'point' ? 'cursor-move' : 'cursor-pointer'}
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
                      fill={sel ? stroke : '#fff'}
                      stroke={stroke}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                      className={tool === 'point' ? 'cursor-move' : 'cursor-pointer'}
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
        {/* Scale tool: bounding box with 8 handles. */}
        {scaleBox && selected && editable ? (
          <g
            transform={`translate(${offset(selected).x} ${offset(selected).y})`}
            data-testid="scale-box"
          >
            <rect
              x={scaleBox.x}
              y={scaleBox.y}
              width={scaleBox.width}
              height={scaleBox.height}
              fill="none"
              stroke="#7c3aed"
              strokeDasharray="5 4"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Handle[]).map((h) => {
              const q = handlePoint(scaleBox, h);
              const r = 5 / v.z;
              return (
                <rect
                  key={h}
                  x={q.x - r}
                  y={q.y - r}
                  width={r * 2}
                  height={r * 2}
                  fill="#fff"
                  stroke="#7c3aed"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  className={
                    h === 'n' || h === 's'
                      ? 'cursor-ns-resize'
                      : h === 'e' || h === 'w'
                        ? 'cursor-ew-resize'
                        : h === 'nw' || h === 'se'
                          ? 'cursor-nwse-resize'
                          : 'cursor-nesw-resize'
                  }
                  data-testid={`scale-handle-${h}`}
                  onPointerDown={(e) => onScaleHandleDown(e, h)}
                />
              );
            })}
            <text
              x={scaleBox.cx}
              y={scaleBox.y - 10 / v.z}
              fontSize={fs}
              textAnchor="middle"
              fill="#7c3aed"
              data-testid="scale-size"
            >
              {fmt(scaleBox.width, unit)} × {fmt(scaleBox.height, unit)} {unit}
            </text>
          </g>
        ) : null}
        {/* Rotate tool: centre mark and live angle. */}
        {tool === 'rotate' && selected ? (
          <g pointerEvents="none">
            <circle
              cx={pieceBounds(selected).cx + offset(selected).x}
              cy={pieceBounds(selected).cy + offset(selected).y}
              r={5 / v.z}
              fill="none"
              stroke="#7c3aed"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            {draft && gesture.current?.kind === 'rotate' ? (
              <text
                x={pieceBounds(selected).cx + offset(selected).x + 10 / v.z}
                y={pieceBounds(selected).cy + offset(selected).y - 10 / v.z}
                fontSize={fs * 1.1}
                fill="#7c3aed"
                data-testid="rotate-angle"
              >
                {draft.notes[0]}°
              </text>
            ) : null}
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
            pointerEvents="none"
            data-testid="box-select"
          />
        ) : null}
        {spread ? (
          <SpreadLines
            spread={spread}
            offset={offset(pieces.find((p) => p.pieceId === spread.pieceId) ?? pieces[0]!)}
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
        {TOOLS[tool].label} · {cursorLabel ? `${cursorLabel} · ` : ''}zoom {zoomPct}% · grid{' '}
        {fmt(step < 1 ? 1 : step, unit)} {unit}
        {measure?.b
          ? ` · distance ${fmt(Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y), unit)} ${unit}`
          : ''}
      </div>
      {spread ? (
        <FloatingBar testId="spread-bar">
          {spread.dir.x ? 'Lengthen' : 'Widen'} at {spread.points.length} line
          {spread.points.length > 1 ? 's' : ''} by
          <NumberInput
            label="Spread amount"
            mm={spread.amount}
            unit={unit}
            allowNegative
            onCommit={(mm) => setSpread({ ...spread, amount: mm })}
            onEnter={(mm) => commitSpread(mm ?? undefined)}
            testId="spread-amount"
          />
          {unit}
          <BarButton primary onClick={() => commitSpread()} testId="spread-apply">
            Apply
          </BarButton>
          <BarButton onClick={() => setSpread({ ...spread, points: spread.points.slice(0, -1) })}>
            Remove last line
          </BarButton>
          <BarButton onClick={() => setSpread(null)}>Cancel</BarButton>
        </FloatingBar>
      ) : null}
      {tool === 'scale' && base && editable ? (
        <ScaleBar piece={base} unit={unit} onCommit={onCommit} />
      ) : null}
      {tool === 'rotate' && base && editable ? (
        <RotateBar
          piece={base}
          onCommit={(p, l) => onCommit({ ...p, canvas: base.canvas ?? offset(base) }, l)}
        />
      ) : null}
      {seam && seamPiece && editable ? (
        <SeamBar
          piece={pieces.find((p) => p.pieceId === seam.pieceId) ?? seamPiece}
          edge={seam.edge}
          unit={unit}
          onCommit={onCommit}
          onClose={() => setSeam(null)}
        />
      ) : null}
      {overlay}
    </div>
  );
}

// ── tool bars ─────────────────────────────────────────────────────────────────

function FloatingBar({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1 text-[12px] shadow"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function BarButton({
  children,
  onClick,
  primary,
  testId,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  testId?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        'rounded px-2 py-0.5',
        primary ? 'bg-primary text-primary-foreground' : 'border hover:bg-accent',
      )}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

const toUnit = (mm: number, unit: Unit) => fmt(mm, unit);
const fromUnit = (v: number, unit: Unit) => (unit === 'mm' ? v : unit === 'in' ? v * 25.4 : v * 10);

/** A length typed in the current unit; commits on Enter / blur. */
function NumberInput({
  label,
  mm,
  unit,
  onCommit,
  onEnter,
  allowNegative,
  testId,
  width = 'w-20',
}: {
  label: string;
  mm: number;
  unit: Unit;
  onCommit: (mm: number) => void;
  /** Enter: called with the value just typed (null when nothing changed). */
  onEnter?: (mm: number | null) => void;
  allowNegative?: boolean;
  testId?: string;
  width?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = (): number | null => {
    if (text === null) return null;
    const val = Number(text.replace(',', '.'));
    setText(null);
    if (!Number.isFinite(val) || (!allowNegative && val <= 0)) return null;
    const mm = Math.round(fromUnit(val, unit) * 100) / 100;
    onCommit(mm);
    return mm;
  };
  return (
    <input
      className={cn('h-6 rounded border px-1 text-right tabular-nums', width)}
      aria-label={label}
      inputMode="decimal"
      value={text ?? toUnit(mm, unit)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const mm = commit();
          onEnter?.(mm);
        }
        if (e.key === 'Escape') setText(null);
      }}
      data-testid={testId}
    />
  );
}

/** Scale tool: exact width / height with an aspect lock and an anchor. */
function ScaleBar({
  piece,
  unit,
  onCommit,
}: {
  piece: PatternPiece;
  unit: Unit;
  onCommit: (piece: PatternPiece, label: string) => void;
}) {
  const b = pieceBounds(piece);
  const [lock, setLock] = useState(true);
  const [anchor, setAnchor] = useState<'top-left' | 'centre'>('top-left');
  const apply = (w: number, h: number) => {
    const sx = w / b.width;
    const sy = h / b.height;
    const a = anchor === 'centre' ? { x: b.cx, y: b.cy } : { x: b.x, y: b.y };
    onCommit(
      { ...scalePieceFrom(piece, sx, sy, a), ...(piece.canvas ? { canvas: piece.canvas } : {}) },
      `Scale ${piece.name} to ${fmt(w, unit)} × ${fmt(h, unit)} ${unit}`,
    );
  };
  return (
    <FloatingBar testId="scale-bar">
      Scale {piece.name}: W
      <NumberInput
        label="Scaled width"
        mm={b.width}
        unit={unit}
        onCommit={(w) => apply(w, lock ? (b.height * w) / b.width : b.height)}
        testId="scale-width"
      />
      H
      <NumberInput
        label="Scaled height"
        mm={b.height}
        unit={unit}
        onCommit={(h) => apply(lock ? (b.width * h) / b.height : b.width, h)}
        testId="scale-height"
      />
      {unit}
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={lock}
          onChange={(e) => setLock(e.target.checked)}
          data-testid="scale-lock"
        />
        keep proportions
      </label>
      <select
        className="h-6 rounded border px-1"
        aria-label="Scale from"
        value={anchor}
        onChange={(e) => setAnchor(e.target.value as 'top-left' | 'centre')}
      >
        <option value="top-left">from top-left</option>
        <option value="centre">from centre</option>
      </select>
    </FloatingBar>
  );
}

/** Rotate tool: exact angle, 90° turns and flips. */
function RotateBar({
  piece,
  onCommit,
}: {
  piece: PatternPiece;
  onCommit: (piece: PatternPiece, label: string) => void;
}) {
  const [text, setText] = useState('');
  const rotate = (deg: number) => {
    if (!Number.isFinite(deg) || Math.abs(deg) < 0.01) return;
    onCommit(rotatePiece(piece, deg), `Rotate ${piece.name} ${deg > 0 ? '+' : ''}${deg}°`);
  };
  return (
    <FloatingBar testId="rotate-bar">
      Rotate {piece.name}
      <input
        className="h-6 w-16 rounded border px-1 text-right"
        aria-label="Rotate by degrees"
        inputMode="decimal"
        placeholder="°"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            rotate(Number(text.replace(',', '.')));
            setText('');
          }
        }}
        data-testid="rotate-input"
      />
      °
      <BarButton onClick={() => rotate(-90)} testId="rotate-left-90">
        ⟲ 90°
      </BarButton>
      <BarButton onClick={() => rotate(90)} testId="rotate-right-90">
        ⟳ 90°
      </BarButton>
      <BarButton onClick={() => rotate(180)}>180°</BarButton>
    </FloatingBar>
  );
}

/** Seam tool: exact length (moving the end or start point) and the seam's allowance. */
function SeamBar({
  piece,
  edge,
  unit,
  onCommit,
  onClose,
}: {
  piece: PatternPiece;
  edge: string;
  unit: Unit;
  onCommit: (piece: PatternPiece, label: string) => void;
  onClose: () => void;
}) {
  const path = ensurePath(piece);
  const length = pathEdgeLength(path, edge);
  const [end, setEnd] = useState<'end' | 'start'>('end');
  const label = EDGE_LABELS[edge] ?? edge.replaceAll('_', ' ');
  const sa = piece.allowances?.[edge] ?? piece.seamAllowanceMm ?? 0;
  return (
    <FloatingBar testId="seam-bar">
      <span className="font-medium">{label}</span> of {piece.name}: length
      <NumberInput
        label="Seam length"
        mm={length}
        unit={unit}
        onCommit={(mm) =>
          onCommit(
            setEdgeLength(piece, edge, mm, end),
            `Set the ${label} of ${piece.name} to ${fmt(mm, unit)} ${unit}`,
          )
        }
        testId="seam-length"
      />
      {unit}
      <select
        className="h-6 rounded border px-1"
        aria-label="Point that moves"
        value={end}
        onChange={(e) => setEnd(e.target.value as 'end' | 'start')}
      >
        <option value="end">move the end</option>
        <option value="start">move the start</option>
      </select>
      · seam allowance
      <input
        className="h-6 w-14 rounded border px-1 text-right"
        aria-label="Seam allowance (mm)"
        type="number"
        min={0}
        max={100}
        defaultValue={sa}
        key={`${piece.pieceId}-${edge}-${sa}`}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v) || v < 0 || v > 100 || v === sa) return;
          const rest = { ...(piece.allowances ?? {}) };
          if (v === (piece.seamAllowanceMm ?? 0)) delete rest[edge];
          else rest[edge] = v;
          onCommit(
            { ...piece, allowances: rest },
            `Seam allowance of the ${label} of ${piece.name}: ${v} mm`,
          );
        }}
        data-testid="seam-allowance"
      />
      mm
      <BarButton onClick={onClose}>Done</BarButton>
    </FloatingBar>
  );
}

/** One named seam drawn over the piece (seam tool). */
function EdgeHighlight({
  piece,
  edge,
  offset,
  color,
  width,
  testId,
}: {
  piece: PatternPiece;
  edge: string;
  offset: Pt;
  color: string;
  width: number;
  testId?: string;
}) {
  const e = piece.edges?.filter((x) => x.name === edge) ?? [];
  const n = piece.outline.length;
  const polys = e.map((ed) => {
    const pts = [piece.outline[ed.from]!];
    for (let i = ed.from, g = 0; i !== ed.to && g < n; g++) {
      i = (i + 1) % n;
      pts.push(piece.outline[i]!);
    }
    return pts;
  });
  return (
    <g transform={`translate(${offset.x} ${offset.y})`} pointerEvents="none" data-testid={testId}>
      {polys.map((pts, i) => (
        <polyline
          key={i}
          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

function SpreadLines({
  spread,
  offset,
  visible,
  k,
  unit,
}: {
  spread: Spread;
  offset: Pt;
  visible: { x0: number; x1: number; y0: number; y1: number };
  k: number;
  unit: Unit;
}) {
  const horiz = !!spread.dir.x;
  const nrm = { x: -spread.dir.y, y: spread.dir.x };
  const each = spread.amount / Math.max(1, spread.points.length);
  return (
    <g pointerEvents="none" data-testid="spread-line">
      {spread.points.map((pt, i) => {
        const p = { x: pt.x + offset.x, y: pt.y + offset.y };
        const q = { x: p.x + nrm.x * each, y: p.y + nrm.y * each };
        return (
          <g key={i}>
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
            {Math.abs(each) > 0.05 ? (
              <text x={q.x + 6 * k} y={q.y - 6 * k} fontSize={12 * k} fill="#db2777">
                {each >= 0 ? '+' : ''}
                {fmt(each, unit)} {unit}
              </text>
            ) : null}
          </g>
        );
      })}
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
