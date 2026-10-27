'use client';

import { create } from 'zustand';

import { cn } from '@/lib/utils';

import { HierarchyPanel } from '../hierarchy/hierarchy-panel';

import { LibraryPanel } from './library-panel';

type LeftTab = 'parts' | 'library';
/** Which left tab is open (UI state only; shared by the header tabs and the content). */
const useLeftTab = create<{ tab: LeftTab; setTab: (t: LeftTab) => void }>((set) => ({
  tab: 'parts',
  setTab: (tab) => set({ tab }),
}));

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'parts', label: 'Parts' },
  { id: 'library', label: 'Library' },
];

/** Title row of the left panel: Parts (component hierarchy) / Library (artifacts, I18). */
export function LeftPanelTabs() {
  const { tab, setTab } = useLeftTab();
  return (
    <div
      role="tablist"
      aria-label="Left panel"
      className="flex h-8 shrink-0 items-end gap-3 border-b px-3"
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`left-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`left-panel-${t.id}`}
          onClick={() => setTab(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              const next = TABS[(TABS.findIndex((x) => x.id === tab) + 1) % TABS.length]!.id;
              setTab(next);
              document.getElementById(`left-tab-${next}`)?.focus();
            }
          }}
          className={cn(
            '-mb-px border-b-2 pb-1.5 text-[11px] font-semibold tracking-wide uppercase',
            tab === t.id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function LeftPanelContent() {
  const tab = useLeftTab((s) => s.tab);
  return (
    <div
      role="tabpanel"
      id={`left-panel-${tab}`}
      aria-labelledby={`left-tab-${tab}`}
      className="h-full"
    >
      {tab === 'parts' ? <HierarchyPanel /> : <LibraryPanel />}
    </div>
  );
}
