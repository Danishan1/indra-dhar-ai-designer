'use client';

import { outlineBounds, type PatternPiece } from '@ai-designer/garment-model';
import { offsetOutline } from '@ai-designer/pattern-model';
import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

import { PatternSheet } from './pattern-svg';

const r1 = (v: number) => Math.round(v * 10) / 10;
const poly = (pts: readonly { x: number; y: number }[]) =>
  pts.map((p) => `${p.x},${p.y}`).join(' ');

const SOURCE_LABEL: Record<string, string> = {
  extracted: 'from your pattern',
  inferred: 'AI outline',
  generated: 'drafted from measurements',
  library: 'from the library',
  user: 'edited by you',
};

/**
 * Pattern view (ADR-057): all pieces of the garment, or only the pieces of the selected component
 * (a component can have several). Pieces are geometry, not pictures — drag a point of the seam line,
 * change seam allowance, cut quantity, grain or fold; every change is a design operation on the
 * same project and marks the piece as edited (`needs review`).
 */
export function PatternEditor() {
  const state = useEditor((s) => s.display);
  const selected = useEditor((s) => s.selection.ids);
  const select = useEditor((s) => s.select);
  const clear = useEditor((s) => s.clearSelection);
  const apply = useEditor((s) => s.apply);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const [mode, setMode] = useState<'all' | 'selected'>('all');
  const pieces = useMemo(() => state.patternPieces ?? [], [state.patternPieces]);
  const forSelection = pieces.filter((p) => selected.includes(p.componentId));
  const showing = mode === 'selected' ? forSelection : pieces;
  const highlight = useMemo(() => new Set(selected), [selected]);
  const pieceOwner = useMemo(
    () => new Map(pieces.map((p) => [p.pieceId, p.componentId])),
    [pieces],
  );
  const provisional = pieces.filter((p) => p.status !== 'confirmed').length;
  const nameOf = (id: string) =>
    state.components.find((c) => c.componentId === id)?.displayName ?? '';

  const commit = (piece: PatternPiece, label: string) => {
    const own = pieces.filter((p) => p.componentId === piece.componentId);
    apply(
      {
        type: 'replace_pattern_pieces',
        componentId: piece.componentId,
        pieces: own.map((p) => (p.pieceId === piece.pieceId ? piece : p)),
      },
      { label },
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30" data-testid="pattern-view">
      <div className="flex items-center gap-2 border-b bg-panel/95 px-2 py-1 text-xs">
        <div
          role="group"
          aria-label="Pattern pieces shown"
          className="flex rounded-md border p-0.5"
        >
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={mode === 'all'}
            className={cn('h-6 px-2 text-xs', mode === 'all' && 'bg-accent')}
            onClick={() => setMode('all')}
            data-testid="patterns-all"
          >
            All pieces
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={mode === 'selected'}
            className={cn('h-6 px-2 text-xs', mode === 'selected' && 'bg-accent')}
            onClick={() => setMode('selected')}
            data-testid="patterns-selected"
          >
            Selected component
          </Button>
        </div>
        <span className="text-muted-foreground">
          {pieces.length} pieces · {provisional} not confirmed · single base size
        </span>
      </div>
      {mode === 'all' ? (
        <div
          className="min-h-0 flex-1 cursor-pointer overflow-auto p-6"
          onClick={(e) => {
            const g = (e.target as Element).closest('[data-piece-id]');
            const owner = g ? pieceOwner.get(g.getAttribute('data-piece-id') ?? '') : undefined;
            if (owner) select(owner, e.shiftKey ? 'toggle' : 'replace');
            else clear();
          }}
        >
          <PatternSheet
            pieces={pieces}
            highlight={highlight}
            className="mx-auto h-full max-w-5xl rounded-md border bg-white shadow-sm"
          />
        </div>
      ) : showing.length === 0 ? (
        <p
          className="m-auto max-w-sm p-6 text-center text-[13px] text-muted-foreground"
          data-testid="no-selected-pieces"
        >
          {selected.length
            ? `${nameOf(selected[0]!)} has no pattern pieces.`
            : 'Select a component to see and edit its pattern pieces.'}
        </p>
      ) : (
        <div
          className="grid min-h-0 flex-1 gap-4 overflow-auto p-4 lg:grid-cols-2"
          data-testid="selected-pieces"
        >
          {showing.map((p) => (
            <PieceCard
              key={p.pieceId}
              piece={p}
              component={nameOf(p.componentId)}
              canEdit={canEdit}
              onCommit={commit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PieceCard({
  piece,
  component,
  canEdit,
  onCommit,
}: {
  piece: PatternPiece;
  component: string;
  canEdit: boolean;
  onCommit: (p: PatternPiece, label: string) => void;
}) {
  const [preview, setPreview] = useState<PatternPiece | null>(null);
  const drag = useRef<{ i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const p = preview ?? piece;
  const b = outlineBounds(p.outline);
  const sa = p.seamAllowanceMm ?? 0;
  const pad = sa + 30;
  const vb = `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`;
  const unit = (b.width + pad * 2) / 420;
  const edited = (next: PatternPiece, label: string) =>
    onCommit({ ...next, source: 'user', status: 'needs_review' }, label);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: r1(q.x), y: r1(q.y) };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const at = toSvg(e);
    const i = drag.current.i;
    setPreview({ ...piece, outline: piece.outline.map((q, k) => (k === i ? at : q)) });
  };
  const onUp = () => {
    drag.current = null;
    if (preview) edited(preview, `Reshape pattern ${piece.name.toLowerCase()}`);
    setPreview(null);
  };
  const grainDeg = p.grainline
    ? Math.round(
        (Math.atan2(p.grainline.to.y - p.grainline.from.y, p.grainline.to.x - p.grainline.from.x) *
          180) /
          Math.PI,
      )
    : null;

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border bg-white p-3 text-[12px] text-slate-900"
      data-testid="pattern-piece-card"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{p.name}</span>
        <span className="text-muted-foreground">
          {component} · {Math.round(b.width)} × {Math.round(b.height)} mm
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={vb}
        className="h-64 w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label={`Pattern piece ${p.name}`}
      >
        <polygon
          points={poly(offsetOutline(p.outline, sa))}
          fill="none"
          stroke="#6b7280"
          strokeWidth={unit}
          strokeDasharray={`${6 * unit} ${4 * unit}`}
        />
        <polygon
          points={poly(p.outline)}
          fill="#f8fafc"
          stroke="#111827"
          strokeWidth={1.6 * unit}
        />
        {p.foldLine ? (
          <line
            x1={p.foldLine.from.x}
            y1={p.foldLine.from.y}
            x2={p.foldLine.to.x}
            y2={p.foldLine.to.y}
            stroke="#2563eb"
            strokeWidth={1.4 * unit}
            strokeDasharray={`${12 * unit} ${4 * unit} ${2 * unit} ${4 * unit}`}
          />
        ) : null}
        {p.grainline ? (
          <line
            x1={p.grainline.from.x}
            y1={p.grainline.from.y}
            x2={p.grainline.to.x}
            y2={p.grainline.to.y}
            stroke="#111827"
            strokeWidth={1.2 * unit}
            markerEnd="url(#pe-arrow)"
            markerStart="url(#pe-arrow)"
          />
        ) : null}
        <defs>
          <marker
            id="pe-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="#111827" />
          </marker>
        </defs>
        {p.notches.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={3 * unit} fill="#111827" />
        ))}
        {canEdit
          ? p.outline.map((q, i) => (
              <rect
                key={i}
                x={q.x - 4 * unit}
                y={q.y - 4 * unit}
                width={8 * unit}
                height={8 * unit}
                fill="#fff"
                stroke="#2563eb"
                strokeWidth={unit}
                className="cursor-move"
                data-testid="pattern-point"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture(e.pointerId);
                  drag.current = { i };
                }}
              />
            ))
          : null}
      </svg>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          label="Seam allowance (mm)"
          value={p.seamAllowanceMm ?? 0}
          min={0}
          max={100}
          disabled={!canEdit}
          onCommit={(v) => edited({ ...piece, seamAllowanceMm: v }, 'Change seam allowance')}
        />
        <NumberField
          label="Cut quantity"
          value={p.cutQuantity}
          min={1}
          max={12}
          step={1}
          disabled={!canEdit}
          onCommit={(v) => edited({ ...piece, cutQuantity: Math.round(v) }, 'Change cut quantity')}
        />
        <NumberField
          label="Grain angle (°)"
          value={grainDeg ?? 90}
          min={-180}
          max={180}
          step={1}
          disabled={!canEdit}
          onCommit={(deg) => {
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const len =
              Math.min(b.width, b.height) * 0.35 +
              Math.abs(Math.sin((deg * Math.PI) / 180)) * b.height * 0.25;
            const dx = (Math.cos((deg * Math.PI) / 180) * len) / 2;
            const dy = (Math.sin((deg * Math.PI) / 180) * len) / 2;
            edited(
              {
                ...piece,
                grainline: {
                  from: { x: r1(cx - dx), y: r1(cy - dy) },
                  to: { x: r1(cx + dx), y: r1(cy + dy) },
                },
              },
              'Change grainline',
            );
          }}
        />
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Cut</span>
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!p.foldLine}
                disabled={!canEdit}
                onChange={(e) =>
                  edited(
                    {
                      ...piece,
                      foldLine: e.target.checked
                        ? { from: { x: b.x, y: b.y }, to: { x: b.x, y: b.y + b.height } }
                        : null,
                    },
                    'Toggle fold',
                  )
                }
              />
              on fold
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={p.mirrored}
                disabled={!canEdit}
                onChange={(e) =>
                  edited({ ...piece, mirrored: e.target.checked }, 'Toggle mirrored pair')
                }
              />
              pair
            </label>
          </span>
        </label>
      </div>
      <p
        className={cn(
          'text-[11px]',
          p.status === 'confirmed' ? 'text-status-confirmed' : 'text-status-needs-review',
        )}
      >
        {p.status === 'confirmed'
          ? 'Confirmed'
          : p.status === 'needs_review'
            ? 'Needs review'
            : 'Provisional'}{' '}
        · {SOURCE_LABEL[p.source] ?? p.source} · {p.pieceId}
        {p.notes.length ? ` · ${p.notes.at(-1)}` : ''}
      </p>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 0.5,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text);
    setText(null);
    if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v);
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        className="h-7 text-xs"
        value={text ?? String(value)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
    </label>
  );
}
