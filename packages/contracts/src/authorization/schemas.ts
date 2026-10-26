import { z } from 'zod';

import { orgRoleKeySchema } from '../organizations/schemas.js';
import { PERMISSION_KEYS, type PermissionKey } from '../permissions.js';

export const permissionKeySchema = z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]]);

/**
 * Internal PDP reason codes (SPEC-009 §22, FR-SEC-240). Machine-readable for audit/logs; clients get
 * a generic error that does not reveal resource existence (FR-SEC-241).
 */
export const AuthzReasonCodes = [
  'ALLOWED_BY_ROLE',
  'ALLOWED_BY_GRANT',
  'NOT_AUTHENTICATED',
  'ACCOUNT_INACTIVE',
  'NO_MEMBERSHIP',
  'MEMBERSHIP_INACTIVE',
  'MISSING_PERMISSION',
  'RESOURCE_NOT_IN_TENANT',
  'RESOURCE_RESTRICTED',
  'RESOURCE_STATE_FORBIDS',
  'SOD_VIOLATION',
  'STEP_UP_REQUIRED',
  'MFA_REQUIRED',
  'SESSION_POLICY_EXPIRED',
  'POLICY_UNAVAILABLE',
] as const;
export type AuthzReasonCode = (typeof AuthzReasonCodes)[number];

export const permissionInfoSchema = z.object({
  key: permissionKeySchema,
  resourceType: z.string(),
  action: z.string(),
  description: z.string(),
  sensitive: z.boolean(),
  platform: z.boolean(),
});
export const permissionCatalogResponseSchema = z.object({ items: z.array(permissionInfoSchema) });

export const roleInfoSchema = z.object({
  id: z.uuid(),
  key: orgRoleKeySchema,
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  /** Can be given by role assignment at all (false for Owner — transfer only). */
  assignable: z.boolean(),
  /**
   * Whether the caller's own permissions allow giving or taking away this role (delegation rule).
   * Assigning additionally needs `members.manage_roles`, inviting needs `members.invite`.
   */
  delegableByMe: z.boolean(),
  permissions: z.array(permissionKeySchema),
});
export type RoleInfo = z.infer<typeof roleInfoSchema>;
export const rolesResponseSchema = z.object({ items: z.array(roleInfoSchema) });

export const updateMemberRolesRequestSchema = z.object({
  roles: z.array(orgRoleKeySchema).min(1, 'Choose at least one role').max(11),
});
export type UpdateMemberRolesRequest = z.input<typeof updateMemberRolesRequestSchema>;

export const resourceGrantSchema = z.object({
  id: z.uuid(),
  resourceType: z.string(),
  resourceId: z.uuid(),
  actions: z.array(permissionKeySchema),
  expiresAt: z.string().nullable(),
});

export const effectivePermissionsSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  roles: z.array(orgRoleKeySchema),
  /** Organization-wide permissions with the roles that give each one (FR-SEC-093). */
  permissions: z.array(z.object({ key: permissionKeySchema, viaRoles: z.array(orgRoleKeySchema) })),
  /** Active resource-level grants (shares) on top of the roles. */
  grants: z.array(resourceGrantSchema),
});
export type EffectivePermissions = z.infer<typeof effectivePermissionsSchema>;

export const myPermissionsQuerySchema = z.object({ orgId: z.uuid() });
export const myPermissionsResponseSchema = z.object({
  organizationId: z.uuid(),
  /** The organization requires an MFA-verified session for all access (security policy). */
  requireMfa: z.boolean(),
  roles: z.array(orgRoleKeySchema),
  permissions: z.array(permissionKeySchema),
});
export type MyPermissions = z.infer<typeof myPermissionsResponseSchema>;
