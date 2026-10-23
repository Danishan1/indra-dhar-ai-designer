/**
 * Query-key factory (docs/architecture/frontend-guidelines.md). Tenant data keys ALWAYS start with
 * ['org', organizationId, …] so switching organization can never show another tenant's cache, and
 * `queryClient.removeQueries({ queryKey: queryKeys.org(orgId).all })` clears one tenant.
 */
export const queryKeys = {
  session: {
    me: () => ['session', 'me'] as const,
  },
  /** Organizations of the signed-in user (dropped with other user data on sign-in/out). */
  myOrgs: () => ['orgs', 'mine'] as const,
  system: {
    all: ['system'] as const,
    readiness: () => ['system', 'readiness'] as const,
    liveness: () => ['system', 'liveness'] as const,
  },
  org: (organizationId: string) => {
    const all = ['org', organizationId] as const;
    return {
      all,
      detail: () => [...all, 'detail'] as const,
      members: () => [...all, 'members'] as const,
      invitations: () => [...all, 'invitations'] as const,
      projects: (params?: Record<string, unknown>) => [...all, 'projects', params ?? {}] as const,
      project: (projectId: string) => [...all, 'project', projectId] as const,
    };
  },
};
