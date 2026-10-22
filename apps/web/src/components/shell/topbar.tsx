'use client';

import { Building2Icon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserMenu } from '@/features/auth/user-menu';
import { formatCombo } from '@/lib/shortcuts';

import { ThemeMenu } from './theme-menu';

export function Topbar({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b bg-panel px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Organization switching arrives in I06. */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            aria-label="Organization (arrives in I06)"
            aria-disabled
          >
            <Building2Icon aria-hidden />
            <span className="text-[13px]">No organization</span>
            <ChevronsUpDownIcon className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Organizations arrive in I06</TooltipContent>
      </Tooltip>

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
