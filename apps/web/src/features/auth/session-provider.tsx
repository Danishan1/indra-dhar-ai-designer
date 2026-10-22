'use client';

import type { Me } from '@ai-designer/contracts';
import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';

import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { authApi } from './api';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface SessionContextValue {
  status: SessionStatus;
  user: Me | null;
  error: unknown;
  refresh(): Promise<void>;
  /** Clears all cached data (another user must never see it) and marks the session as signed out. */
  clear(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Drops every cached query except the session itself (another user must never see it) and sets
 * the session user. The session query is updated in place, not removed, so mounted observers
 * (route guard) see the change immediately.
 */
export function resetUserData(queryClient: QueryClient, user: Me | null): void {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(queryKeys.session.me(), user);
}

/** Current user from `GET /v1/me` (cookie session). 401 → unauthenticated (not an error). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.session.me(),
    queryFn: async ({ signal }) => {
      try {
        return await authApi.me(signal);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.session.me() });
  }, [queryClient]);

  const clear = useCallback(() => {
    resetUserData(queryClient, null);
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(() => {
    const status: SessionStatus = query.isPending
      ? 'loading'
      : query.isError
        ? 'error'
        : query.data
          ? 'authenticated'
          : 'unauthenticated';
    return { status, user: query.data ?? null, error: query.error, refresh, clear };
  }, [query.isPending, query.isError, query.data, query.error, refresh, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
