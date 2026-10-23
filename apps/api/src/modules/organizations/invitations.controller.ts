import {
  acceptInvitationResponseSchema,
  createInvitationRequestSchema,
  type Invitation,
  invitationPreviewSchema,
  invitationSchema,
  invitationsResponseSchema,
  invitationTokenRequestSchema,
  orgIdParamsSchema,
  orgInvitationParamsSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { currentUserId, RequireAuth } from '../../platform/auth/require-auth.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { InvitationService } from './invitation.service.js';
import { OrgAccess, orgMembership } from './org-access.js';

@Controller('orgs/:orgId/invitations')
@OrgAccess('organization_owner', 'organization_admin')
export class OrgInvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Get()
  @Endpoint({
    summary: 'Pending invitations',
    tags: ['invitations'],
    params: orgIdParamsSchema,
    response: invitationsResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  async list(@Req() req: Request) {
    return { items: await this.invitations.list(orgMembership(req)) };
  }

  @Post()
  @Endpoint({
    summary: 'Invite someone by email with a proposed role',
    tags: ['invitations'],
    params: orgIdParamsSchema,
    body: createInvitationRequestSchema,
    response: invitationSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'CONFLICT', 'RATE_LIMITED'],
  })
  create(
    @Req() req: Request,
    @Body() body: z.output<typeof createInvitationRequestSchema>,
  ): Promise<Invitation> {
    return this.invitations.create(orgMembership(req), body.email, body.role);
  }

  @Post(':invitationId/cancel')
  @HttpCode(204)
  @Endpoint({
    summary: 'Cancel a pending invitation',
    tags: ['invitations'],
    params: orgInvitationParamsSchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION'],
  })
  async cancel(@Req() req: Request, @Param('invitationId') invitationId: string): Promise<void> {
    await this.invitations.cancel(orgMembership(req), invitationId);
  }

  @Post(':invitationId/resend')
  @HttpCode(200)
  @Endpoint({
    summary: 'Resend with a new link (the old link stops working)',
    tags: ['invitations'],
    params: orgInvitationParamsSchema,
    response: invitationSchema,
    successStatus: 200,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION', 'RATE_LIMITED'],
  })
  resend(@Req() req: Request, @Param('invitationId') invitationId: string): Promise<Invitation> {
    return this.invitations.resend(orgMembership(req), invitationId);
  }
}

/** Invitee-facing endpoints. Tokens are sent in the body, never in the URL (logs). */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  @Post('preview')
  @HttpCode(200)
  @Endpoint({
    summary: 'Preview an invitation (public, minimal information)',
    tags: ['invitations'],
    body: invitationTokenRequestSchema,
    response: invitationPreviewSchema,
    successStatus: 200,
    errors: ['TOKEN_INVALID_OR_EXPIRED', 'RATE_LIMITED'],
  })
  preview(@Body() body: z.output<typeof invitationTokenRequestSchema>, @Req() req: Request) {
    return this.invitations.preview(body.token, req.ip ?? 'unknown');
  }

  @Post('accept')
  @HttpCode(200)
  @RequireAuth()
  @Endpoint({
    summary: 'Accept an invitation as the signed-in user (email must match)',
    tags: ['invitations'],
    body: invitationTokenRequestSchema,
    response: acceptInvitationResponseSchema,
    successStatus: 200,
    errors: ['TOKEN_INVALID_OR_EXPIRED', 'INVITATION_EMAIL_MISMATCH', 'CONFLICT', 'RATE_LIMITED'],
  })
  async accept(@Body() body: z.output<typeof invitationTokenRequestSchema>) {
    return { organization: await this.invitations.accept(currentUserId(), body.token) };
  }
}
