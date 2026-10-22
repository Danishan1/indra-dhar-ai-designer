'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { ErrorState, LoadingState } from '@/components/states/states';

import { signInUrl } from './return-to';
import { useSession } from './session-provider';

/**
 * Renders children only for a signed-in user; otherwise redirects to sign-in with `returnTo`.
 * `proxy.ts` already redirects requests without a session cookie; this also covers expired or
 * revoked sessions. Server-side authorization is still enforced by the API on every call.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { status, error, refresh } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const query = search.toString();
      router.replace(signInUrl(`${pathname}${query ? `?${query}` : ''}`));
    }
  }, [status, router, pathname, search]);

  if (status === 'authenticated') return <>{children}</>;
  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState error={error} title="Cannot load your session" onRetry={() => void refresh()} />
      </div>
    );
  }
  return (
    <LoadingState
      className="min-h-dvh"
      label={status === 'unauthenticated' ? 'Redirecting to sign in…' : 'Loading…'}
    />
  );
}
