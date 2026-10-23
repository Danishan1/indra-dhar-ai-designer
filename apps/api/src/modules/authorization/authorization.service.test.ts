import { BASELINE_ROLES, type PermissionKey } from '@ai-designer/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AccessCache, MembershipAccess } from '../../platform/authz/access-cache.js';
import { MembershipDirectoryRegistry } from '../../platform/authz/membership-directory.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';

import { AuthorizationService } from './authorization.service.js';
import type { ResourceGrantService } from './grants.service.js';
import type { RolePermissions } from './role-permissions.js';

const ORG = '00000000-0000-7000-8000-00000000a001';
const OTHER_ORG = '00000000-0000-7000-8000-00000000b001';
const USER = '00000000-0000-7000-8000-00000000c001';
const human = { type: 'human' as const, id: USER };

function setup(
  opts: {
    access?: MembershipAccess | null;
    directoryThrows?: boolean;
    grant?: boolean;
    resourceOrg?: string | null;
  } = {},
) {
  const directories = new MembershipDirectoryRegistry();
  directories.register({
    findAccess: vi.fn(async () => {
      if (opts.directoryThrows) throw new Error('db down');
      return opts.access === undefined ? null : opts.access;
    }),
    findById: vi.fn(async () => null),
  });
  const cache = { get: vi.fn(async () => null), set: vi.fn(async () => undefined) };
  const rolePermissions = {
    permissionsFor: vi.fn(async (roleIds: string[]) => {
      const out = new Set<PermissionKey>();
      for (const def of Object.values(BASELINE_ROLES))
        if (roleIds.includes(def.id)) for (const p of def.permissions) out.add(p);
      return out;
    }),
  };
  const resolvers = new ResourceResolverRegistry();
  resolvers.register('project', {
    label: 'Project',
    organizationOf: async () => (opts.resourceOrg === undefined ? ORG : opts.resourceOrg),
  });
  const grants = { hasActiveGrant: vi.fn(async () => (opts.grant ? 'grant-1' : null)) };
  const pdp = new AuthorizationService(
    directories,
    cache as unknown as AccessCache,
    rolePermissions as unknown as RolePermissions,
    resolvers,
    grants as unknown as ResourceGrantService,
  );
  return { pdp, grants };
}

const member = (role: keyof typeof BASELINE_ROLES, status: 'active' | 'suspended' = 'active') => ({
  membershipId: '00000000-0000-7000-8000-00000000d001',
  organizationId: ORG,
  userId: USER,
  status,
  roleIds: [BASELINE_ROLES[role].id],
});

describe('AuthorizationService (PDP)', () => {
  it('denies anonymous principals', async () => {
    const { pdp } = setup({ access: member('organization_owner') });
    const d = await pdp.authorize({
      principal: { type: 'anonymous', id: null },
      organizationId: ORG,
      permission: 'organization.view',
    });
    expect(d).toMatchObject({
      decision: 'deny',
      reasonCode: 'NOT_AUTHENTICATED',
      policyVersion: 'sec-policy-v1',
    });
  });

  it('denies non-members and suspended members', async () => {
    expect(
      (
        await setup({ access: null }).pdp.authorize({
          principal: human,
          organizationId: ORG,
          permission: 'organization.view',
        })
      ).reasonCode,
    ).toBe('NO_MEMBERSHIP');
    expect(
      (
        await setup({ access: member('designer', 'suspended') }).pdp.authorize({
          principal: human,
          organizationId: ORG,
          permission: 'project.view',
        })
      ).reasonCode,
    ).toBe('MEMBERSHIP_INACTIVE');
  });

  it('allows by role and denies a missing permission', async () => {
    const { pdp } = setup({ access: member('designer') });
    expect(
      await pdp.authorize({ principal: human, organizationId: ORG, permission: 'design.edit' }),
    ).toMatchObject({ decision: 'allow', reasonCode: 'ALLOWED_BY_ROLE' });
    expect(
      await pdp.authorize({ principal: human, organizationId: ORG, permission: 'members.manage' }),
    ).toMatchObject({ decision: 'deny', reasonCode: 'MISSING_PERMISSION' });
  });

  it('never grants platform permissions, even to owners', async () => {
    const { pdp } = setup({ access: member('organization_owner') });
    const d = await pdp.authorize({
      principal: human,
      organizationId: ORG,
      permission: 'platform.settings.manage',
    });
    expect(d.decision).toBe('deny');
  });

  it('checks the resource tenant before anything else', async () => {
    const wrongTenant = setup({ access: member('organization_owner'), resourceOrg: OTHER_ORG });
    expect(
      (
        await wrongTenant.pdp.authorize({
          principal: human,
          organizationId: ORG,
          permission: 'project.view',
          resource: { type: 'project', id: USER },
        })
      ).reasonCode,
    ).toBe('RESOURCE_NOT_IN_TENANT');
    const missing = setup({ access: member('organization_owner'), resourceOrg: null });
    expect(
      (
        await missing.pdp.authorize({
          principal: human,
          organizationId: null,
          permission: 'project.view',
          resource: { type: 'project', id: USER },
        })
      ).reasonCode,
    ).toBe('RESOURCE_NOT_IN_TENANT');
  });

  it('falls back to an active resource grant after role permissions', async () => {
    const { pdp, grants } = setup({ access: member('viewer'), grant: true });
    const d = await pdp.authorize({
      principal: human,
      organizationId: ORG,
      permission: 'project.edit',
      resource: { type: 'project', id: USER },
    });
    expect(d).toMatchObject({ decision: 'allow', reasonCode: 'ALLOWED_BY_GRANT' });
    expect(grants.hasActiveGrant).toHaveBeenCalledWith(
      ORG,
      USER,
      { type: 'project', id: USER },
      'project.edit',
    );
  });

  it('fails closed when a dependency throws (AC4, NFR-SEC-004)', async () => {
    const { pdp } = setup({ directoryThrows: true });
    const d = await pdp.authorize({
      principal: human,
      organizationId: ORG,
      permission: 'organization.view',
    });
    expect(d).toMatchObject({ decision: 'deny', reasonCode: 'POLICY_UNAVAILABLE' });
  });

  it('fails closed for an unregistered resource type', async () => {
    const { pdp } = setup({ access: member('organization_owner') });
    const d = await pdp.authorize({
      principal: human,
      organizationId: ORG,
      permission: 'project.view',
      resource: { type: 'nope', id: USER },
    });
    expect(d.reasonCode).toBe('POLICY_UNAVAILABLE');
  });
});
