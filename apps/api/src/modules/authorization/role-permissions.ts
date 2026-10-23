import {
  type PermissionKey,
  isPermissionKey,
  roleKeyById,
  type BaselineRoleKey,
} from '@ai-designer/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service.js';

const REFRESH_MS = 60_000;

/**
 * Role → permission mapping loaded from `role_permissions` (mirrors code for system roles, holds
 * custom roles later). Refreshed at most every 60s and right after the startup catalog sync.
 * A load failure propagates so the PDP denies (fail closed).
 */
@Injectable()
export class RolePermissions {
  private readonly logger = new Logger('RolePermissions');
  private map = new Map<string, Set<PermissionKey>>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async reload(): Promise<void> {
    const rows = await this.prisma.rolePermission.findMany({
      select: { roleId: true, permissionKey: true },
    });
    const map = new Map<string, Set<PermissionKey>>();
    for (const row of rows) {
      if (!isPermissionKey(row.permissionKey)) continue; // unknown keys never grant anything
      let set = map.get(row.roleId);
      if (!set) map.set(row.roleId, (set = new Set()));
      set.add(row.permissionKey);
    }
    this.map = map;
    this.loadedAt = Date.now();
  }

  /** Permissions of one role (after `permissionsFor` has loaded the mapping). */
  permissionsOfRole(roleId: string): ReadonlySet<PermissionKey> {
    return this.map.get(roleId) ?? new Set();
  }

  async permissionsFor(roleIds: readonly string[]): Promise<Set<PermissionKey>> {
    if (Date.now() - this.loadedAt > REFRESH_MS) {
      this.loading ??= this.reload().finally(() => (this.loading = null));
      try {
        await this.loading;
      } catch (err) {
        if (this.loadedAt === 0) throw err;
        this.logger.warn({ err }, 'role permission refresh failed; using the previous mapping');
      }
    }
    const out = new Set<PermissionKey>();
    for (const id of roleIds) for (const p of this.map.get(id) ?? []) out.add(p);
    return out;
  }
}

export function roleKeysOf(roleIds: readonly string[]): BaselineRoleKey[] {
  return roleIds.map(roleKeyById).filter((k): k is BaselineRoleKey => !!k);
}
