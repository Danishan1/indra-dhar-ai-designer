import { ORG_PERMISSION_KEYS, type PermissionKey } from './permissions.js';

/**
 * Baseline system roles (SPEC-009 §11.3) and their default permissions — the seed mirrors this into
 * `roles` / `role_permissions` (idempotent sync at API start and `pnpm db:seed`).
 *
 * How the §23 authorization matrix was read (docs/architecture/authorization.md):
 * | Matrix cell                                                        | Default role contains it?      |
 * | ------------------------------------------------------------------ | ------------------------------ |
 * | Yes · Yes, if allowed · Yes, subject to quota · If entitled         | yes (quota/entitlement = plan) |
 * | Limited · Billing scope                                            | yes, the narrow permission     |
 * | Yes, if assigned · If assigned                                     | yes (assignment = workflow)    |
 * | Policy-limited (Owner, Org Admin)                                  | yes (default security policy)  |
 * | Policy-limited (others) · If granted · If permitted · No by default | no — add a role or a grant     |
 * | No                                                                 | no                             |
 *
 * Platform Operator is not an organization role (FR-SEC-186). Never reuse a role id or key.
 */
export const BaselineRoleKeys = [
  'organization_owner',
  'organization_admin',
  'design_lead',
  'designer',
  'merchandiser',
  'production_user',
  'approver',
  'billing_admin',
  'credential_admin',
  'viewer',
  'external_collaborator',
] as const;
export type BaselineRoleKey = (typeof BaselineRoleKeys)[number];

export interface BaselineRoleDef {
  id: string;
  name: string;
  description: string;
  /** Can be given through role assignment / invitations. Ownership only moves by transfer. */
  assignable: boolean;
  permissions: readonly PermissionKey[];
}

const DESIGN_READ = [
  'organization.view',
  'members.view',
  'roles.view',
  'project.view',
  'asset.view',
  'design.view',
  'review.view',
  'review.comment',
  'artifact.view',
  'artifact.use',
  'operation.view',
  'job.view',
  'validation.view',
  'techpack.view',
] as const satisfies readonly PermissionKey[];

const DESIGN_WORK = [
  ...DESIGN_READ,
  'project.create',
  'project.edit',
  'asset.upload',
  'design.create',
  'design.edit',
  'design.commit',
  'design.restore',
  'design.generate',
  'design.export',
  'design.submit_review',
  'artifact.create',
  'artifact.edit',
  'operation.submit',
  'job.cancel',
  'validation.run',
] as const satisfies readonly PermissionKey[];

/** "If granted / If permitted" for owners and admins: held by dedicated roles instead. */
const NOT_DEFAULT_FOR_ADMINS = new Set<PermissionKey>([
  'design.approve',
  'design.revoke_approval',
  'validation.override',
  'techpack.approve',
  'techpack.approve_exception',
  'techpack.release',
  'techpack.withdraw',
  'billing.view',
  'billing.manage',
  'budget.manage',
  'credentials.view',
  'credentials.manage',
]);

const OWNER_PERMISSIONS = ORG_PERMISSION_KEYS.filter((k) => !NOT_DEFAULT_FOR_ADMINS.has(k));

const OWNER_ONLY = new Set<PermissionKey>([
  'organization.transfer_ownership',
  'organization.export',
  'organization.delete',
  'roles.manage',
  'audit.export',
  // "Edit draft tech pack: If granted" for Org Admin
  'techpack.create',
  'techpack.edit',
]);

const role = (
  n: number,
  name: string,
  description: string,
  permissions: readonly PermissionKey[],
  assignable = true,
): BaselineRoleDef => ({
  id: `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`,
  name,
  description,
  assignable,
  permissions: [...new Set(permissions)],
});

