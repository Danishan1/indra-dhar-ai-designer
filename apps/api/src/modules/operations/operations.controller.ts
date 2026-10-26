import {
  designOperationSchema,
  designParamsSchema,
  operationListQuerySchema,
  operationListResponseSchema,
  operationParamsSchema,
  submitOperationRequestSchema,
  submitOperationResponseSchema,
  validateOperationRequestSchema,
  validateOperationResponseSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { OperationsService } from './operations.service.js';

const DESIGN = { type: 'design', param: 'designId' };
const OPERATION = { type: 'operation', param: 'operationId' };

@Controller('orgs/:orgId/designs/:designId/operations')
export class DesignOperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Post()
  @Idempotent()
  @RequirePermission('design.edit', { resource: DESIGN })
  @Endpoint({
    summary:
      'Submit a design operation (or batch / revert) against the working copy version you saw',
    tags: ['operations'],
    params: designParamsSchema,
    body: submitOperationRequestSchema,
    response: submitOperationResponseSchema,
    successStatus: 201,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'VALIDATION_BLOCKED',
      'UNSUPPORTED_CAPABILITY',
      'CONCURRENT_MODIFICATION',
      'INVALID_STATE_TRANSITION',
      'NO_CHANGES',
      'CONFLICT',
    ],
  })
  submit(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof submitOperationRequestSchema>,
  ) {
    const key = req.header('idempotency-key');
    return this.operations.submit(authzContext(req), designId, body, key ?? undefined);
  }

  @Post('validate')
  @HttpCode(200)
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary:
      'Dry run: would this operation apply? (findings, strategy, resulting patch; nothing stored)',
    tags: ['operations'],
    params: designParamsSchema,
    body: validateOperationRequestSchema,
    response: validateOperationResponseSchema,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'CONCURRENT_MODIFICATION',
      'NO_CHANGES',
      'CONFLICT',
    ],
  })
  validate(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof validateOperationRequestSchema>,
  ) {
    return this.operations.validate(authzContext(req), designId, body);
  }

  @Get()
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Operation history of a design (newest first)',
    tags: ['operations'],
    params: designParamsSchema,
    query: operationListQuerySchema,
    response: operationListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  history(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Query() query: z.output<typeof operationListQuerySchema>,
  ) {
    return this.operations.history(authzContext(req), designId, query);
  }
}

@Controller('orgs/:orgId/operations/:operationId')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get()
  @RequirePermission('design.view', { resource: OPERATION })
  @Endpoint({
    summary: 'One design operation with its provenance',
    tags: ['operations'],
    params: operationParamsSchema,
    response: designOperationSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('operationId') operationId: string) {
    return this.operations.get(authzContext(req), operationId);
  }
}
