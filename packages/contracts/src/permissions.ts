/**
 * Permission catalog (FR-SEC-084/085, ADR-033): stable, resource-oriented `<resource>.<action>`
 * keys. **Never rename or reuse a key** — display text may change, the key may not. Iterations add
 * keys (and role mappings in `roles.ts`) in the same change as the endpoints that need them; the
 * planning view is docs/plan/03-domain-model.md §4.
 *
 * `platform.*` keys belong to the platform-operator scope and are never granted by organization
 * roles (FR-SEC-186).
 */

interface PermissionDef {
  description: string;
  /** Denials are audited and the action is a candidate for step-up obligations (I08). */
  sensitive: boolean;
}

const def = (description: string, sensitive = false): PermissionDef => ({ description, sensitive });

export const PERMISSION_CATALOG = {
  // Organization & membership administration
  'organization.view': def('View organization details and settings'),
  'organization.update': def('Rename the organization and change general settings'),
  'organization.transfer_ownership': def('Transfer organization ownership', true),
  'organization.export': def('Export all organization data', true),
  'organization.delete': def('Delete the organization', true),
  'members.view': def('View members and their roles'),
  'members.invite': def('Invite people and manage pending invitations'),
  'members.manage': def('Suspend, reactivate and remove members', true),
  'members.manage_roles': def('Change the roles of members (only delegable roles)', true),
  'roles.view': def('View roles and their permissions'),
  'roles.manage': def('Create and edit custom roles', true),
  'security_policy.manage': def('Change the organization security policy', true),
  'audit.view': def('View the security audit trail', true),
  'audit.export': def('Export the security audit trail', true),
  'api_tokens.manage': def('Create and revoke API tokens', true),
  'notifications.manage': def('Manage organization notification settings'),

  // Design work
  'project.view': def('View projects'),
  'project.create': def('Create projects'),
  'project.edit': def('Edit project details'),
  'project.archive': def('Archive and restore projects'),
  'project.delete': def('Delete projects', true),
  'project.manage_access': def('Share projects and manage project access', true),
  'asset.view': def('View and download assets'),
  'asset.upload': def('Upload assets'),
  'asset.delete': def('Delete assets'),
  'design.view': def('View designs and revisions'),
  'design.create': def('Create designs'),
  'design.edit': def('Edit design drafts'),
  'design.commit': def('Save design revisions'),
  'design.restore': def('Restore an earlier revision as a new draft'),
  'design.generate': def('Request AI generation (subject to plan entitlement and budget)'),
  'design.export': def('Export design images and files'),
  'design.submit_review': def('Submit a revision for review'),
  'design.approve': def('Approve design revisions', true),
  'design.revoke_approval': def('Revoke a design approval', true),
  'review.view': def('View reviews and comments'),
  'review.comment': def('Comment in reviews'),
  'artifact.view': def('View library artifacts'),
  'artifact.use': def('Use artifacts in designs'),
  'artifact.create': def('Create artifacts'),
  'artifact.edit': def('Edit artifacts'),
  'artifact.publish': def('Publish artifacts to the shared library'),
  'artifact.delete': def('Delete shared artifacts'),
  'operation.submit': def('Submit editor operations'),
  'operation.view': def('View operation history'),
  'job.view': def('View background jobs'),
  'job.cancel': def('Cancel background jobs'),
  'validation.view': def('View validation results'),
  'validation.run': def('Run validation'),
  'validation.override': def('Override a blocking validation finding', true),

  // Technical specifications
  'techpack.view': def('View tech packs'),
  'techpack.create': def('Create tech packs'),
  'techpack.edit': def('Edit draft tech packs'),
  'techpack.view_costing': def('View costing sections'),
  'techpack.submit_review': def('Submit a tech pack for review'),
  'techpack.review': def('Review tech packs'),
  'techpack.approve': def('Approve tech packs', true),
  'techpack.approve_exception': def('Approve a release with documented exceptions', true),
  'techpack.release': def('Release tech packs to production', true),
  'techpack.withdraw': def('Withdraw a released tech pack', true),
  'techpack.distribute': def('Share released tech packs externally', true),
  'techpack.export': def('Export tech packs'),

  // Commercial (billing and credential administration are separate, AC-SEC-007)
  'usage.view': def('View AI usage'),
  'billing.view': def('View subscription, invoices and payment settings'),
  'billing.manage': def('Change subscription and payment settings', true),
  'budget.manage': def('Manage budgets and spending policies', true),
  'credentials.view': def('View customer-owned provider credentials (metadata only)'),
  'credentials.manage': def('Add, rotate and remove customer-owned provider credentials', true),

  // Platform operator scope — never granted by organization roles
  'platform.ai.manage': def('Manage platform AI providers and models', true),
  'platform.ai.inspect': def('Inspect AI operations', true),
  'platform.billing.manage': def('Manage platform billing', true),
  'platform.billing.adjust': def('Adjust customer balances', true),
  'platform.billing.refund': def('Issue refunds', true),
  'platform.pricing.manage': def('Manage pricing', true),
  'platform.finance.view': def('View platform finance', true),
  'platform.finance.reconcile': def('Reconcile platform finance', true),
  'platform.catalog.manage': def('Manage the built-in catalog', true),
  'platform.settings.manage': def('Manage platform settings', true),
  'platform.security.manage': def('Manage platform security', true),
  'platform.support.view': def('Support view of customer metadata', true),
  'platform.breakglass.request': def('Request break-glass customer data access', true),
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSION_CATALOG;

export const PERMISSION_KEYS = Object.keys(PERMISSION_CATALOG) as PermissionKey[];

/** Organization-scoped permissions (everything except `platform.*`). */
export const ORG_PERMISSION_KEYS = PERMISSION_KEYS.filter((k) => !k.startsWith('platform.'));

export function isPlatformPermission(key: string): boolean {
  return key.startsWith('platform.');
}

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.hasOwn(PERMISSION_CATALOG, key);
}

export function permissionParts(key: PermissionKey): { resourceType: string; action: string } {
  const i = key.lastIndexOf('.');
  return { resourceType: key.slice(0, i), action: key.slice(i + 1) };
}

export function isSensitivePermission(key: PermissionKey): boolean {
  return PERMISSION_CATALOG[key].sensitive;
}

/** Back-compat alias object (`Permissions['members.view']`) for readable decorator arguments. */
export const Permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, k])) as {
  readonly [K in PermissionKey]: K;
};

/**
 * High-impact actions that need a *recent* second-factor check (step-up, FR-SEC-040), within the
 * organization's `stepUpMaxAgeMinutes`. Every sensitive permission already needs an MFA-verified
 * session (I08); these additionally need it to be fresh.
 */
export const STEP_UP_PERMISSIONS: ReadonlySet<PermissionKey> = new Set<PermissionKey>([
  'organization.transfer_ownership',
  'organization.export',
  'organization.delete',
  'security_policy.manage',
  'billing.manage',
  'credentials.manage',
  'techpack.release',
]);

export function requiresStepUp(key: PermissionKey): boolean {
  return STEP_UP_PERMISSIONS.has(key);
}