export const BASELINE_ROLES: Record<BaselineRoleKey, BaselineRoleDef> = {
  organization_owner: role(
    1,
    'Owner',
    'Ultimate administrative authority; ownership changes only by explicit transfer.',
    OWNER_PERMISSIONS,
    false,
  ),
  organization_admin: role(
    2,
    'Admin',
    'Members, settings, security policy and general administration.',
    OWNER_PERMISSIONS.filter((k) => !OWNER_ONLY.has(k)),
  ),
  designer: role(
    3,
    'Designer',
    'Creates and edits designs, uses artifacts, requests AI generation within policy.',
    DESIGN_WORK,
  ),
  design_lead: role(4, 'Design lead', 'Design governance and review; publishes shared artifacts.', [
    ...DESIGN_WORK,
    'project.archive',
    'artifact.publish',
    'artifact.delete',
  ]),
  merchandiser: role(
    5,
    'Merchandiser',
    'Project coordination, style information and selected specification work.',
    [
      ...DESIGN_READ,
      'project.create',
      'project.edit',
      'project.archive',
      'asset.upload',
      'design.export',
      'design.submit_review',
      'techpack.edit',
      'techpack.view_costing',
      'usage.view',
    ],
  ),
  production_user: role(
    6,
    'Production / technical',
    'Technical specifications, measurements, BOM, validation and production documents.',
    [
      ...DESIGN_READ,
      'asset.upload',
      'design.export',
      'validation.run',
      'validation.override',
      'techpack.create',
      'techpack.edit',
      'techpack.submit_review',
      'techpack.export',
    ],
  ),
  approver: role(7, 'Approver', 'Reviews and approves assigned design and tech pack stages.', [
    ...DESIGN_READ,
    'design.approve',
    'design.revoke_approval',
    'techpack.review',
    'techpack.approve',
    'techpack.approve_exception',
    'techpack.release',
    'techpack.withdraw',
  ]),
  billing_admin: role(
    8,
    'Billing admin',
    'Subscription, invoices, payment settings, budgets and usage.',
    ['organization.view', 'billing.view', 'billing.manage', 'budget.manage', 'usage.view'],
  ),
  credential_admin: role(
    9,
    'Credential admin',
    'Customer-owned AI provider credentials and their policies.',
    ['organization.view', 'credentials.view', 'credentials.manage'],
  ),
  viewer: role(10, 'Viewer', 'Read-only access to design work.', [
    'project.view',
    'asset.view',
    'design.view',
    'review.view',
    'artifact.view',
    'operation.view',
    'job.view',
    'validation.view',
    'techpack.view',
  ]),
  external_collaborator: role(
    11,
    'External collaborator',
    'No default permissions; sees only resources explicitly shared through grants (I43).',
    [],
  ),
};

export const BASELINE_ROLE_BY_ID: ReadonlyMap<string, BaselineRoleKey> = new Map(
  BaselineRoleKeys.map((k) => [BASELINE_ROLES[k].id, k]),
);

export function roleKeyById(id: string): BaselineRoleKey | undefined {
  return BASELINE_ROLE_BY_ID.get(id);
}

/** Union of the permissions of the given roles. */
export function permissionsOfRoles(roles: readonly BaselineRoleKey[]): Set<PermissionKey> {
  const out = new Set<PermissionKey>();
  for (const r of roles) for (const p of BASELINE_ROLES[r].permissions) out.add(p);
  return out;
}

/**
 * Delegation (FR-SEC-076/088/089, AC-SEC-003): the permissions a member may hand to others.
 * Owners may delegate every organization permission (they can, e.g., make someone Billing admin
 * without holding billing themselves); everyone else only what they hold.
 */
export function delegablePermissions(roles: readonly BaselineRoleKey[]): Set<PermissionKey> {
  if (roles.includes('organization_owner')) return new Set(ORG_PERMISSION_KEYS);
  return permissionsOfRoles(roles);
}

/** Can a member with `actorRoles` give (or take away) `role`? Needs `members.manage_roles` too. */
export function canDelegateRole(
  actorRoles: readonly BaselineRoleKey[],
  role: BaselineRoleKey,
): boolean {
  const def = BASELINE_ROLES[role];
  if (!def.assignable) return false;
  const delegable = delegablePermissions(actorRoles);
  return def.permissions.every((p) => delegable.has(p));
}

/**
 * Can the actor act on (suspend/remove/change) a member holding `targetRoles`? Only if the actor
 * could have granted every one of those roles — nobody manages someone more powerful; owners are
 * managed only by owners.
 */
export function canActOnMember(
  actorRoles: readonly BaselineRoleKey[],
  targetRoles: readonly BaselineRoleKey[],
): boolean {
  if (targetRoles.includes('organization_owner')) return actorRoles.includes('organization_owner');
  return targetRoles.every((r) => canDelegateRole(actorRoles, r));
}
