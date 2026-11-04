'use client';

import type { PatternMarking, PatternPiece, PatternPoint } from '@ai-designer/garment-model';
import {
  keyPoints,
  moveKeyPoint,
  offsetOutline,
  pieceDimensions,
  resizePiece,
} from '@ai-designer/pattern-model';
import { MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { fmt, type Unit } from './options';

/**
 * Pattern pieces with their dimensions (ADR-058): seam line, seam allowance, fold, grain, notches,
 * darts, buttons and zips; overall width/height and every named seam length in the chosen unit.
 * Editable: drag a key point (curves follow) or a resize handle; the change is committed on release.
 */

export type CanvasPiece = Pick<
  PatternPiece,
  | 'pieceId'
  | 'name'
  | 'outline'
  | 'grainline'
  | 'foldLine'
  | 'notches'
  | 'cutQuantity'
  | 'seamAllowanceMm'
  | 'source'
> &
  Partial<
    Pick<
      PatternPiece,
      | 'edges'
      | 'markings'
      | 'mirrored'
      | 'status'
      | 'componentId'
      | 'draft'
      | 'fabricRole'
      | 'notes'
    >
  >;

const GAP = 90;
const ROW = 2600;

function bounds(pts: readonly PatternPoint[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Shelf layout (stable by order): piece id → offset. */
function layout(pieces: readonly CanvasPiece[], only: string | null) {
  const out = new Map<string, { dx: number; dy: number }>();
  let x = 0;
  let y = 0;
  let row = 0;
  let maxX = 0;
  for (const p of pieces) {
    if (only && p.pieceId !== only) continue;
    const b = bounds(offsetOutline(p.outline, p.seamAllowanceMm ?? 0));
    if (x > 0 && x + b.w > ROW) {
      x = 0;
      y += row + GAP + 120;
      row = 0;
    }
    out.set(p.pieceId, { dx: x - b.x0 + 60, dy: y - b.y0 + 60 });
    x += b.w + GAP + 60;
    row = Math.max(row, b.h);
    maxX = Math.max(maxX, x);
  }
  return { offsets: out, width: Math.max(400, maxX + 60), height: Math.max(300, y + row + 260) };
}

const poly = (pts: readonly PatternPoint[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

export function PatternCanvas({
  pieces,
  selectedId,
  onSelect,
  onChange,
  editable = false,
  unit = 'cm',
  showDimensions = true,
  showAllowance = true,
  only = null,
  className,
}: {
  pieces: readonly CanvasPiece[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Called once per gesture with the edited piece. */
  onChange?: (piece: CanvasPiece, label: string) => void;
  editable?: boolean;
  unit?: Unit;
  showDimensions?: boolean;
  showAllowance?: boolean;
  /** Show only this piece. */
  only?: string | null;
  className?: string;
}) {
  const [draft, setDraft] = useState<CanvasPiece | null>(null);
  const shown = useMemo(
    () => pieces.map((p) => (draft && p.pieceId === draft.pieceId ? draft : p)),
    [pieces, draft],
  );
  // Layout from the committed pieces so a dragged piece does not jump around.
  const lay = useMemo(() => layout(pieces, only), [pieces, only]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<
    | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
    | { kind: 'point'; piece: CanvasPiece; index: number; start: PatternPoint }
    | {
        kind: 'resize';
        piece: CanvasPiece;
        axis: 'x' | 'y' | 'xy';
        start: PatternPoint;
        w: number;
        h: number;
      }
    | null
  >(null);

  const vbW = lay.width / zoom;
  const vbH = lay.height / zoom;
  const vb = `${pan.x} ${pan.y} ${vbW} ${vbH}`;
  const k = Math.max(lay.width, lay.height) / 900 / zoom; // ≈ px → mm for strokes and text

  const toSvg = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = toSvg(e);
    if (g.kind === 'pan') {
      setPan({ x: g.px - (p.x - g.sx), y: g.py - (p.y - g.sy) });
      return;
    }
    if (g.kind === 'point') {
      setDraft(
        moveKeyPoint(
          g.piece as PatternPiece,
          g.index,
          Math.round(p.x - g.start.x),
          Math.round(p.y - g.start.y),
        ),
      );
      return;
    }
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    setDraft(
      resizePiece(g.piece as PatternPiece, {
        ...(g.axis !== 'y' ? { width: Math.max(10, Math.round(g.w + dx)) } : {}),
        ...(g.axis !== 'x' ? { height: Math.max(10, Math.round(g.h + dy)) } : {}),
      }),
    );
  };
  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g && g.kind !== 'pan' && draft)
      onChange?.(
        draft,
        g.kind === 'point' ? `Move a point of ${draft.name}` : `Resize ${draft.name}`,
      );
    setDraft(null);
  };

  return (
    <div className={cn('relative h-full min-h-0 w-full overflow-hidden bg-white', className)}>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label="Pattern pieces"
        data-testid="pattern-canvas"
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute('data-bg'))
            return;
          const p = toSvg(e);
          gesture.current = { kind: 'pan', sx: p.x, sy: p.y, px: pan.x, py: pan.y };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          onSelect?.(null);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={(e) => {
          const next = Math.min(8, Math.max(0.3, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
          const p = toSvg(e);
          setPan({
            x: p.x - (p.x - pan.x) * (zoom / next),
            y: p.y - (p.y - pan.y) * (zoom / next),
          });
          setZoom(next);
        }}
      >
        <defs>
          <pattern id="grid10" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" stroke="#eef2f7" strokeWidth={1.2} />
          </pattern>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#475569" />
          </marker>
        </defs>
        <rect data-bg x={-5000} y={-5000} width={20000} height={20000} fill="url(#grid10)" />
        {shown.map((p) => {
          const off = lay.offsets.get(p.pieceId);
          if (!off) return null;
          return (
            <PieceShape
              key={p.pieceId}
              piece={p}
              dx={off.dx}
              dy={off.dy}
              k={k}
              unit={unit}
              selected={p.pieceId === selectedId}
              editable={editable && p.pieceId === selectedId}
              showDimensions={showDimensions}
              detailed={p.pieceId === selectedId || !!only || shown.length <= 2}
              showAllowance={showAllowance}
              onSelect={() => onSelect?.(p.pieceId)}
              onPointHandle={(index, e) => {
                const q = toSvg(e);
                gesture.current = { kind: 'point', piece: p, index, start: q };
                (svgRef.current as Element).setPointerCapture(e.pointerId);
              }}
              onResizeHandle={(axis, e) => {
                const q = toSvg(e);
                const b = bounds(p.outline);
                gesture.current = { kind: 'resize', piece: p, axis, start: q, w: b.w, h: b.h };
                (svgRef.current as Element).setPointerCapture(e.pointerId);
              }}
            />
          );
        })}
        {/* 10 cm scale bar */}
        <g transform={`translate(${pan.x + 20 * k}, ${pan.y + vbH - 30 * k})`}>
          <line x1={0} y1={0} x2={100} y2={0} stroke="#0f172a" strokeWidth={2 * k} />
          <line x1={0} y1={-6 * k} x2={0} y2={6 * k} stroke="#0f172a" strokeWidth={2 * k} />
          <line x1={100} y1={-6 * k} x2={100} y2={6 * k} stroke="#0f172a" strokeWidth={2 * k} />
          <text x={110} y={4 * k} fontSize={11 * k} fill="#0f172a">
            10 cm
          </text>
        </g>
      </svg>
      <div className="absolute top-2 right-2 flex gap-1 rounded-md border bg-background/90 p-0.5 shadow-sm">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(8, z * 1.25))}
        >
          <PlusIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.25))}
        >
          <MinusIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Fit all pieces"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          <MaximizeIcon />
        </Button>
      </div>
    </div>
  );
}

