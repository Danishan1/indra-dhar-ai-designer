import {
  type Member,
  memberSchema,
  membersResponseSchema,
  orgIdParamsSchema,
  orgMemberParamsSchema,
} from '@ai-designer/contracts';
import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Endpoint } from '../../platform/validation/endpoint.js';

import { MembershipService } from './membership.service.js';
import { OrgAccess, orgMembership } from './org-access.js';

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
  @OrgAccess()
  @Endpoint({
    summary: 'List members (including ended memberships)',
    tags: ['members'],
    params: orgIdParamsSchema,
    response: membersResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  async list(@Req() req: Request) {
    return { items: await this.memberships.list(orgMembership(req)) };
  }

  @Post(':membershipId/suspend')
  @HttpCode(200)
  @OrgAccess('organization_owner', 'organization_admin')
  @Endpoint({
    summary: 'Suspend a member',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  suspend(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.suspend(orgMembership(req), membershipId);
  }

  @Post(':membershipId/reactivate')
  @HttpCode(200)
  @OrgAccess('organization_owner', 'organization_admin')
  @Endpoint({
    summary: 'Reactivate a suspended member',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  reactivate(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.reactivate(orgMembership(req), membershipId);
  }

  @Post(':membershipId/revoke')
  @HttpCode(200)
  @OrgAccess('organization_owner', 'organization_admin')
  @Endpoint({
    summary: 'Revoke a membership (kept as history)',
    tags: ['members'],
    params: orgMemberParamsSchema,
    response: memberSchema,
    successStatus: 200,
    errors: [...MANAGE_ERRORS],
  })
  revoke(@Req() req: Request, @Param('membershipId') membershipId: string): Promise<Member> {
    return this.memberships.revoke(orgMembership(req), membershipId);
  }
}
