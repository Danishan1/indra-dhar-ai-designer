import { type ReactNode, Suspense } from 'react';

import { RouteGuard } from '@/features/auth/route-guard';

/** Signed-in setup flows that run before an organization exists (onboarding). No app chrome. */
export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <RouteGuard>{children}</RouteGuard>
    </Suspense>
  );
}
