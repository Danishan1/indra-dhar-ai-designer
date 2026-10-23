import { describe, expect, it } from 'vitest';

import {
  isPlatformPermission,
  ORG_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  type PermissionKey,
} from './permissions.js';
import {
  BASELINE_ROLES,
  BaselineRoleKeys,
  canActOnMember,
  canDelegateRole,
  permissionsOfRoles,
} from './roles.js';

describe('permission catalog (ADR-033)', () => {
  it('uses stable <resource>.<action> keys', () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it('maps every organization permission to at least one baseline role', () => {
    const mapped = permissionsOfRoles(BaselineRoleKeys);
    const unmapped = ORG_PERMISSION_KEYS.filter((k) => !mapped.has(k));
    expect(unmapped).toEqual([]);
  });

  it('never gives platform permissions to organization roles (FR-SEC-186)', () => {
    for (const k of BaselineRoleKeys)
      expect(BASELINE_ROLES[k].permissions.filter(isPlatformPermission)).toEqual([]);
  });

  it('role definitions only reference catalog keys and have unique fixed ids', () => {
    const ids = new Set(BaselineRoleKeys.map((k) => BASELINE_ROLES[k].id));
    expect(ids.size).toBe(BaselineRoleKeys.length);
    for (const k of BaselineRoleKeys)
      for (const p of BASELINE_ROLES[k].permissions) expect(PERMISSION_CATALOG).toHaveProperty([p]);
  });
});

/** Decision table generated from the SPEC-009 §23 matrix (default roles, no grants). */
describe('baseline roles follow the §23 matrix', () => {
  const has = (role: keyof typeof BASELINE_ROLES, p: PermissionKey) =>
    BASELINE_ROLES[role].permissions.includes(p);
  const cases: [string, PermissionKey, Partial<Record<keyof typeof BASELINE_ROLES, boolean>>][] = [
    [
      'view organization settings',
      'organization.view',
      {
        organization_owner: true,
        organization_admin: true,
        designer: true,
        approver: true,
        billing_admin: true,
        viewer: false,
      },
    ],
    [
      'manage members',
      'members.manage',
      {
        organization_owner: true,
        organization_admin: true,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'assign roles',
      'members.manage_roles',
      {
        organization_owner: true,
        organization_admin: true,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'create project',
      'project.create',
      {
        organization_owner: true,
        organization_admin: true,
        designer: true,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'edit design',
      'design.edit',
      {
        organization_owner: true,
        organization_admin: true,
        designer: true,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'generate AI design',
      'design.generate',
      {
        organization_owner: true,
        organization_admin: true,
        designer: true,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'approve design',
      'design.approve',
      {
        organization_owner: false,
        organization_admin: false,
        designer: false,
        approver: true,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'manage shared artifacts',
      'artifact.publish',
      {
        organization_owner: true,
        organization_admin: true,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'edit draft tech pack',
      'techpack.edit',
      {
        organization_owner: true,
        organization_admin: false,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'release tech pack',
      'techpack.release',
      {
        organization_owner: false,
        organization_admin: false,
        designer: false,
        approver: true,
        billing_admin: false,
        viewer: false,
      },
    ],
    [
      'view billing',
      'billing.view',
      {
        organization_owner: false,
        organization_admin: false,
        designer: false,
        approver: false,
        billing_admin: true,
        viewer: false,
      },
    ],
    [
      'change billing settings',
      'billing.manage',
      {
        organization_owner: false,
        organization_admin: false,
        designer: false,
        approver: false,
        billing_admin: true,
        viewer: false,
      },
    ],
    [
      'manage provider credentials',
      'credentials.manage',
      {
        organization_owner: false,
        organization_admin: false,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
        credential_admin: true,
      },
    ],
    [
      'view security audit',
      'audit.view',
      {
        organization_owner: true,
        organization_admin: true,
        designer: false,
        approver: false,
        billing_admin: false,
        viewer: false,
      },
    ],
  ];
  it.each(cases)('%s', (_label, permission, expected) => {
    for (const [role, allowed] of Object.entries(expected))
      expect(has(role as keyof typeof BASELINE_ROLES, permission), `${role} ${permission}`).toBe(
        allowed,
      );
  });

  it('keeps edit/generate distinct from approve/release, billing distinct from credentials (AC5)', () => {
    for (const k of BaselineRoleKeys) {
      const p = BASELINE_ROLES[k].permissions;
      if (p.includes('design.edit')) expect(p.includes('design.approve'), k).toBe(false);
      if (p.includes('billing.manage')) expect(p.includes('credentials.manage'), k).toBe(false);
    }
  });
});

describe('delegation (FR-SEC-089, AC-SEC-003)', () => {
  it('nobody can assign ownership; owners can delegate any other role', () => {
    expect(canDelegateRole(['organization_owner'], 'organization_owner')).toBe(false);
    for (const k of BaselineRoleKeys.filter((r) => r !== 'organization_owner'))
      expect(canDelegateRole(['organization_owner'], k), k).toBe(true);
  });

  it('admins cannot hand out billing or credential administration they do not hold', () => {
    expect(canDelegateRole(['organization_admin'], 'billing_admin')).toBe(false);
    expect(canDelegateRole(['organization_admin'], 'credential_admin')).toBe(false);
    expect(canDelegateRole(['organization_admin', 'billing_admin'], 'billing_admin')).toBe(true);
    expect(canDelegateRole(['organization_admin'], 'designer')).toBe(true);
    expect(canDelegateRole(['organization_admin'], 'viewer')).toBe(true);
  });

  it('members act only on members they could have created', () => {
    expect(canActOnMember(['organization_admin'], ['designer'])).toBe(true);
    expect(canActOnMember(['organization_admin'], ['organization_owner'])).toBe(false);
    expect(canActOnMember(['organization_admin'], ['billing_admin'])).toBe(false);
    expect(canActOnMember(['organization_owner'], ['organization_owner'])).toBe(true);
  });
});
