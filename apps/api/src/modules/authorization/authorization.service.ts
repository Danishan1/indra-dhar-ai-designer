import { isPlatformPermission, type PermissionKey } from '@ai-designer/contracts';
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
    if (resource) {
      const owner = await this.resolvers.get(resource.type).organizationOf(resource.id);
      if (!owner || (organizationId && owner !== organizationId)) {
        return deny('RESOURCE_NOT_IN_TENANT');
      }
      organizationId = owner;
    }
    if (!organizationId) throw new Error('authorization request without organization');

    const access = await this.access(organizationId, principal.id);
    if (!access) return deny('NO_MEMBERSHIP');
    if (access.status !== 'active') return deny('MEMBERSHIP_INACTIVE');

    const context = await this.toContext(access);
    const allow = (reasonCode: AuthzDecision['reasonCode']): AuthzDecision => ({
      decision: 'allow',
      reasonCode,
      policyVersion: POLICY_VERSION,
      obligations: [],
      context,
    });
    if (!permission || context.permissions.has(permission)) return allow('ALLOWED_BY_ROLE');
    if (
      resource &&
      (await this.grants.hasActiveGrant(organizationId, principal.id, resource, permission))
    ) {
      return allow('ALLOWED_BY_GRANT');
    }
    return deny('MISSING_PERMISSION', context);
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
