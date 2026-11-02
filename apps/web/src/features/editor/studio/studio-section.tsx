'use client';

import type { DesignComponent } from '@ai-designer/garment-model';
import { draftComponentPieces, outdatedPieces } from '@ai-designer/pattern-model';
import { RefreshCwIcon } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/ui/button';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';

import { useEditor } from '../store-context';

import { PatternSheet } from './pattern-svg';

const SOURCE_LABEL: Record<string, string> = {
  extracted: 'from your pattern',
  inferred: 'AI outline',
  generated: 'drafted from measurements',
  library: 'from the library',
  user: 'entered by you',
};

/**
 * AI studio details of one component (ADR-056): its visual (cut from the uploaded image) and its
 * pattern pieces — kept in sync with the garment: when measurements change, "Redraft" updates the
 * parametric pieces with one undoable operation.
 */
export function StudioSection({ component }: { component: DesignComponent }) {
  const { active } = useOrganization();
  const state = useEditor((s) => s.display);
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const apply = useEditor((s) => s.apply);
  const visual = component.assetRefs.find((a) => a.role === 'visual');
  const pieces = useMemo(
    () => (state.patternPieces ?? []).filter((p) => p.componentId === component.componentId),
    [state.patternPieces, component.componentId],
  );
  const outdated = useMemo(
    () => outdatedPieces(state).some((p) => p.componentId === component.componentId),
    [state, component.componentId],
  );
  const draftable = useMemo(
    () => draftComponentPieces(state, component).length > 0,
    [state, component],
  );
  if (!visual && pieces.length === 0 && !draftable) return null;

  const redraft = () => {
    const fresh = draftComponentPieces(state, component, { previous: pieces });
    // Keep pieces that came from an uploaded pattern or the library; replace drafted ones.
    const kept = pieces.filter((p) => p.draft?.method !== 'parametric');
    const keptTemplates = new Set(kept.map((p) => p.name));
    apply(
      {
        type: 'replace_pattern_pieces',
        componentId: component.componentId,
        pieces: [...kept, ...fresh.filter((p) => !keptTemplates.has(p.name))],
      },
      { label: `Redraft ${component.displayName.toLowerCase()} pattern` },
    );
  };

  return (
    <details open className="border-b" data-testid="studio-section">
      <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase select-none">
        Pattern &amp; reference
      </summary>
      <div className="flex flex-col gap-2 px-3 pb-3">
        {visual ? (
          // eslint-disable-next-line @next/next/no-img-element -- authorized API stream
          <img
            src={assetContentUrl(active.id, visual.assetId, 'thumb_256')}
            alt={`${component.displayName} in your image (reference)`}
            className="h-24 w-24 rounded-md border bg-white object-contain"
            data-testid="component-visual"
          />
        ) : null}
        {pieces.length ? (
          <>
            <PatternSheet
              pieces={pieces}
              maxWidth={900}
              className="h-40 rounded-md border bg-white"
              label={`Pattern of ${component.displayName}`}
            />
            <ul className="flex flex-col gap-0.5 text-[12px]" data-testid="pattern-pieces">
              {pieces.map((p) => (
                <li key={p.pieceId} className="flex flex-col">
                  <span>
                    {p.name}
                    <span className="text-muted-foreground">
                      {' '}
                      · cut {p.cutQuantity}
                      {p.foldLine ? ' on fold' : ''} · SA {p.seamAllowanceMm} mm
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-status-needs-review">
                    {p.status === 'confirmed' ? 'Confirmed' : 'Provisional'} ·{' '}
                    {SOURCE_LABEL[p.source] ?? p.source}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">No pattern pieces yet.</p>
        )}
        {outdated ? (
          <p className="text-[12px] text-status-needs-review" data-testid="pattern-outdated">
            Measurements changed since the pattern was drafted.
          </p>
        ) : null}
        {canEdit && !component.locked && draftable ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 self-start text-xs"
            onClick={redraft}
            data-testid="redraft-pattern"
          >
            <RefreshCwIcon /> {pieces.length ? 'Redraft from measurements' : 'Draft pattern'}
          </Button>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Patterns are provisional (single base size, not graded) until measured and confirmed.
        </p>
      </div>
    </details>
  );
}
