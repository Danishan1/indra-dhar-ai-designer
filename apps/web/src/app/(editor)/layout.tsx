import { type ReactNode, Suspense } from 'react';

import { RouteGuard } from '@/features/auth/route-guard';

/** Full-viewport workspace (no app sidebar); the editor owns the whole window. Signed-in only. */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-background">
      <Suspense>
        <RouteGuard>{children}</RouteGuard>
      </Suspense>
    </div>
  );
}
