import { type ReactNode, Suspense } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { RouteGuard } from '@/features/auth/route-guard';

/** Authenticated application area: proxy.ts + RouteGuard send anonymous users to sign-in. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <RouteGuard>
        <AppShell>{children}</AppShell>
      </RouteGuard>
    </Suspense>
  );
}
