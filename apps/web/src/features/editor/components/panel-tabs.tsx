'use client';

import type { ReactNode } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import { cn } from '@/lib/utils';

export interface PanelTab<T extends string> {
  id: T;
  label: string;
}

type TabStore<T extends string> = UseBoundStore<StoreApi<{ tab: T; setTab: (t: T) => void }>>;

/** A tab state shared by a panel's title row and its content (UI state only, never the design). */
export function createTabStore<T extends string>(initial: T): TabStore<T> {
  return create<{ tab: T; setTab: (t: T) => void }>((set) => ({
    tab: initial,
    setTab: (tab) => set({ tab }),
  }));
}

/** Title-row tabs of an editor side panel (ARIA tabs, arrow keys move between them). */
export function PanelTabs<T extends string>({
  name,
  label,
  tabs,
  store,
}: {
  /** Prefix for element ids (`<name>-tab-<id>`, `<name>-panel-<id>`). */
  name: string;
  label: string;
  tabs: readonly PanelTab<T>[];
  store: TabStore<T>;
}) {
  const { tab, setTab } = store();
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex h-8 shrink-0 items-end gap-3 border-b px-3"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${name}-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={`${name}-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const i = tabs.findIndex((x) => x.id === tab);
            const next =
              tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]!.id;
            setTab(next);
            document.getElementById(`${name}-tab-${next}`)?.focus();
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

export function PanelTabContent<T extends string>({
  name,
  store,
  render,
}: {
  name: string;
  store: TabStore<T>;
  render: (tab: T) => ReactNode;
}) {
  const tab = store((s) => s.tab);
  return (
    <div
      role="tabpanel"
      id={`${name}-panel-${tab}`}
      aria-labelledby={`${name}-tab-${tab}`}
      className="h-full"
    >
      {render(tab)}
    </div>
  );
}
