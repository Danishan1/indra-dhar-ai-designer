import { isSensitivePermission } from '@ai-designer/contracts';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuditService } from '../audit/audit.service.js';
import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

import { AUTHORIZER, type Authorizer, type AuthzDecision } from './authorizer.js';
import { AUTHZ_METADATA, type AuthzDeclaration } from './decorators.js';
import { ResourceResolverRegistry } from './resource-resolvers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Global Policy Enforcement Point (SPEC-009 §5, §22). Every route must carry `@Public()`,
 * `@AuthenticatedOnly()`, `@RequireMembership()` or `@RequirePermission()`; an undeclared route is
 * denied (and the route-declaration test fails the build). Decisions come from the PDP
 * (`AUTHORIZER`); the organization comes from `:orgId` and/or the resource's own record — never
 * from headers or bodies (FR-SEC-217).
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly logger = new Logger('Authorization');

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTHORIZER) private readonly authorizer: Authorizer,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const decl = this.reflector.getAllAndOverride<AuthzDeclaration | undefined>(AUTHZ_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    if (!decl) {
      this.logger.error(
        { route: `${req.method} ${req.route?.path ?? req.path}` },
        'route has no authorization declaration — denied',
      );
      throw new AppError('PERMISSION_DENIED', 'You do not have permission to do that');
    }
    if (decl.kind === 'public') return true;

    const principal = RequestContext.get()?.principal;
    if (principal?.type !== 'human' || !principal.id)
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    if (decl.kind === 'authenticated') return true;

    const param = (name: string): string | undefined => {
      const value = (req.params as Record<string, string | string[] | undefined>)[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const orgParam = param('orgId');
    if (orgParam !== undefined && !UUID_RE.test(orgParam)) throw AppError.notFound('Organization');
    let resource: { type: string; id: string } | undefined;
    let notFoundLabel = 'Organization';
    if (decl.resource) {
      notFoundLabel = this.resolvers.get(decl.resource.type).label;
      const id = param(decl.resource.param);
      if (typeof id !== 'string' || !UUID_RE.test(id)) throw AppError.notFound(notFoundLabel);
      resource = { type: decl.resource.type, id };
    }
    if (orgParam === undefined && !resource) {
      throw new AppError('INTERNAL_ERROR', 'Org-scoped route without :orgId or a resource');
    }

    const permission = decl.kind === 'permission' ? decl.permission : undefined;
    const decision = await this.authorizer.authorize({
      principal,
      organizationId: orgParam ?? null,
      ...(permission ? { permission } : {}),
      ...(resource ? { resource } : {}),
    });

    if (decision.decision === 'allow' && decision.context && decision.obligations.length === 0) {
      req.authz = decision.context;
      RequestContext.patch({ organizationId: decision.context.organizationId });
      return true;
    }
    if (decision.decision === 'allow') {
      // Obligations (step-up, approvals…) are enforced in I08+; none is satisfiable yet → deny.
      throw new AppError('PERMISSION_DENIED', 'Additional verification is required', {
        reason: decision.obligations[0]?.type ?? 'obligation',
      });
    }
    await this.auditDenial(decision, permission, resource);
    throw this.toError(decision, notFoundLabel, permission);
  }

  private toError(decision: AuthzDecision, notFoundLabel: string, permission?: string): AppError {
    switch (decision.reasonCode) {
      case 'NOT_AUTHENTICATED':
      case 'ACCOUNT_INACTIVE':
        return new AppError('UNAUTHENTICATED', 'Sign in to continue');
      case 'NO_MEMBERSHIP':
      case 'RESOURCE_NOT_IN_TENANT':
        // Never reveal whether another tenant's resource exists (FR-SEC-216/241).
        return AppError.notFound(notFoundLabel);
      case 'MEMBERSHIP_INACTIVE':
        return new AppError(
          'PERMISSION_DENIED',
          'Your membership in this organization is suspended',
          {
            reason: 'membership_suspended',
          },
        );
      case 'POLICY_UNAVAILABLE':
        return new AppError(
          'DEPENDENCY_UNAVAILABLE',
          'Access could not be checked right now. Try again shortly.',
        );
      default:
        return new AppError('PERMISSION_DENIED', 'You do not have permission to do that', {
          reason: decision.reasonCode.toLowerCase(),
          ...(permission ? { permission } : {}),
        });
    }
  }

  /** Denials of sensitive actions by members are audited (FR-SEC-178 context, §15.1). */
  private async auditDenial(
    decision: AuthzDecision,
    permission: string | undefined,
    resource: { type: string; id: string } | undefined,
  ): Promise<void> {
    if (!decision.context || !permission) return;
    if (!isSensitivePermission(permission as Parameters<typeof isSensitivePermission>[0])) return;
    try {
      await this.audit.record(
        {
          eventType: 'authorization.denied',
          action: permission,
          outcome: 'denied',
          reasonCode: decision.reasonCode,
          policyVersion: decision.policyVersion,
          ...(resource ? { resourceType: resource.type, resourceId: resource.id } : {}),
        },
        undefined,
        { organizationId: decision.context.organizationId },
      );
    } catch (err) {
      this.logger.warn({ err }, 'failed to audit authorization denial');
    }
  }
}
