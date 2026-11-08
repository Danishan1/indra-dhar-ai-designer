'use client';

import type { PathNode, PatternPiece } from '@ai-designer/garment-model';
import {
  cutOutline,
  EDGE_LABELS,
  edgeLength,
  edgeMidFrame,
  outlineOrientation,
  outwardNormal,
  pathEdgeLength,
  pieceBounds,
  segCubic,
  segmentAllowances,
  segmentOnFold,
} from '@ai-designer/pattern-model';
import { useMemo } from 'react';

import { fmt, type Unit } from '../options';

/**
 * One pattern piece on the CAD canvas (ADR-059/060), drawn like a paper pattern: seam line (the
 * editable Bézier path), the cutting line with the allowance of each edge (none on the fold), the
 * fold marked "FOLD", the grainline with arrowheads, notch ticks through the allowance, sewing
 * marks, and — when `detailed` — every seam's name and length along it plus the overall size.
 * Sizes in `k` are screen pixels converted to mm (so text stays readable at any zoom).
 */

type Pt = { x: number; y: number };

export function pathD(path: readonly PathNode[]): string {
  const n = path.length;
  if (!n) return '';
  let d = `M${path[0]!.x} ${path[0]!.y}`;
  for (let i = 0; i < n; i++) {
    const c = segCubic(path, i);
    const b = path[(i + 1) % n]!;
    d += c ? `C${c[1].x} ${c[1].y} ${c[2].x} ${c[2].y} ${b.x} ${b.y}` : `L${b.x} ${b.y}`;
  }
  return `${d}Z`;
}

