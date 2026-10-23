'use client';

import { SearchIcon } from 'lucide-react';

import { Kbd } from '@/components/ui/kbd';
import { UserMenu } from '@/features/auth/user-menu';
import { OrgSwitcher } from '@/features/organizations/org-switcher';
import { formatCombo } from '@/lib/shortcuts';

import { ThemeMenu } from './theme-menu';

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-panel px-3">
      <OrgSwitcher />

      <button
        type="button"
        onClick={onOpenSearch}
        className="mx-auto flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-background px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SearchIcon className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>{formatCombo('mod+k')}</Kbd>
      </button>

      <ThemeMenu />
      <UserMenu />
    </header>
  );
}
