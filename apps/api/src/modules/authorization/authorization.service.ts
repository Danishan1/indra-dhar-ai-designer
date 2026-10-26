import {
  isPlatformPermission,
  isSensitivePermission,
  type PermissionKey,
  requiresStepUp,
} from '@ai-designer/contracts';
import { Injectable, Logger } from '@nestjs/common';

import { AccessCache, type MembershipAccess } from '../../platform/authz/access-cache.js';
import {
  type Authorizer,
  type AuthzContext,
  type AuthzDecision,
  type AuthzRequest,
  POLICY_VERSION,
} from '../../platform/authz/authorizer.js';
import { MembershipDirectoryRegistry } from '../../platform/authz/membership-directory.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';

import { ResourceGrantService } from './grants.service.js';
import { roleKeysOf, RolePermissions } from './role-permissions.js';
import { SecurityPolicyService } from './security-policy.service.js';

const deny = (reasonCode: AuthzDecision['reasonCode'], context?: AuthzContext): AuthzDecision => ({
  decision: 'deny',
  reasonCode,
  policyVersion: POLICY_VERSION,
  obligations: [],
  ...(context ? { context } : {}),
});

/**
 * Policy Decision Point (SPEC-009 §11.1, §22). Order: principal → resource tenant → membership →
 * role permissions → resource grants. Any error is a deny with `POLICY_UNAVAILABLE` (fail closed,
 * FR-SEC-239, NFR-SEC-004). Organization Owner gets no bypass: it is just a role (§23 note).
 */
@Injectable()
export class AuthorizationService implements Authorizer {
  private readonly logger = new Logger('PDP');

  constructor(
    private readonly directory: MembershipDirectoryRegistry,
    private readonly cache: AccessCache,
    private readonly rolePermissions: RolePermissions,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly grants: ResourceGrantService,
    private readonly policies: SecurityPolicyService,
  ) {}

  async authorize(request: AuthzRequest): Promise<AuthzDecision> {
    try {
      return await this.evaluate(request);
    } catch (err) {
      this.logger.error({ err, permission: request.permission }, 'authorization failed — denied');
      return deny('POLICY_UNAVAILABLE');
    }
  }

  /** Effective organization context of a user (UI gating, effective-permissions view). */
  async contextFor(organizationId: string, userId: string): Promise<AuthzContext | null> {
    const access = await this.access(organizationId, userId);
    if (!access || access.status !== 'active') return null;
    return this.toContext(access);
  }

