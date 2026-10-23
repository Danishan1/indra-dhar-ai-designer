import {
  auditSearchQuerySchema,
  auditSearchResponseSchema,
  orgIdParamsSchema,
} from '@ai-designer/contracts';
import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AuditQueryService } from './audit-query.service.js';

@Controller('orgs/:orgId/audit-events')
export class AuditQueryController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermission('audit.view')
  @Endpoint({
    summary: 'Search the organization audit log (newest first, cursor paginated)',
    tags: ['audit'],
    params: orgIdParamsSchema,
    query: auditSearchQuerySchema,
    response: auditSearchResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'MFA_REQUIRED'],
  })
  search(@Req() req: Request, @Query() query: z.output<typeof auditSearchQuerySchema>) {
    return this.audit.search(authzContext(req).organizationId, query);
  }
}
