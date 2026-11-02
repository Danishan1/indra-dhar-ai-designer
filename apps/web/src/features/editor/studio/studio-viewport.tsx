'use client';

import { geometryCapability } from '@ai-designer/garment-render';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { cn } from '@/lib/utils';

import { GarmentCanvas } from '../canvas/garment-canvas';
import { useEditor } from '../store-context';

import { PatternEditor } from './pattern-editor';
import { ReconstructionCanvas } from './reconstruction-canvas';

type Mode = 'original' | 'reconstruction' | 'flat' | 'patterns';

const MODE_LABELS: Record<Mode, string> = {
  original: 'Original',
  reconstruction: 'Reconstruction',
  flat: 'Technical flat',
  patterns: 'Patterns',
};

/**
 * Views of the one garment project (ADR-057): the untouched original upload, the editable vector
 * reconstruction, the parametric technical flat (shirts / T-shirts) and the flat patterns. They
 * share the design state and the selection — never separate editors — so switching keeps every
 * change.
 */
export function StudioViewport() {
  const state = useEditor((s) => s.display);
  const pieces = state.patternPieces ?? [];
  const sources = (state.sources ?? []).filter(
    (s) => s.role === 'sketch' || s.role === 'reference',
  );
  const drawable = geometryCapability(state) === 'G2';
  const hasShapes = state.components.some((c) => c.shapes?.length);
  const modes: Mode[] = [
    ...(sources.length ? (['original'] as const) : []),
    ...(hasShapes || !drawable ? (['reconstruction'] as const) : []),
    ...(drawable ? (['flat'] as const) : []),
    ...(pieces.length ? (['patterns'] as const) : []),
  ];
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode =
    chosen && modes.includes(chosen)
      ? chosen
      : hasShapes
        ? 'reconstruction'
        : drawable
          ? 'flat'
          : (modes[0] ?? 'reconstruction');

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {modes.length > 1 ? (
        <div
          role="group"
          aria-label="Design view"
          className="flex justify-center border-b bg-panel/95 p-0.5"
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
      <div className="relative min-h-0 flex-1">
        {mode === 'flat' ? (
          <GarmentCanvas />
        ) : mode === 'patterns' ? (
          <PatternEditor />
        ) : mode === 'original' ? (
          <ReferenceView />
        ) : (
          <ReconstructionCanvas />
        )}
      </div>
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
