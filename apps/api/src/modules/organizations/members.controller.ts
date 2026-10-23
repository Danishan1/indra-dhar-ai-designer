import {
  type Member,
  memberSchema,
  membersResponseSchema,
  orgIdParamsSchema,
  orgMemberParamsSchema,
  updateMemberRolesRequestSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { MembershipService } from './membership.service.js';

const MEMBER = { type: 'membership', param: 'membershipId' };

const MANAGE_ERRORS = [
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'CONFLICT',
  'INVALID_STATE_TRANSITION',
  'LAST_OWNER_REQUIRED',
] as const;

@Controller('orgs/:orgId/members')
export class MembersController {
  constructor(private readonly memberships: MembershipService) {}

  @Get()
  @RequirePermission('members.view')
  @Endpoint({
    summary: 'List members (including ended memberships)',
    tags: ['members'],
    params: orgIdParamsSchema,
    response: membersResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  async list(@Req() req: Request) {
    return { items: await this.memberships.list(authzContext(req)) };
  }

  @Post(':membershipId/suspend')
  @HttpCode(200)
  @RequirePermission('members.manage', { resource: MEMBER })
  @Endpoint({
    summary: 'Suspend a member',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  suspend(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.suspend(authzContext(req), membershipId);
  }

  @Post(':membershipId/reactivate')
  @HttpCode(200)
  @RequirePermission('members.manage', { resource: MEMBER })
  @Endpoint({
    summary: 'Reactivate a suspended member',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  reactivate(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.reactivate(authzContext(req), membershipId);
  }

  @Post(':membershipId/revoke')
  @HttpCode(200)
  @RequirePermission('members.manage', { resource: MEMBER })
  @Endpoint({
    summary: 'Revoke a membership (kept as history)',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  revoke(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.revoke(authzContext(req), membershipId);
  }

  @Put(':membershipId/roles')
  @RequirePermission('members.manage_roles', { resource: MEMBER })
  @Endpoint({
    summary: 'Replace the roles of a member (only roles you can delegate)',
    tags: ['members'],
    params: orgMemberParamsSchema,
    body: updateMemberRolesRequestSchema,
    response: memberSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION'],
  })
  updateRoles(
    @Req() req: Request,
    @Param('membershipId') membershipId: string,
    @Body() body: z.output<typeof updateMemberRolesRequestSchema>,
  ): Promise<Member> {
    return this.memberships.updateRoles(authzContext(req), membershipId, body.roles);
  }
}
