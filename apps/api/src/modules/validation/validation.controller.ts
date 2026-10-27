import {
  designParamsSchema,
  latestValidationQuerySchema,
  latestValidationResponseSchema,
  runValidationRequestSchema,
  validationRunParamsSchema,
  validationRunSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { ValidationService } from './validation.service.js';

const DESIGN = { type: 'design', param: 'designId' };
const RUN = { type: 'validation_run', param: 'runId' };

@Controller('orgs/:orgId/designs/:designId/validation-runs')
export class DesignValidationController {
  constructor(private readonly validation: ValidationService) {}

  @Post()
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary:
      'RunValidation: design-structure validation of the working copy or a revision (not production readiness)',
    tags: ['validation'],
    params: designParamsSchema,
    body: runValidationRequestSchema,
    response: validationRunSchema,
    successStatus: 201,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'REVISION_NOT_FOUND',
      'INTEGRITY_CHECK_FAILED',
    ],
  })
  run(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof runValidationRequestSchema>,
  ) {
    return this.validation.run(authzContext(req), designId, body);
  }

  @Get('latest')
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Latest validation run of the working copy (with staleness) or of a revision',
    tags: ['validation'],
    params: designParamsSchema,
    query: latestValidationQuerySchema,
    response: latestValidationResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  latest(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Query() query: z.output<typeof latestValidationQuerySchema>,
  ) {
    return this.validation.latest(authzContext(req), designId, query);
  }
}

@Controller('orgs/:orgId/validation-runs/:runId')
export class ValidationRunsController {
  constructor(private readonly validation: ValidationService) {}

  @Get()
  @RequirePermission('design.view', { resource: RUN })
  @Endpoint({
    summary: 'One validation run with its findings',
    tags: ['validation'],
    params: validationRunParamsSchema,
    response: validationRunSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('runId') runId: string) {
    return this.validation.get(authzContext(req), runId);
  }
}
