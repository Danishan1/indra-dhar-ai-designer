'use client';

import type { ReactNode } from 'react';

import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';

import { createTabStore, PanelTabContent, PanelTabs } from '../components/panel-tabs';
import { LooksPanel } from '../looks/looks-panel';
import { HistoryPanel } from '../revisions/history-panel';
import { useEditor } from '../store-context';
import { ValidationPanel } from '../validation/validation-panel';

import { PatternSidePanel } from './pattern-workspace';

/**
 * Right panel of the pattern editor (ADR-062): the pattern tabs plus the design panels the
 * component editor has — look previews (ADR-064), revision history (compare, inspect, restore), the session's changes
 * (undo list), validation findings and the reference images.
 */

type Tab = 'pattern' | 'looks' | 'history' | 'changes' | 'checks' | 'references';
export const usePatternRightTab = createTabStore<Tab>('pattern');
const TABS = [
  { id: 'pattern', label: 'Pattern' },
  { id: 'looks', label: 'Looks' },
  { id: 'history', label: 'History' },
  { id: 'changes', label: 'Changes' },
  { id: 'checks', label: 'Checks' },
  { id: 'references', label: 'Sketch' },
] as const;

export function PatternRightTabs() {
  return (
    <PanelTabs name="pattern-right" label="Right panel" tabs={TABS} store={usePatternRightTab} />
  );
}

export function PatternRightContent({ changes }: { changes: ReactNode }) {
  return (
    <PanelTabContent
      name="pattern-right"
      store={usePatternRightTab}
      render={(tab) =>
        tab === 'pattern' ? (
          <div className="flex h-full min-h-0 flex-col">
            <PatternSidePanel />
          </div>
        ) : tab === 'looks' ? (
          <LooksPanel />
        ) : tab === 'history' ? (
          <HistoryPanel />
        ) : tab === 'changes' ? (
          <div className="h-full overflow-auto" data-testid="changes-panel">
            {changes}
          </div>
        ) : tab === 'checks' ? (
          <div className="h-full overflow-auto">
            <ValidationPanel />
          </div>
        ) : (
          <References />
        )
      }
    />
  );
}

function References() {
  const sources = useEditor((s) => s.display.sources ?? []);
  const { active } = useOrganization();
  if (!sources.length)
    return <p className="p-3 text-[12px] text-muted-foreground">No reference images.</p>;
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3" data-testid="references-panel">
      {sources.map((s) => (
        <figure key={s.assetId} className="flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetContentUrl(active.id, s.assetId, 'preview_1024')}
            alt={s.label ?? 'Reference'}
            className="w-full rounded-md border bg-white object-contain"
          />
          <figcaption className="text-[11px] text-muted-foreground">
            {s.label ?? s.role} · {s.role}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
