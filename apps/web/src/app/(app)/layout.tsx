import { type ReactNode, Suspense } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { RouteGuard } from '@/features/auth/route-guard';
import { OrganizationProvider } from '@/features/organizations/organization-provider';

/**
 * Authenticated application area: proxy.ts + RouteGuard send anonymous users to sign-in;
 * OrganizationProvider sends users without an active organization to onboarding.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <RouteGuard>
        <OrganizationProvider>
          <AppShell>{children}</AppShell>
        </OrganizationProvider>
      </RouteGuard>
    </Suspense>
  );
}
