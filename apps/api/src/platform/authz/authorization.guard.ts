import { type CanActivate, type ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

import { AUTHZ_METADATA, type AuthzDeclaration } from './decorators.js';
import { PolicyEnforcer } from './policy-enforcer.js';
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
    private readonly resolvers: ResourceResolverRegistry,
    private readonly enforcer: PolicyEnforcer,
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
    const authz = await this.enforcer.enforce(req, {
      organizationId: orgParam ?? null,
      ...(permission ? { permission } : {}),
      ...(resource ? { resource } : {}),
      notFoundLabel,
    });
    req.authz = authz;
    RequestContext.patch({ organizationId: authz.organizationId });
    return true;
  }
}
