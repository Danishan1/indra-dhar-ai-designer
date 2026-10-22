'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { PreferenceKeys, readPreference, writePreference } from '@/lib/local-preferences';
import { useShortcut } from '@/lib/shortcuts-provider';

import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/** Authenticated-app frame: collapsible sidebar, top bar, scrollable content area. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Read the stored sidebar state after mount (avoids a server/client mismatch).
  useEffect(() => {
    if (readPreference(PreferenceKeys.sidebarCollapsed) === 'true') setCollapsed(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      writePreference(PreferenceKeys.sidebarCollapsed, String(!prev));
      return !prev;
    });
  }, []);

  useShortcut({
    id: 'shell.sidebar',
    combo: 'mod+b',
    description: 'Toggle sidebar',
    handler: toggleSidebar,
  });
  useShortcut({
    id: 'shell.search',
    combo: 'mod+k',
    description: 'Open search',
    allowInInputs: true,
    handler: () => setPaletteOpen((open) => !open),
  });

  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSearch={() => setPaletteOpen(true)} />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto outline-none">
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
