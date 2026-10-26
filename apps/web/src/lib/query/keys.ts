/**
 * Query-key factory (docs/architecture/frontend-guidelines.md). Tenant data keys ALWAYS start with
 * ['org', organizationId, …] so switching organization can never show another tenant's cache, and
 * `queryClient.removeQueries({ queryKey: queryKeys.org(orgId).all })` clears one tenant.
 */
export const queryKeys = {
  session: {
    me: () => ['session', 'me'] as const,
  },
  /** The signed-in user's own security settings (I08). */
  security: {
    mfa: () => ['security', 'mfa'] as const,
    sessions: () => ['security', 'sessions'] as const,
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
      roles: () => [...all, 'roles'] as const,
      securityPolicy: () => [...all, 'security-policy'] as const,
      auditEvents: (filters: Record<string, unknown>) => [...all, 'audit-events', filters] as const,
      myPermissions: () => [...all, 'my-permissions'] as const,
      effectivePermissions: (membershipId: string) =>
        [...all, 'effective-permissions', membershipId] as const,
      assets: (filters?: Record<string, unknown>) => [...all, 'assets', filters ?? {}] as const,
      asset: (assetId: string) => [...all, 'asset', assetId] as const,
      projects: (params?: Record<string, unknown>) => [...all, 'projects', params ?? {}] as const,
      project: (projectId: string) => [...all, 'project', projectId] as const,
    };
  },
};
