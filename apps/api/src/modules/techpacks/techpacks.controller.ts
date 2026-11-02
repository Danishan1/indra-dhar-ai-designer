import {
  createTechPackRequestSchema,
  designParamsSchema,
  techPackListResponseSchema,
  techPackParamsSchema,
  techPackSchema,
  techPackSummarySchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { TechPacksService } from './techpacks.service.js';

const DESIGN = { type: 'design', param: 'designId' };
const TECH_PACK = { type: 'tech_pack', param: 'techPackId' };

@Controller('orgs/:orgId/designs/:designId/techpacks')
export class DesignTechPacksController {
  constructor(private readonly techPacks: TechPacksService) {}

  @Post()
  @Idempotent()
  @RequirePermission('design.generate', { resource: DESIGN })
  @Endpoint({
    summary:
      'GenerateTechPack: queue the tech pack generator for a committed revision (defaults to the latest)',
    tags: ['ai-studio'],
    params: designParamsSchema,
    body: createTechPackRequestSchema,
    response: techPackSummarySchema,
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
    @Body() body: z.output<typeof createTechPackRequestSchema>,
  ) {
    return this.techPacks.create(authzContext(req), designId, body);
  }

  @Get()
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Tech packs generated for a design (newest first)',
    tags: ['ai-studio'],
    params: designParamsSchema,
    response: techPackListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  list(@Req() req: Request, @Param('designId') designId: string) {
    return this.techPacks.list(authzContext(req), designId);
  }
}

@Controller('orgs/:orgId/techpacks/:techPackId')
export class TechPacksController {
  constructor(private readonly techPacks: TechPacksService) {}

  @Get()
  @RequirePermission('design.view', { resource: TECH_PACK })
  @Endpoint({
    summary: 'One tech pack with its document',
    tags: ['ai-studio'],
    params: techPackParamsSchema,
    response: techPackSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('techPackId') techPackId: string) {
    return this.techPacks.get(authzContext(req), techPackId);
  }

  @Post('pdf')
  @Idempotent()
  @RequirePermission('design.export', { resource: TECH_PACK })
  @Endpoint({
    summary: 'Print the tech pack PDF again from the stored document (no AI calls)',
    tags: ['ai-studio'],
    params: techPackParamsSchema,
    response: techPackSummarySchema,
    successStatus: 202,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION'],
  })
  reprint(@Req() req: Request, @Param('techPackId') techPackId: string) {
    return this.techPacks.reprintPdf(authzContext(req), techPackId);
  }
}