  private async evaluate(request: AuthzRequest): Promise<AuthzDecision> {
    const { principal, permission, resource } = request;
    if (principal.type !== 'human' || !principal.id) return deny('NOT_AUTHENTICATED');
    // Organization roles never carry platform permissions (FR-SEC-186); operators arrive in I45.
    if (permission && isPlatformPermission(permission)) return deny('MISSING_PERMISSION');

    let organizationId = request.organizationId;
    let restricted = false;
    // Where restriction and grants are evaluated: the resource itself, or its governing parent.
    let grantTarget = resource;
    let platformPermissions: readonly string[] | null = null;
    let privateOwner: string | null = null;
    if (resource) {
      const resolver = this.resolvers.get(resource.type);
      const owner = await resolver.organizationOf(resource.id);
      if (!owner) {
        // Shared platform resources are read/use-only from inside an organization.
        if (
          !organizationId ||
          !resolver.platformAccess ||
          !(await resolver.platformAccess.isPlatform(resource.id))
        )
          return deny('RESOURCE_NOT_IN_TENANT');
        platformPermissions = resolver.platformAccess.permissions;
      } else if (organizationId && owner !== organizationId) {
        return deny('RESOURCE_NOT_IN_TENANT');
      } else {
        organizationId = owner;
        privateOwner = (await resolver.privateOwnerOf?.(resource.id)) ?? null;
      }
      const parent = owner ? ((await resolver.governedBy?.(resource.id)) ?? null) : null;
      if (parent) {
        const parentResolver = this.resolvers.get(parent.type);
        if ((await parentResolver.organizationOf(parent.id)) !== owner) {
          return deny('RESOURCE_NOT_IN_TENANT');
        }
        grantTarget = parent;
        restricted = (await parentResolver.isRestricted?.(parent.id)) ?? false;
      } else {
        restricted = (await resolver.isRestricted?.(resource.id)) ?? false;
      }
    }
    if (!organizationId) throw new Error('authorization request without organization');

    const access = await this.access(organizationId, principal.id);
    if (!access) return deny('NO_MEMBERSHIP');
    if (access.status !== 'active') return deny('MEMBERSHIP_INACTIVE');

    const context = await this.toContext(access);
    const { config: policy } = await this.policies.current(organizationId);
    const session = request.session;

    // Organization session limits (FR-SEC-053): only tighten the platform timeouts.
    if (session) {
      const now = Date.now();
      if (
        (policy.sessionAbsoluteHours !== null &&
          now - session.createdAt.getTime() > policy.sessionAbsoluteHours * 3_600_000) ||
        (policy.sessionIdleMinutes !== null &&
          now - session.lastSeenAt.getTime() > policy.sessionIdleMinutes * 60_000)
      ) {
        return deny('SESSION_POLICY_EXPIRED', context);
      }
    }
    const mfaVerified = session?.mfaVerified ?? false;
    // Organization-wide MFA requirement (FR-SEC-034).
    if (policy.requireMfa && !mfaVerified) return deny('MFA_REQUIRED', context);

    // A user-private resource does not exist for anyone else (I13).
    if (privateOwner && privateOwner !== principal.id) return deny('RESOURCE_RESTRICTED', context);
    // Platform resources: only the read/use permissions the resolver lists.
    if (platformPermissions && permission && !platformPermissions.includes(permission))
      return deny('MISSING_PERMISSION', context);

    let reason: AuthzDecision['reasonCode'];
    // Restricted resources (projects and everything inside them): roles alone are not enough —
    // the caller needs `<type>.manage_access` or an explicit grant on the restricted resource;
    // without any grant it does not exist for them.
    const managesAccess =
      grantTarget !== undefined &&
      context.permissions.has(`${grantTarget.type}.manage_access` as PermissionKey);
    const grantAction =
      permission && grantTarget ? this.grantActionFor(grantTarget.type, permission) : null;
    if (permission && grantTarget && restricted && !managesAccess) {
      if (
        grantAction &&
        (await this.grants.hasActiveGrant(organizationId, principal.id, grantTarget, grantAction))
      )
        reason = 'ALLOWED_BY_GRANT';
      else if (await this.grants.hasAnyActiveGrant(organizationId, principal.id, grantTarget))
        return deny('MISSING_PERMISSION', context);
      else return deny('RESOURCE_RESTRICTED', context);
    } else if (!permission || context.permissions.has(permission)) reason = 'ALLOWED_BY_ROLE';
    else if (
      grantTarget &&
      grantAction &&
      (await this.grants.hasActiveGrant(organizationId, principal.id, grantTarget, grantAction))
    )
      reason = 'ALLOWED_BY_GRANT';
    else return deny('MISSING_PERMISSION', context);

    // High-risk actions (sensitive permissions = privileged roles) need an MFA-verified session
    // (FR-SEC-033/035, AC-SEC-005) — the Owner gets no exemption (§23 note).
    if (permission && isSensitivePermission(permission) && !mfaVerified) {
      return deny('MFA_REQUIRED', context);
    }
    const obligations: AuthzDecision['obligations'] = [];
    if (permission && requiresStepUp(permission)) {
      const maxAge = policy.stepUpMaxAgeMinutes;
      const fresh = session?.stepUpAt && Date.now() - session.stepUpAt.getTime() <= maxAge * 60_000;
      if (!fresh) obligations.push({ type: 'step_up', maxAgeMinutes: maxAge });
    }
    return {
      decision: 'allow',
      reasonCode: reason,
      policyVersion: POLICY_VERSION,
      obligations,
      context,
    };
  }

  /**
   * Grant action on `targetType` that covers `permission`: own-type permissions map to themselves;
   * types with a mapping (projects) use it; other types accept a grant of the permission itself.
   */
  private grantActionFor(targetType: string, permission: PermissionKey): PermissionKey | null {
    if (permission.startsWith(`${targetType}.`)) return permission;
    const resolver = this.resolvers.get(targetType);
    if (!resolver.grantActionFor) return permission;
    return resolver.grantActionFor(permission) as PermissionKey | null;
  }

  private async access(organizationId: string, userId: string): Promise<MembershipAccess | null> {
    const cached = await this.cache.get(organizationId, userId);
    if (cached) return cached;
    const live = await this.directory.get().findAccess(organizationId, userId);
    if (live) await this.cache.set(live);
    return live;
  }

  private async toContext(access: MembershipAccess): Promise<AuthzContext> {
    const permissions: ReadonlySet<PermissionKey> = await this.rolePermissions.permissionsFor(
      access.roleIds,
    );
    return {
      organizationId: access.organizationId,
      membershipId: access.membershipId,
      userId: access.userId,
      roles: roleKeysOf(access.roleIds),
      permissions,
    };
  }
}
