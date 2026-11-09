import {
  createLookRequestSchema,
  designParamsSchema,
  lookListResponseSchema,
  lookParamsSchema,
  lookSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { LooksService } from './looks.service.js';

const DESIGN = { type: 'design', param: 'designId' };
const LOOK = { type: 'look', param: 'lookId' };

@Controller('orgs/:orgId/designs/:designId/looks')
export class DesignLooksController {
  constructor(private readonly looks: LooksService) {}

  @Post()
  @Idempotent()
  @RequirePermission('design.generate', { resource: DESIGN })
  @Endpoint({
    summary:
      'PreviewLook: draw the garment from the patterns of a committed revision (front, back, left, right)',
    tags: ['ai-studio'],
    params: designParamsSchema,
    body: createLookRequestSchema,
    response: lookSchema,
    successStatus: 201,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'REVISION_NOT_FOUND',
      'INTEGRITY_CHECK_FAILED',
      'INVALID_STATE_TRANSITION',
      'UNSUPPORTED_CAPABILITY',
      'QUOTA_EXCEEDED',
    ],
  })
  create(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof createLookRequestSchema>,
  ) {
    return this.looks.create(authzContext(req), designId, body);
  }

  @Get()
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Look previews of a design (newest first)',
    tags: ['ai-studio'],
    params: designParamsSchema,
    response: lookListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  list(@Req() req: Request, @Param('designId') designId: string) {
    return this.looks.list(authzContext(req), designId);
  }
}

@Controller('orgs/:orgId/looks/:lookId')
export class LooksController {
  constructor(private readonly looks: LooksService) {}

  @Get()
  @RequirePermission('design.view', { resource: LOOK })
  @Endpoint({
    summary: 'One look preview',
    tags: ['ai-studio'],
    params: lookParamsSchema,
    response: lookSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('lookId') lookId: string) {
    return this.looks.get(authzContext(req), lookId);
  }
}
