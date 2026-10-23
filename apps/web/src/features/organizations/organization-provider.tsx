'use client';

import type { MyOrganization, PermissionKey } from '@ai-designer/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { ErrorState, LoadingState } from '@/components/states/states';
import { safeReturnTo } from '@/features/auth/return-to';
import { PreferenceKeys, readPreference, writePreference } from '@/lib/local-preferences';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';

interface OrganizationContextValue {
  organizations: MyOrganization[];
  active: MyOrganization;
  setActive(organizationId: string): void;
  /**
   * Whether the signed-in user holds `permission` in the active organization (GET /v1/me/permissions).
   * Cosmetic only — hides or disables UI; the API enforces every request.
   */
  can(permission: PermissionKey): boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function pickActive(
  orgs: MyOrganization[],
  preferredId: string | null,
): MyOrganization | undefined {
  const usable = orgs.filter((o) => o.membership.status === 'active');
  return usable.find((o) => o.id === preferredId) ?? usable[0];
}

/**
 * Active organization for the app shell. The id is remembered locally (a UI preference) but always
 * re-validated against my live memberships; every org-scoped request names the org in its path and
 * the API checks membership (FR-SEC-217). Users without an organization go to onboarding.
 */
export function OrganizationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const queryClient = useQueryClient();
  const [preferredId, setPreferredId] = useState<string | null>(null);
  useEffect(() => setPreferredId(readPreference(PreferenceKeys.activeOrganization)), []);

  const query = useQuery({
    queryKey: queryKeys.myOrgs(),
    queryFn: ({ signal }) => orgsApi.mine(signal),
  });
  const organizations = useMemo(() => query.data?.items ?? [], [query.data]);
  const active = pickActive(organizations, preferredId);
  const permissionsQuery = useQuery({
    queryKey: queryKeys.org(active?.id ?? 'none').myPermissions(),
    queryFn: ({ signal }) => orgsApi.myPermissions(active?.id ?? '', signal),
    enabled: !!active,
    staleTime: 30_000,
  });
  const permissions = useMemo(
    () => new Set<PermissionKey>(permissionsQuery.data?.permissions ?? []),
    [permissionsQuery.data],
  );

  useEffect(() => {
    if (!query.isSuccess || active) return;
    const returnTo = safeReturnTo(`${pathname}${search ? `?${search}` : ''}`);
    router.replace(
      returnTo === '/' ? '/onboarding' : `/onboarding?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }, [query.isSuccess, active, router, pathname, search]);

  const setActive = useCallback(
    (organizationId: string) => {
      writePreference(PreferenceKeys.activeOrganization, organizationId);
      setPreferredId(organizationId);
      // Data of other tenants must not linger in the cache view.
      queryClient.removeQueries({
        predicate: (q) => q.queryKey[0] === 'org' && q.queryKey[1] !== organizationId,
      });
    },
    [queryClient],
  );

  const value = useMemo<OrganizationContextValue | null>(
    () =>
      active
        ? {
            organizations,
            active,
            setActive,
            can: (permission) => permissions.has(permission),
          }
        : null,
    [organizations, active, setActive, permissions],
  );

  if (query.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <ErrorState
          error={query.error}
          title="Cannot load your organizations"
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }
  if (!value || permissionsQuery.isPending) return <LoadingState className="min-h-dvh" />;
  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext);
  if (!ctx) throw new Error('useOrganization must be used inside <OrganizationProvider>');
  return ctx;
}