export const poly = (pts: readonly Pt[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/** Text angle kept upright (−90°…90°). */
const upright = (deg: number) => (deg > 90 ? deg - 180 : deg < -90 ? deg + 180 : deg);

function nearestSegment(outline: readonly Pt[], p: Pt): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function Arrow({ from, to, size, color }: { from: Pt; to: Pt; size: number; color: string }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const head = (tip: Pt, dx: number, dy: number) =>
    poly([
      tip,
      { x: tip.x - dx * size + -dy * size * 0.45, y: tip.y - dy * size + dx * size * 0.45 },
      { x: tip.x - dx * size - -dy * size * 0.45, y: tip.y - dy * size - dx * size * 0.45 },
    ]);
  return (
    <>
      <polygon points={head(to, ux, uy)} fill={color} />
      <polygon points={head(from, -ux, -uy)} fill={color} />
    </>
  );
}

export function PieceVector({
  piece,
  selected,
  k,
  unit,
  showAllowance,
  detailed,
  fs,
}: {
  piece: PatternPiece;
  selected: boolean;
  k: number;
  unit: Unit;
  showAllowance: boolean;
  detailed: boolean;
  fs: number;
}) {
  const path = piece.path?.length ? piece.path : null;
  const b = pieceBounds(piece);
  const geo = useMemo(() => {
    const sign = outlineOrientation(piece.outline);
    const allow = segmentAllowances(piece);
    const maxSa = Math.max(0, ...allow);
    const cut = allow.some((a) => a > 0) ? cutOutline(piece) : null;
    const edges = (piece.edges ?? [])
      .filter((e) => e.from < piece.outline.length && e.to < piece.outline.length)
      .map((e) => {
        const f = edgeMidFrame(piece.outline, e, sign);
        return {
          name: e.name,
          label: EDGE_LABELS[e.name] ?? e.name.replaceAll('_', ' '),
          length: edgeLength(piece.outline, e),
          fold: segmentOnFold(piece, f.segment),
          allowance: allow[f.segment] ?? 0,
          ...f,
        };
      });
    const notches = piece.notches.map((n) => {
      const i = nearestSegment(piece.outline, n);
      const a = piece.outline[i]!;
      const c = piece.outline[(i + 1) % piece.outline.length]!;
      return { n, normal: outwardNormal(a, c, sign), sa: allow[i] ?? 0 };
    });
    return { sign, allow, maxSa, cut, edges, notches };
  }, [piece]);
  const sa = piece.seamAllowanceMm ?? 0;
  const label = Math.min(fs * 1.25, Math.max(b.width, b.height) / 8);
  const off = geo.maxSa + 16 * k;
  return (
    <>
      {showAllowance && geo.cut ? (
        <polygon
          points={poly(geo.cut)}
          fill="#f1f5f9"
          stroke="#334155"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          data-testid="cut-line"
        />
      ) : null}
      {path ? (
        <path
          d={pathD(path)}
          fill={selected ? '#dbeafe' : piece.source === 'user' ? '#fef3c7' : '#ffffff'}
          stroke={selected ? '#1d4ed8' : '#0f172a'}
          strokeWidth={selected ? 2 : 1.4}
          strokeDasharray={showAllowance && geo.cut ? '7 3' : undefined}
          vectorEffect="non-scaling-stroke"
          className="cursor-pointer"
        />
      ) : (
        <polygon
          points={poly(piece.outline)}
          fill={selected ? '#dbeafe' : '#ffffff'}
          stroke="#0f172a"
          strokeWidth={1.4}
          strokeDasharray={showAllowance && geo.cut ? '7 3' : undefined}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {piece.foldLine ? (
        <g pointerEvents="none" data-testid="fold-mark">
          <line
            x1={piece.foldLine.from.x}
            y1={piece.foldLine.from.y}
            x2={piece.foldLine.to.x}
            y2={piece.foldLine.to.y}
            stroke="#7c3aed"
            strokeWidth={2.4}
            strokeDasharray="12 4 2 4"
            vectorEffect="non-scaling-stroke"
          />
          {(() => {
            const f = piece.foldLine;
            const mx = (f.from.x + f.to.x) / 2;
            const my = (f.from.y + f.to.y) / 2;
            const ang = upright((Math.atan2(f.to.y - f.from.y, f.to.x - f.from.x) * 180) / Math.PI);
            // Inside the piece: towards the centre of its bounds.
            const nx = b.cx - mx;
            const ny = b.cy - my;
            const nl = Math.hypot(nx, ny) || 1;
            const tx = mx + (nx / nl) * fs * 1.1;
            const ty = my + (ny / nl) * fs * 1.1;
            // Long enough for the full words? Otherwise "FOLD", or just the line.
            const flen = Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y);
            const thin = Math.min(b.width, b.height) < fs * 5;
            const words = thin
              ? null
              : flen > fs * 11
                ? 'PLACE ON FOLD'
                : flen > fs * 4
                  ? 'FOLD'
                  : null;
            if (!words) return null;
            return (
              <text
                x={tx}
                y={ty}
                fontSize={fs * 0.95}
                fontWeight={700}
                letterSpacing={fs * 0.2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#7c3aed"
                transform={`rotate(${ang} ${tx} ${ty})`}
              >
                {words}
              </text>
            );
          })()}
        </g>
      ) : null}
      {piece.grainline ? (
        <g pointerEvents="none" data-testid="grain-mark">
          <line
            x1={piece.grainline.from.x}
            y1={piece.grainline.from.y}
            x2={piece.grainline.to.x}
            y2={piece.grainline.to.y}
            stroke="#334155"
            strokeWidth={1.3}
            vectorEffect="non-scaling-stroke"
          />
          <Arrow from={piece.grainline.from} to={piece.grainline.to} size={8 * k} color="#334155" />
        </g>
      ) : null}
      {geo.notches.map(({ n, normal, sa: nsa }, i) => {
        const len = nsa > 0 ? nsa : 5;
        const dir = nsa > 0 ? 1 : -1;
        return (
          <line
            key={i}
            x1={n.x - normal.x * (nsa > 0 ? 2 : 0)}
            y1={n.y - normal.y * (nsa > 0 ? 2 : 0)}
            x2={n.x + normal.x * len * dir}
            y2={n.y + normal.y * len * dir}
            stroke="#0f172a"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            data-testid="notch"
          />
        );
      })}
      {(piece.markings ?? []).map((m, i) =>
        m.kind === 'button' || m.kind === 'buttonhole' ? (
          m.kind === 'button' ? (
            <g key={i} pointerEvents="none">
              <circle
                cx={m.points[0]!.x}
                cy={m.points[0]!.y}
                r={5}
                fill="none"
                stroke="#0f172a"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={m.points[0]!.x - 3}
                y1={m.points[0]!.y}
                x2={m.points[0]!.x + 3}
                y2={m.points[0]!.y}
                stroke="#0f172a"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={m.points[0]!.x}
                y1={m.points[0]!.y - 3}
                x2={m.points[0]!.x}
                y2={m.points[0]!.y + 3}
                stroke="#0f172a"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ) : (
            <polyline
              key={i}
              points={poly(m.points)}
              fill="none"
              stroke="#0f172a"
              strokeWidth={2.2}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )
        ) : (
          <polyline
            key={i}
            points={poly(m.points)}
            fill="none"
            stroke={
              m.kind === 'dart'
                ? '#dc2626'
                : m.kind === 'zip'
                  ? '#0891b2'
                  : m.kind === 'gather'
                    ? '#ea580c'
                    : '#64748b'
            }
            strokeWidth={m.kind === 'zip' ? 3 : 1.2}
            strokeDasharray={
              m.kind === 'gather' || m.kind === 'line' || m.kind === 'fold' ? '4 3' : undefined
            }
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ),
      )}
      <text
        x={b.cx}
        y={b.cy - label * 0.4}
        fontSize={label}
        textAnchor="middle"
        fontWeight={600}
        fill="#0f172a"
        pointerEvents="none"
      >
        {piece.name}
      </text>
      <text
        x={b.cx}
        y={b.cy + label * 0.85}
        fontSize={label * 0.66}
        textAnchor="middle"
        fill="#475569"
        pointerEvents="none"
      >
        Cut {piece.cutQuantity}
        {piece.foldLine ? ' on fold' : piece.mirrored ? ' (pair)' : ''} · SA {fmt(sa, unit)}
        {piece.allowances?.hem !== undefined && piece.allowances.hem !== sa
          ? ` · hem ${fmt(piece.allowances.hem, unit)}`
          : ''}{' '}
        {unit}
      </text>
      {detailed ? (
        <g pointerEvents="none" data-testid="piece-dimensions">
          {/* Overall width, below the cut line. */}
          <line
            x1={b.x}
            y1={b.y + b.height + off}
            x2={b.x + b.width}
            y2={b.y + b.height + off}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={b.x}
            y1={b.y + b.height + off - 5 * k}
            x2={b.x}
            y2={b.y + b.height + off + 5 * k}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={b.x + b.width}
            y1={b.y + b.height + off - 5 * k}
            x2={b.x + b.width}
            y2={b.y + b.height + off + 5 * k}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={b.cx}
            y={b.y + b.height + off + fs * 1.15}
            fontSize={fs}
            textAnchor="middle"
            fill="#0f172a"
            data-testid="piece-width"
          >
            {fmt(Math.round(b.width), unit)} {unit}
          </text>
          {/* Overall height, left of the cut line. */}
          <line
            x1={b.x - off}
            y1={b.y}
            x2={b.x - off}
            y2={b.y + b.height}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={b.x - off - 5 * k}
            y1={b.y}
            x2={b.x - off + 5 * k}
            y2={b.y}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={b.x - off - 5 * k}
            y1={b.y + b.height}
            x2={b.x - off + 5 * k}
            y2={b.y + b.height}
            stroke="#475569"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={b.x - off - fs * 0.5}
            y={b.cy}
            fontSize={fs}
            textAnchor="middle"
            fill="#0f172a"
            transform={`rotate(-90 ${b.x - off - fs * 0.5} ${b.cy})`}
            data-testid="piece-height"
          >
            {fmt(Math.round(b.height), unit)} {unit}
          </text>
          {/* Every seam, labelled along itself outside the cutting line. */}
          {geo.edges
            .filter((e) => e.length > 15)
            .map((e) => {
              const d = (showAllowance ? e.allowance : 0) + 6 * k + fs * 0.45;
              const x = e.p.x + e.normal.x * d;
              const y = e.p.y + e.normal.y * d;
              const len = path ? pathEdgeLength(path, e.name) : e.length;
              const extra = e.fold
                ? ' · fold'
                : e.allowance !== sa
                  ? ` · SA ${fmt(e.allowance, unit)}`
                  : '';
              // Short seams show the number only (the name on hover) so labels never pile up.
              const full = `${e.label} ${fmt(len, unit)}${extra}`;
              const fits = full.length * fs * 0.85 * 0.55 < len * 1.1;
              return (
                <text
                  key={`${e.name}-${e.segment}`}
                  x={x}
                  y={y}
                  fontSize={fs * 0.85}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={e.fold ? '#7c3aed' : '#1e40af'}
                  transform={`rotate(${upright(e.angle)} ${x} ${y})`}
                  data-testid={`edge-label-${e.name}`}
                >
                  <title>{full}</title>
                  {fits ? full : fmt(len, unit)}
                </text>
              );
            })}
        </g>
      ) : null}
    </>
  );
}
