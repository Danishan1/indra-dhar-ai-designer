'use client';

import { geometryCapability } from '@ai-designer/garment-render';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { cn } from '@/lib/utils';

import { GarmentCanvas } from '../canvas/garment-canvas';
import { useEditor } from '../store-context';

import { PatternSheet } from './pattern-svg';

type Mode = 'garment' | 'patterns' | 'reference';

const MODE_LABELS: Record<Mode, string> = {
  garment: 'Garment',
  patterns: 'Patterns',
  reference: 'Reference',
};

/**
 * Garment view and Pattern view of the same structured design (ADR-056), plus the uploaded
 * reference images with component regions. All three select the same components — the views stay
 * in sync because they are drawn from the one design state.
 */
export function StudioViewport() {
  const state = useEditor((s) => s.display);
  const pieces = state.patternPieces ?? [];
  const sources = (state.sources ?? []).filter(
    (s) => s.role === 'sketch' || s.role === 'reference',
  );
  const drawable = geometryCapability(state) === 'G2';
  const modes: Mode[] = [
    'garment',
    ...(pieces.length ? (['patterns'] as const) : []),
    ...(sources.length ? (['reference'] as const) : []),
  ];
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode =
    chosen && modes.includes(chosen)
      ? chosen
      : !drawable && sources.length
        ? 'reference'
        : 'garment';

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {modes.length > 1 ? (
        <div
          role="group"
          aria-label="Design view"
          className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 rounded-md border bg-panel/95 p-0.5 shadow-sm"
        >
          {modes.map((m) => (
            <Button
              key={m}
              size="sm"
              variant="ghost"
              aria-pressed={mode === m}
              className={cn('h-6 px-2 text-xs', mode === m && 'bg-accent text-accent-foreground')}
              onClick={() => setChosen(m)}
              data-testid={`view-${m}`}
            >
              {MODE_LABELS[m]}
            </Button>
          ))}
        </div>
      ) : null}
      {mode === 'garment' ? (
        <GarmentCanvas />
      ) : mode === 'patterns' ? (
        <PatternView />
      ) : (
        <ReferenceView />
      )}
    </div>
  );
}

function PatternView() {
  const state = useEditor((s) => s.display);
  const selected = useEditor((s) => s.selection.ids);
  const select = useEditor((s) => s.select);
  const clear = useEditor((s) => s.clearSelection);
  const pieces = useMemo(() => state.patternPieces ?? [], [state.patternPieces]);
  const highlight = useMemo(() => new Set(selected), [selected]);
  const pieceOwner = useMemo(
    () => new Map(pieces.map((p) => [p.pieceId, p.componentId])),
    [pieces],
  );
  const provisional = pieces.filter((p) => p.status !== 'confirmed').length;
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30" data-testid="pattern-view">
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
      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        {pieces.length} pieces · {provisional} provisional · seam line solid, seam allowance dashed,
        grainline arrows, notches and fold lines marked · single base size
      </p>
    </div>
  );
}

function ReferenceView() {
  const { active } = useOrganization();
  const state = useEditor((s) => s.display);
  const selected = useEditor((s) => s.selection.ids);
  const select = useEditor((s) => s.select);
  const sources = (state.sources ?? []).filter(
    (s) => s.role === 'sketch' || s.role === 'reference',
  );
  const [index, setIndex] = useState(0);
  const source = sources[Math.min(index, sources.length - 1)];
  if (!source) return null;
  const regions = state.components.filter(
    (c) => c.sourceRegion?.assetId === source.assetId && c.componentType !== 'garment_body',
  );
  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30" data-testid="reference-view">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="relative max-h-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- authorized API stream */}
          <img
            src={assetContentUrl(active.id, source.assetId, 'preview_1024')}
            alt={source.label ?? 'Reference image'}
            className="block max-h-[calc(100vh-16rem)] min-h-[min(420px,calc(100vh-16rem))] w-auto max-w-full rounded-md border bg-white [image-rendering:auto]"
          />
          {regions.map((c) => {
            const r = c.sourceRegion!;
            const on = selected.includes(c.componentId);
            return (
              <button
                key={c.componentId}
                type="button"
                aria-label={`Select ${c.displayName}`}
                title={c.displayName}
                onClick={(e) => select(c.componentId, e.shiftKey ? 'toggle' : 'replace')}
                className={cn(
                  'absolute rounded-sm border-2 transition-colors',
                  on
                    ? 'border-primary bg-primary/15'
                    : 'border-transparent hover:border-primary/60 hover:bg-primary/5',
                )}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          Your {source.role} — click a part to select it. This garment family is shown from your
          images; the structured design is still the source of truth.
        </span>
        {sources.length > 1 ? (
          <span className="ml-auto flex gap-1">
            {sources.map((s, i) => (
              <Button
                key={s.assetId}
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[11px]"
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </Button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}
