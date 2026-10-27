import { type ReactNode, Suspense } from 'react';

import { RouteGuard } from '@/features/auth/route-guard';
import { OrganizationProvider } from '@/features/organizations/organization-provider';

/**
 * Full-viewport workspace (no app sidebar); the editor owns the whole window. Signed-in only, in the
 * active organization (designs are organization data).
 */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <Suspense>
        <RouteGuard>
          <OrganizationProvider>{children}</OrganizationProvider>
        </RouteGuard>
      </Suspense>
    </div>
  );
}
