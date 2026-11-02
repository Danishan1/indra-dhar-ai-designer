import {
  analysisParamsSchema,
  analysisSchema,
  createAnalysisRequestSchema,
  createDesignFromAnalysisRequestSchema,
  createDesignFromAnalysisResponseSchema,
  projectParamsSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AnalysisService } from './analysis.service.js';

const PROJECT = { type: 'project', param: 'projectId' };
const ANALYSIS = { type: 'analysis', param: 'analysisId' };

@Controller('orgs/:orgId/projects/:projectId/analyses')
export class ProjectAnalysesController {
  constructor(private readonly analyses: AnalysisService) {}

  @Post()
  @Idempotent()
  @RequirePermission('design.generate', { resource: PROJECT })
  @Endpoint({
    summary: 'AnalyzeDesign: queue the AI design analyzer on uploaded images (ADR-056)',
    tags: ['ai-studio'],
    params: projectParamsSchema,
    body: createAnalysisRequestSchema,
    response: analysisSchema,
    successStatus: 201,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'UNSUPPORTED_CAPABILITY',
      'QUOTA_EXCEEDED',
      'INVALID_STATE_TRANSITION',
    ],
  })
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof createAnalysisRequestSchema>,
  ) {
    return this.analyses.create(authzContext(req), projectId, body);
  }
}

@Controller('orgs/:orgId/analyses/:analysisId')
export class AnalysesController {
  constructor(private readonly analyses: AnalysisService) {}

  @Get()
  @RequirePermission('design.view', { resource: ANALYSIS })
  @Endpoint({
    summary: 'One design analysis with its progress and result',
    tags: ['ai-studio'],
    params: analysisParamsSchema,
    response: analysisSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('analysisId') analysisId: string) {
    return this.analyses.get(authzContext(req), analysisId);
  }

  @Post('design')
  @Idempotent()
  @RequirePermission('design.create', { resource: ANALYSIS })
  @Endpoint({
    summary:
      'CreateDesignFromAnalysis: build the structured design from the reviewed analysis; saves fabrics and new components to the library',
    tags: ['ai-studio'],
    params: analysisParamsSchema,
    body: createDesignFromAnalysisRequestSchema,
    response: createDesignFromAnalysisResponseSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED', 'INVALID_STATE_TRANSITION'],
  })
  createDesign(
    @Req() req: Request,
    @Param('analysisId') analysisId: string,
    @Body() body: z.output<typeof createDesignFromAnalysisRequestSchema>,
  ) {
    return this.analyses.createDesign(authzContext(req), analysisId, body);
  }
}
