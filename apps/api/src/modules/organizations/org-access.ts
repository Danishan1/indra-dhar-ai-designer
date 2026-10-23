import type { OrgRoleKey } from '@ai-designer/contracts';
import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuthenticatedGuard, AUTH_METADATA } from '../../platform/auth/require-auth.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { roleKeyById } from './roles.js';

export const ORG_ROLES_METADATA = 'aid:org-roles';

export interface OrgMembershipContext {
  organizationId: string;
  membershipId: string;
  userId: string;
  roles: OrgRoleKey[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      orgMembership?: OrgMembershipContext;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tenant guard for `/v1/orgs/:orgId/…` routes (FR-SEC-217, AC5): the organization comes from the
 * path, but access requires a *live, verified* membership of the signed-in user, looked up on every
 * request (no cache → revocation is effective immediately, TR-SEC-004).
 * - no membership / revoked / unknown or deleted org → 404 (existence is not revealed)
 * - suspended membership → 403 (the member already knows the org exists)
 * - missing required role → 403 (placeholder until I07 permissions)
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const principal = RequestContext.get()?.principal;
    if (principal?.type !== 'human' || !principal.id)
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    const orgId = req.params['orgId'];
    if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) throw AppError.notFound('Organization');

    const membership = await this.prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId: principal.id,
        status: { in: ['active', 'suspended'] },
        organization: { status: 'active' },
      },
      include: { roles: true },
    });
    if (!membership) throw AppError.notFound('Organization');
    if (membership.status === 'suspended') {
      throw new AppError('PERMISSION_DENIED', 'Your membership in this organization is suspended', {
        reason: 'membership_suspended',
      });
    }

    const roles = membership.roles
      .map((r) => roleKeyById(r.roleId))
      .filter((r): r is OrgRoleKey => !!r);
    const required = this.reflector.getAllAndOverride<OrgRoleKey[] | undefined>(
      ORG_ROLES_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && !roles.some((r) => required.includes(r))) {
      throw new AppError(
        'PERMISSION_DENIED',
        'You do not have permission to do that in this organization',
      );
    }

    req.orgMembership = {
      organizationId: orgId,
      membershipId: membership.id,
      userId: principal.id,
      roles,
    };
    RequestContext.patch({ organizationId: orgId });
    return true;
  }
}

/**
 * Org-scoped route: signed-in + live membership of `:orgId` (+ one of `roles`, placeholder for the
 * I07 permission catalog). Use on controllers under `orgs/:orgId`.
 */
export function OrgAccess(...roles: OrgRoleKey[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(AUTH_METADATA, 'session'),
    SetMetadata(ORG_ROLES_METADATA, roles),
    UseGuards(AuthenticatedGuard, OrgAccessGuard),
  );
}

export function orgMembership(req: Request): OrgMembershipContext {
  if (!req.orgMembership)
    throw new AppError('INTERNAL_ERROR', 'Org context missing (route lacks @OrgAccess)');
  return req.orgMembership;
}
