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

import { authzContext } from '../../platform/authz/authorizer.js';
import { AuthenticatedOnly, RequirePermission } from '../../platform/authz/decorators.js';
import { currentUserId } from '../../platform/authz/principal.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { OrganizationService } from './organization.service.js';

@Controller('orgs')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationService) {}

  @Post()
  @AuthenticatedOnly()
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
  @AuthenticatedOnly()
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
  @RequirePermission('organization.view')
  @Endpoint({
    summary: 'Organization details',
    tags: ['organizations'],
    params: orgIdParamsSchema,
    response: myOrganizationSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request): Promise<MyOrganization> {
    return this.orgs.get(authzContext(req));
  }

  @Patch(':orgId')
  @RequirePermission('organization.update')
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
    return this.orgs.rename(authzContext(req), body.name);
  }

  @Post(':orgId/ownership-transfer')
  @HttpCode(204)
  @RequirePermission('organization.transfer_ownership')
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
      authzContext(req),
      body.toMembershipId,
      body.confirmOrganizationName,
    );
  }
}
