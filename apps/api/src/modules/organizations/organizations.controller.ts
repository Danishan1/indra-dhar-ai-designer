import {
  createOrganizationRequestSchema,
  myOrganizationSchema,
  type MyOrganization,
  myOrganizationsResponseSchema,
  orgIdParamsSchema,
  transferOwnershipRequestSchema,
  updateOrganizationRequestSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { currentUserId, RequireAuth } from '../../platform/auth/require-auth.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { OrgAccess, orgMembership } from './org-access.js';
import { OrganizationService } from './organization.service.js';

@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationService) {}

  @Post()
  @RequireAuth()
  @Endpoint({
    summary: 'Create an organization (you become its owner)',
    tags: ['organizations'],
    body: createOrganizationRequestSchema,
    response: myOrganizationSchema,
    successStatus: 201,
    errors: ['UNAUTHENTICATED', 'CONFLICT'],
  })
  create(@Body() body: z.output<typeof createOrganizationRequestSchema>): Promise<MyOrganization> {
    return this.orgs.create(currentUserId(), body.name);
  }

  @Get()
  @RequireAuth()
  @Endpoint({
    summary: 'My organizations',
    tags: ['organizations'],
    response: myOrganizationsResponseSchema,
    errors: ['UNAUTHENTICATED'],
  })
  async listMine() {
    return { items: await this.orgs.listMine(currentUserId()) };
  }

  @Get(':orgId')
  @OrgAccess()
  @Endpoint({
    summary: 'Organization details',
    tags: ['organizations'],
    params: orgIdParamsSchema,
    response: myOrganizationSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request): Promise<MyOrganization> {
    return this.orgs.get(orgMembership(req));
  }

  @Patch(':orgId')
  @OrgAccess('organization_owner', 'organization_admin')
  @Endpoint({
    summary: 'Rename the organization',
    tags: ['organizations'],
    params: orgIdParamsSchema,
    body: updateOrganizationRequestSchema,
    response: myOrganizationSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  update(
    @Req() req: Request,
    @Body() body: z.output<typeof updateOrganizationRequestSchema>,
  ): Promise<MyOrganization> {
    return this.orgs.rename(orgMembership(req), body.name);
  }

  @Post(':orgId/ownership-transfer')
  @HttpCode(204)
  @OrgAccess('organization_owner')
  @Endpoint({
    summary: 'Transfer ownership to another active member (explicit confirmation required)',
    tags: ['organizations'],
    params: orgIdParamsSchema,
    body: transferOwnershipRequestSchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'CONFLICT', 'INVALID_STATE_TRANSITION'],
  })
  async transferOwnership(
    @Req() req: Request,
    @Body() body: z.output<typeof transferOwnershipRequestSchema>,
  ): Promise<void> {
    await this.orgs.transferOwnership(
      orgMembership(req),
      body.toMembershipId,
      body.confirmOrganizationName,
    );
  }
}
