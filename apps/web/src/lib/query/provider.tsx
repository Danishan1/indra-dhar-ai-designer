'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ApiError } from '../api/errors';
import { toastApiError } from '../api/toast-error';

/** No retry for client errors (4xx); at most 2 retries for network/5xx. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.isClientError) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
    // Any 401 means the session ended: drop cached user so the route guard redirects to sign-in.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (
          error instanceof ApiError &&
          error.code === 'UNAUTHENTICATED' &&
          query.queryKey[0] !== 'session'
        ) {
          client.setQueryData(['session', 'me'], null);
        }
      },
    }),
    // Mutation failures toast by default; opt out with `meta: { silent: true }`.
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED')
          client.setQueryData(['session', 'me'], null);
        if (mutation.meta?.silent) return;
        toastApiError(error);
      },
    }),
  });
  return client;
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Isolated per server render; one shared client in the browser.
  if (typeof window === 'undefined') return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
