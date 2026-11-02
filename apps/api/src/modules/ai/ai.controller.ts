import {
  aiSettingsSchema,
  aiStatusSchema,
  orgIdParamsSchema,
  providerRequestSchema,
  saveProviderKeyRequestSchema,
  testModelRequestSchema,
  testModelResponseSchema,
  updateAiSettingsRequestSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AiCatalogService } from './ai-catalog.service.js';
import { AiUsageService } from './ai-usage.service.js';

@Controller('orgs/:orgId/ai')
export class AiController {
  constructor(
    private readonly usage: AiUsageService,
    private readonly catalog: AiCatalogService,
  ) {}

  @Get('status')
  @RequirePermission('design.view')
  @Endpoint({
    summary: 'AI providers usable by this organization (no secrets) and today’s usage',
    tags: ['ai'],
    params: orgIdParamsSchema,
    response: aiStatusSchema,
    errors: ['PERMISSION_DENIED'],
  })
  status(@Req() req: Request) {
    return this.usage.status(authzContext(req));
  }

  @Get('settings')
  @RequirePermission('organization.view')
  @Endpoint({
    summary:
      'AI providers, discovered models with capabilities, per-operation model preferences and the fallback order (ADR-057). Keys are never returned.',
    tags: ['ai'],
    params: orgIdParamsSchema,
    response: aiSettingsSchema,
    errors: ['PERMISSION_DENIED'],
  })
  settings(@Req() req: Request) {
    return this.catalog.settings(authzContext(req));
  }

  @Put('settings')
  @RequirePermission('credentials.manage')
  @Endpoint({
    summary:
      'Choose the model (or automatic) per operation and whether to fall back across providers',
    tags: ['ai'],
    params: orgIdParamsSchema,
    body: updateAiSettingsRequestSchema,
    response: aiSettingsSchema,
    errors: ['PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  updateSettings(
    @Req() req: Request,
    @Body() body: z.output<typeof updateAiSettingsRequestSchema>,
  ) {
    return this.catalog.updateSettings(authzContext(req), body);
  }

  @Put('providers/key')
  @RequirePermission('credentials.manage')
  @Endpoint({
    summary:
      'Save an organization API key: validated by listing the provider’s models, stored encrypted',
    tags: ['ai'],
    params: orgIdParamsSchema,
    body: saveProviderKeyRequestSchema,
    response: aiSettingsSchema,
    errors: ['PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  saveKey(@Req() req: Request, @Body() body: z.output<typeof saveProviderKeyRequestSchema>) {
    return this.catalog.saveKey(authzContext(req), body.provider, body.apiKey);
  }

  @Post('providers/key/remove')
  @RequirePermission('credentials.manage')
  @Endpoint({
    summary: 'Remove the organization API key (the server key, if any, is used again)',
    tags: ['ai'],
    params: orgIdParamsSchema,
    body: providerRequestSchema,
    response: aiSettingsSchema,
    errors: ['PERMISSION_DENIED'],
  })
  removeKey(@Req() req: Request, @Body() body: z.output<typeof providerRequestSchema>) {
    return this.catalog.removeKey(authzContext(req), body.provider);
  }

  @Post('providers/refresh')
  @RequirePermission('credentials.manage')
  @Endpoint({
    summary: 'Re-discover the provider’s models and re-check the key',
    tags: ['ai'],
    params: orgIdParamsSchema,
    body: providerRequestSchema,
    response: aiSettingsSchema,
    errors: ['PERMISSION_DENIED'],
  })
  refresh(@Req() req: Request, @Body() body: z.output<typeof providerRequestSchema>) {
    return this.catalog.refresh(authzContext(req), body.provider);
  }

  @Post('models/test')
  @RequirePermission('credentials.manage')
  @Endpoint({
    summary: 'Test one model for one operation (listed, capable, live structured answer)',
    tags: ['ai'],
    params: orgIdParamsSchema,
    body: testModelRequestSchema,
    response: testModelResponseSchema,
    errors: ['PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  test(@Req() req: Request, @Body() body: z.output<typeof testModelRequestSchema>) {
    return this.catalog.test(authzContext(req), body.provider, body);
  }
}