function PieceShape({
  piece,
  dx,
  dy,
  k,
  unit,
  selected,
  editable,
  showDimensions,
  detailed,
  showAllowance,
  onSelect,
  onPointHandle,
  onResizeHandle,
}: {
  detailed: boolean;
  piece: CanvasPiece;
  dx: number;
  dy: number;
  k: number;
  unit: Unit;
  selected: boolean;
  editable: boolean;
  showDimensions: boolean;
  showAllowance: boolean;
  onSelect: () => void;
  onPointHandle: (index: number, e: ReactPointerEvent) => void;
  onResizeHandle: (axis: 'x' | 'y' | 'xy', e: ReactPointerEvent) => void;
}) {
  const b = bounds(piece.outline);
  const dims = pieceDimensions({ outline: piece.outline, edges: piece.edges ?? [] });
  const sa = piece.seamAllowanceMm ?? 0;
  const fs = Math.min(13 * k, Math.max(b.w, b.h) / 9);
  const keys = editable ? keyPoints({ outline: piece.outline, edges: piece.edges ?? [] }) : [];
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  return (
    <g
      transform={`translate(${dx} ${dy})`}
      data-testid="pattern-piece"
      data-piece-id={piece.pieceId}
      data-piece-name={piece.name}
    >
      {showAllowance && sa > 0 ? (
        <polygon
          points={poly(offsetOutline(piece.outline, sa))}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1 * k}
          strokeDasharray={`${6 * k} ${4 * k}`}
        />
      ) : null}
      <polygon
        points={poly(piece.outline)}
        fill={selected ? '#dbeafe' : piece.source === 'user' ? '#fef3c7' : '#f8fafc'}
        stroke={selected ? '#1d4ed8' : '#0f172a'}
        strokeWidth={(selected ? 2.4 : 1.6) * k}
        className="cursor-pointer"
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      />
      {piece.foldLine ? (
        <g>
          <line
            x1={piece.foldLine.from.x}
            y1={piece.foldLine.from.y}
            x2={piece.foldLine.to.x}
            y2={piece.foldLine.to.y}
            stroke="#7c3aed"
            strokeWidth={2.2 * k}
            strokeDasharray={`${10 * k} ${5 * k}`}
          />
          <text
            x={(piece.foldLine.from.x + piece.foldLine.to.x) / 2 - 8 * k}
            y={(piece.foldLine.from.y + piece.foldLine.to.y) / 2}
            fontSize={fs}
            fill="#7c3aed"
            transform={`rotate(-90 ${(piece.foldLine.from.x + piece.foldLine.to.x) / 2 - 8 * k} ${(piece.foldLine.from.y + piece.foldLine.to.y) / 2})`}
            textAnchor="middle"
          >
            PLACE ON FOLD
          </text>
        </g>
      ) : null}
      {piece.grainline ? (
        <line
          x1={piece.grainline.from.x}
          y1={piece.grainline.from.y}
          x2={piece.grainline.to.x}
          y2={piece.grainline.to.y}
          stroke="#475569"
          strokeWidth={1.4 * k}
          markerStart="url(#arrow)"
          markerEnd="url(#arrow)"
        />
      ) : null}
      {piece.notches.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={3 * k} fill="#0f172a" />
      ))}
      {(piece.markings ?? []).map((m, i) => (
        <Marking key={i} m={m} k={k} />
      ))}
      <text
        x={cx}
        y={cy - fs * 0.6}
        fontSize={fs * 1.35}
        fontWeight={600}
        textAnchor="middle"
        fill="#0f172a"
        pointerEvents="none"
      >
        {piece.name}
      </text>
      <text
        x={cx}
        y={cy + fs * 0.9}
        fontSize={fs}
        textAnchor="middle"
        fill="#334155"
        pointerEvents="none"
      >
        Cut {piece.cutQuantity}
        {piece.foldLine ? ' on fold' : piece.mirrored ? ' (pair)' : ''} · SA {sa} mm
      </text>
      {showDimensions ? (
        <g pointerEvents="none" data-testid="piece-dimensions">
          {/* overall width below, height on the left */}
          <line
            x1={b.x0}
            y1={b.y1 + sa + 22 * k}
            x2={b.x1}
            y2={b.y1 + sa + 22 * k}
            stroke="#475569"
            strokeWidth={1 * k}
            markerStart="url(#arrow)"
            markerEnd="url(#arrow)"
          />
          <text
            x={cx}
            y={b.y1 + sa + 36 * k}
            fontSize={fs}
            textAnchor="middle"
            fill="#0f172a"
            data-testid="piece-width"
          >
            {fmt(dims.width, unit)} {unit}
          </text>
          <line
            x1={b.x0 - sa - 22 * k}
            y1={b.y0}
            x2={b.x0 - sa - 22 * k}
            y2={b.y1}
            stroke="#475569"
            strokeWidth={1 * k}
            markerStart="url(#arrow)"
            markerEnd="url(#arrow)"
          />
          <text
            x={b.x0 - sa - 28 * k}
            y={cy}
            fontSize={fs}
            textAnchor="middle"
            fill="#0f172a"
            transform={`rotate(-90 ${b.x0 - sa - 28 * k} ${cy})`}
            data-testid="piece-height"
          >
            {fmt(dims.height, unit)} {unit}
          </text>
          {dims.edges
            .filter((e) => detailed && e.length > 25)
            .map((e) => (
              <text
                key={`${e.name}-${e.mid.x}`}
                x={e.mid.x + (e.mid.x < cx ? -6 * k : 6 * k)}
                y={e.mid.y + (e.mid.y < cy ? -5 * k : 12 * k)}
                fontSize={fs * 0.85}
                textAnchor={e.mid.x < cx ? 'end' : 'start'}
                fill="#1e40af"
              >
                {e.label} {fmt(e.length, unit)}
              </text>
            ))}
        </g>
      ) : null}
      {editable ? (
        <g data-testid="piece-handles">
          {keys.map((i) => (
            <circle
              key={i}
              cx={piece.outline[i]!.x}
              cy={piece.outline[i]!.y}
              r={6 * k}
              fill="#fff"
              stroke="#1d4ed8"
              strokeWidth={2 * k}
              className="cursor-move"
              data-testid="point-handle"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPointHandle(i, e);
              }}
            />
          ))}
          {(
            [
              ['x', b.x1, cy],
              ['y', cx, b.y1],
              ['xy', b.x1, b.y1],
            ] as const
          ).map(([axis, x, y]) => (
            <rect
              key={axis}
              x={x - 7 * k}
              y={y - 7 * k}
              width={14 * k}
              height={14 * k}
              fill="#1d4ed8"
              className={
                axis === 'x'
                  ? 'cursor-ew-resize'
                  : axis === 'y'
                    ? 'cursor-ns-resize'
                    : 'cursor-nwse-resize'
              }
              data-testid={`resize-${axis}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResizeHandle(axis, e);
              }}
            />
          ))}
        </g>
      ) : null}
    </g>
  );
}

function Marking({ m, k }: { m: PatternMarking; k: number }) {
  const pts = m.points;
  switch (m.kind) {
    case 'button':
      return (
        <circle
          cx={pts[0]!.x}
          cy={pts[0]!.y}
          r={6 * k}
          fill="none"
          stroke="#0f172a"
          strokeWidth={1.4 * k}
        />
      );
    case 'buttonhole':
      return (
        <line
          x1={pts[0]!.x - 9 * k}
          y1={pts[0]!.y}
          x2={pts[0]!.x + 9 * k}
          y2={pts[0]!.y}
          stroke="#0f172a"
          strokeWidth={2 * k}
        />
      );
    case 'dart':
      return <polyline points={poly(pts)} fill="none" stroke="#dc2626" strokeWidth={1.4 * k} />;
    case 'gather':
      return (
        <polyline
          points={poly(pts)}
          fill="none"
          stroke="#ea580c"
          strokeWidth={1.6 * k}
          strokeDasharray={`${2 * k} ${3 * k}`}
        />
      );
    case 'zip':
      return <polyline points={poly(pts)} fill="none" stroke="#0891b2" strokeWidth={3 * k} />;
    case 'fold':
      return (
        <polyline
          points={poly(pts)}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={1.4 * k}
          strokeDasharray={`${8 * k} ${4 * k}`}
        />
      );
    case 'pleat':
      return <polyline points={poly(pts)} fill="none" stroke="#16a34a" strokeWidth={2 * k} />;
    default:
      return (
        <polyline
          points={poly(pts)}
          fill="none"
          stroke="#64748b"
          strokeWidth={1 * k}
          strokeDasharray={`${4 * k} ${3 * k}`}
        />
      );
  }
}
