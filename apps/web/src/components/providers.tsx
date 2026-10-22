'use client';

import type { ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider } from '@/features/auth/session-provider';
import { QueryProvider } from '@/lib/query/provider';
import { ShortcutsProvider } from '@/lib/shortcuts-provider';
import { ThemeProvider } from '@/lib/theme';

/** Client-side providers shared by every route group. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SessionProvider>
          <ShortcutsProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </ShortcutsProvider>
        </SessionProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
