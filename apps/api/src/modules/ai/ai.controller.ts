import { aiStatusSchema, orgIdParamsSchema } from '@ai-designer/contracts';
import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AiUsageService } from './ai-usage.service.js';

@Controller('orgs/:orgId/ai')
export class AiController {
  constructor(private readonly usage: AiUsageService) {}

  @Get('status')
  @RequirePermission('design.view')
  @Endpoint({
    summary: 'AI providers available on this server (no secrets) and today’s usage',
    tags: ['ai'],
    params: orgIdParamsSchema,
    response: aiStatusSchema,
    errors: ['PERMISSION_DENIED'],
  })
  status(@Req() req: Request) {
    return this.usage.status(authzContext(req));
  }
}
