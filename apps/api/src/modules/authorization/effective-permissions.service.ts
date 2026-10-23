import {
  type EffectivePermissions,
  type OrgRoleKey,
  PERMISSION_KEYS,
  type PermissionKey,
  roleKeyById,
} from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import { MembershipDirectoryRegistry } from '../../platform/authz/membership-directory.js';
import { AppError } from '../../platform/errors/app-error.js';

import { ResourceGrantService } from './grants.service.js';
import { RolePermissions } from './role-permissions.js';

/** Effective permissions of one member: role-derived (with their sources) + active grants (FR-SEC-093). */
@Injectable()
export class EffectivePermissionsService {
  constructor(
    private readonly directory: MembershipDirectoryRegistry,
    private readonly rolePermissions: RolePermissions,
    private readonly grants: ResourceGrantService,
  ) {}

  async forMembership(organizationId: string, membershipId: string): Promise<EffectivePermissions> {
    const access = await this.directory.get().findById(organizationId, membershipId);
    if (!access) throw AppError.notFound('Member');
    await this.rolePermissions.permissionsFor(access.roleIds); // ensures the mapping is loaded
    const via = new Map<PermissionKey, OrgRoleKey[]>();
    const roles: OrgRoleKey[] = [];
    for (const roleId of access.roleIds) {
      const key = roleKeyById(roleId);
      if (!key) continue;
      roles.push(key);
      for (const p of this.rolePermissions.permissionsOfRole(roleId)) {
        via.set(p, [...(via.get(p) ?? []), key]);
      }
    }
    const grants = await this.grants.listActiveForUser(organizationId, access.userId);
    return {
      membershipId: access.membershipId,
      userId: access.userId,
      roles,
      permissions: PERMISSION_KEYS.filter((k) => via.has(k)).map((key) => ({
        key,
        viaRoles: via.get(key) ?? [],
      })),
      grants: grants.map((g) => ({
        id: g.id,
        resourceType: g.resourceType,
        resourceId: g.resourceId,
        actions: g.actions.filter((a): a is PermissionKey =>
          (PERMISSION_KEYS as string[]).includes(a),
        ),
        expiresAt: g.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
