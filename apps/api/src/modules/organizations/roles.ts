import type { OrgRoleKey } from '@ai-designer/contracts';

/** Fixed ids of the seeded system roles (migration …_i06_organizations). */
export const SystemRoleIds: Record<OrgRoleKey, string> = {
  organization_owner: '00000000-0000-7000-8000-000000000001',
  organization_admin: '00000000-0000-7000-8000-000000000002',
  designer: '00000000-0000-7000-8000-000000000003',
};

export const RoleRank: Record<OrgRoleKey, number> = {
  organization_owner: 100,
  organization_admin: 80,
  designer: 40,
};

const KEY_BY_ID = new Map(
  Object.entries(SystemRoleIds).map(([key, id]) => [id, key as OrgRoleKey]),
);

export function roleKeyById(id: string): OrgRoleKey | undefined {
  return KEY_BY_ID.get(id);
}

export function highestRank(roles: readonly OrgRoleKey[]): number {
  return roles.reduce((max, r) => Math.max(max, RoleRank[r]), 0);
}

export function isOwner(roles: readonly OrgRoleKey[]): boolean {
  return roles.includes('organization_owner');
}

/**
 * Placeholder authority rule until I07's permission engine: owners may act on anyone; others only
 * on members with strictly lower rank (an admin cannot suspend another admin or an owner).
 */
export function canManage(
  actorRoles: readonly OrgRoleKey[],
  targetRoles: readonly OrgRoleKey[],
): boolean {
  return isOwner(actorRoles) || highestRank(actorRoles) > highestRank(targetRoles);
}

/** Inviters cannot propose a role above their own authority (FR-SEC-076). */
export function canGrant(actorRoles: readonly OrgRoleKey[], role: OrgRoleKey): boolean {
  if (role === 'organization_owner') return false; // ownership only via explicit transfer
  return highestRank(actorRoles) >= RoleRank[role];
}
