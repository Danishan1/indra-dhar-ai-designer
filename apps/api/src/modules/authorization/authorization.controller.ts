import {
  BaselineRoleKeys,
  canDelegateRole,
  effectivePermissionsSchema,
  isPermissionKey,
  isPlatformPermission,
  myPermissionsQuerySchema,
  myPermissionsResponseSchema,
  orgIdParamsSchema,
  orgMemberParamsSchema,
  type OrgRoleKey,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  permissionCatalogResponseSchema,
  permissionParts,
  rolesResponseSchema,
  securityPolicySchema,
  updateSecurityPolicyRequestSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import {
  AuthenticatedOnly,
  RequireMembership,
  RequirePermission,
} from '../../platform/authz/decorators.js';
import { currentUserId } from '../../platform/authz/principal.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AuthorizationService } from './authorization.service.js';
import { EffectivePermissionsService } from './effective-permissions.service.js';
import { SecurityPolicyService } from './security-policy.service.js';

@Controller()
export class AuthorizationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdp: AuthorizationService,
    private readonly effective: EffectivePermissionsService,
    private readonly policies: SecurityPolicyService,
  ) {}

  @Get('orgs/:orgId/security-policy')
  @RequirePermission('security_policy.manage')
  @Endpoint({
    summary: 'Organization security policy (MFA requirement, step-up age, session limits)',
    tags: ['authorization'],
    params: orgIdParamsSchema,
    response: securityPolicySchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'MFA_REQUIRED'],
  })
  securityPolicy(@Req() req: Request) {
    return this.policies.view(authzContext(req).organizationId);
  }

  @Put('orgs/:orgId/security-policy')
  @RequirePermission('security_policy.manage')
  @Endpoint({
    summary: 'Change the security policy (new version; needs a recent step-up)',
    tags: ['authorization'],
    params: orgIdParamsSchema,
    body: updateSecurityPolicyRequestSchema,
    response: securityPolicySchema,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'MFA_REQUIRED',
      'STEP_UP_REQUIRED',
      'VALIDATION_FAILED',
    ],
  })
  updateSecurityPolicy(
    @Req() req: Request,
    @Body() body: z.output<typeof updateSecurityPolicyRequestSchema>,
  ) {
    const ctx = authzContext(req);
    return this.policies.update(ctx.organizationId, body, ctx.userId);
  }

  @Get('permissions')
  @AuthenticatedOnly()
  @Endpoint({
    summary: 'Permission catalog',
    tags: ['authorization'],
    response: permissionCatalogResponseSchema,
  })
  catalog() {
    return {
      items: PERMISSION_KEYS.map((key) => ({
        key,
        ...permissionParts(key),
        description: PERMISSION_CATALOG[key].description,
        sensitive: PERMISSION_CATALOG[key].sensitive,
        platform: isPlatformPermission(key),
      })),
    };
  }

  @Get('orgs/:orgId/roles')
  @RequirePermission('roles.view')
  @Endpoint({
    summary:
      'Roles available in the organization, with permissions and whether you can assign them',
    tags: ['authorization'],
    params: orgIdParamsSchema,
    response: rolesResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  async roles(@Req() req: Request) {
    const ctx = authzContext(req);
    const rows = await this.prisma.role.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] },
      include: { permissions: { select: { permissionKey: true } } },
    });
    const order = new Map<string, number>(BaselineRoleKeys.map((k, i) => [k, i]));
    return {
      items: rows
        .filter((r): r is typeof r & { key: OrgRoleKey } => order.has(r.key))
        .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
        .map((r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          assignable: r.assignable,
          delegableByMe: canDelegateRole(ctx.roles, r.key),
          permissions: PERMISSION_KEYS.filter((k) =>
            r.permissions.some((p) => p.permissionKey === k && isPermissionKey(k)),
          ),
        })),
    };
  }

  @Get('orgs/:orgId/members/:membershipId/effective-permissions')
  @RequireMembership({ resource: { type: 'membership', param: 'membershipId' } })
  @Endpoint({
    summary: 'Effective permissions of a member (yourself, or anyone with members.view)',
    tags: ['authorization'],
    params: orgMemberParamsSchema,
    response: effectivePermissionsSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  effectivePermissions(@Req() req: Request, @Param('membershipId') membershipId: string) {
    const ctx = authzContext(req);
    if (membershipId !== ctx.membershipId && !ctx.permissions.has('members.view')) {
      throw new AppError('PERMISSION_DENIED', 'You do not have permission to do that', {
        reason: 'missing_permission',
        permission: 'members.view',
      });
    }
    return this.effective.forMembership(ctx.organizationId, membershipId);
  }

  @Get('me/permissions')
  @AuthenticatedOnly()
  @Endpoint({
    summary: 'Your roles and permissions in an organization (for UI gating only)',
    tags: ['authorization'],
    query: myPermissionsQuerySchema,
    response: myPermissionsResponseSchema,
    errors: ['NOT_FOUND'],
  })
  async myPermissions(@Query() query: z.output<typeof myPermissionsQuerySchema>) {
    const ctx = await this.pdp.contextFor(query.orgId, currentUserId());
    if (!ctx) throw AppError.notFound('Organization');
    const { config } = await this.policies.current(ctx.organizationId);
    return {
      organizationId: ctx.organizationId,
      requireMfa: config.requireMfa,
      roles: ctx.roles,
      permissions: PERMISSION_KEYS.filter((k) => ctx.permissions.has(k)),
    };
  }
}
