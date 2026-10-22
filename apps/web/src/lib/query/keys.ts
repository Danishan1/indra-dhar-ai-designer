/**
 * Query-key factory (docs/architecture/frontend-guidelines.md). Tenant data keys ALWAYS start with
 * ['org', organizationId, …] so switching organization can never show another tenant's cache, and
 * `queryClient.removeQueries({ queryKey: queryKeys.org(orgId).all })` clears one tenant.
 */
export const queryKeys = {
  session: {
    me: () => ['session', 'me'] as const,
  },
  system: {
    all: ['system'] as const,
    readiness: () => ['system', 'readiness'] as const,
    liveness: () => ['system', 'liveness'] as const,
  },
  org: (organizationId: string) => {
    const all = ['org', organizationId] as const;
    return {
      all,
      projects: (params?: Record<string, unknown>) => [...all, 'projects', params ?? {}] as const,
      project: (projectId: string) => [...all, 'project', projectId] as const,
    };
  },
};
