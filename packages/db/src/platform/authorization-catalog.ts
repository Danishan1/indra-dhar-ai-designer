import {
  BASELINE_ROLES,
  BaselineRoleKeys,
  isPlatformPermission,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  permissionParts,
} from '@ai-designer/contracts';

import type { PrismaClient } from '../generated/prisma/client.js';

/** Arbitrary constant for pg_advisory_xact_lock so concurrent API instances sync one at a time. */
const SYNC_LOCK_KEY = 707_001;

export interface CatalogSyncResult {
  permissions: number;
  roles: number;
  rolePermissionsAdded: number;
  rolePermissionsRemoved: number;
}

/**
 * Idempotently mirrors the code-defined permission catalog and baseline system roles
 * (packages/contracts) into `permissions`, `roles` and `role_permissions` (ADR-033, ADR-042).
 * Runs at API start and in `pnpm db:seed`. Permission rows are never deleted (keys are never
 * reused); system-role mappings are made exactly equal to the code.
 */
export async function syncAuthorizationCatalog(prisma: PrismaClient): Promise<CatalogSyncResult> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
      for (const key of PERMISSION_KEYS) {
        const { resourceType, action } = permissionParts(key);
        const data = {
          resourceType,
          action,
          description: PERMISSION_CATALOG[key].description,
          isPlatform: isPlatformPermission(key),
          sensitive: PERMISSION_CATALOG[key].sensitive,
        };
        await tx.permission.upsert({ where: { key }, update: data, create: { key, ...data } });
      }
      let added = 0;
      let removed = 0;
      for (const roleKey of BaselineRoleKeys) {
        const def = BASELINE_ROLES[roleKey];
        const data = {
          key: roleKey,
          name: def.name,
          description: def.description,
          assignable: def.assignable,
          isSystem: true,
          organizationId: null,
          scopeType: 'organization',
        };
        await tx.role.upsert({
          where: { id: def.id },
          update: data,
          create: { id: def.id, ...data },
        });
        const current = await tx.rolePermission.findMany({ where: { roleId: def.id } });
        const have = new Set(current.map((r) => r.permissionKey));
        const want = new Set<string>(def.permissions);
        const stale = [...have].filter((k) => !want.has(k));
        const missing = [...want].filter((k) => !have.has(k));
        if (stale.length) {
          removed += (
            await tx.rolePermission.deleteMany({
              where: { roleId: def.id, permissionKey: { in: stale } },
            })
          ).count;
        }
        if (missing.length) {
          added += (
            await tx.rolePermission.createMany({
              data: missing.map((permissionKey) => ({ roleId: def.id, permissionKey })),
              skipDuplicates: true,
            })
          ).count;
        }
      }
      return {
        permissions: PERMISSION_KEYS.length,
        roles: BaselineRoleKeys.length,
        rolePermissionsAdded: added,
        rolePermissionsRemoved: removed,
      };
    },
    { timeout: 30_000 },
  );
}
