'use client';

import { pathDataBounds, type SceneElement } from '@ai-designer/garment-render';
import { useContext, useMemo } from 'react';

import { useEditor } from '../store-context';

import { type FindingKind, KIND_LABELS, KIND_ORDER, kindOf } from './severity';
import { ValidationContext } from './validation-context';

const COLORS: Record<Exclude<FindingKind, 'info'>, string> = {
  blocking: 'var(--color-destructive)',
  warning: 'var(--color-status-needs-review)',
  review: 'var(--color-status-proposed)',
};

/**
 * Canvas badges on components with design-structure findings (FR-EDT-118): the worst kind wins,
 * icon text plus colour, sized in screen pixels. Never part of the drawing.
 */
export function CanvasFindingMarkers({
  elements,
  zoom,
}: {
  elements: readonly SceneElement[];
  zoom: number;
}) {
  const v = useContext(ValidationContext);
  const components = useEditor((s) => s.display.components);
  const markers = useMemo(() => {
    if (!v?.run) return [];
    const out: {
      id: string;
      kind: Exclude<FindingKind, 'info'>;
      x: number;
      y: number;
      title: string;
    }[] = [];
    for (const [componentId, findings] of v.byComponent) {
      const relevant = findings.filter((f) => kindOf(f) !== 'info');
      if (!relevant.length) continue;
      const worst = relevant
        .map(kindOf)
        .sort((a, b) => KIND_ORDER[a] - KIND_ORDER[b])[0] as Exclude<FindingKind, 'info'>;
      // A component that is not drawn (e.g. a cuff on a sleeveless sleeve) is marked on the
      // nearest drawn ancestor.
      let ds: string[] = [];
      let at: string | null = componentId;
      for (let hops = 0; at && !ds.length && hops < 6; hops++) {
        const id: string = at;
        ds = elements.filter((e) => e.componentId === id).map((e) => e.d);
        at = components.find((c) => c.componentId === id)?.parentComponentId ?? null;
      }
      const b = ds.length ? pathDataBounds(ds) : null;
      if (!b) continue;
      out.push({
        id: componentId,
        kind: worst,
        x: b.x + b.width,
        y: b.y,
        title: relevant.map((f) => `${KIND_LABELS[kindOf(f)]}: ${f.message}`).join('\n'),
      });
    }
    return out;
  }, [v, elements, components]);
  if (!markers.length) return null;
  const r = 8 / Math.max(zoom, 0.05);
  return (
    <g pointerEvents="none" data-layer="finding-markers" opacity={v?.stale ? 0.5 : 1}>
      {markers.map((m) => (
        <g key={m.id} data-finding-marker={m.id} data-kind={m.kind}>
          <title>{m.title}</title>
          <circle
            cx={m.x}
            cy={m.y}
            r={r}
            fill={COLORS[m.kind]}
            stroke="white"
            strokeWidth={r / 6}
          />
          <text
            x={m.x}
            y={m.y}
            fontSize={r * 1.3}
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
          >
            {m.kind === 'review' ? '?' : '!'}
          </text>
        </g>
      ))}
    </g>
  );
}
