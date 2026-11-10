import {
  orgIdParamsSchema,
  sizeChartInputSchema,
  sizeChartListResponseSchema,
  sizeChartParamsSchema,
  sizeChartSchema,
} from '@ai-designer/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { SizeChartsService } from './size-charts.service.js';

const CHART = { type: 'size_chart', param: 'chartId' };

/** Organization size charts (ADR-067). Everyone who sees designs uses them; designers edit. */
@Controller('orgs/:orgId/size-charts')
export class SizeChartsController {
  constructor(private readonly charts: SizeChartsService) {}

  @Get()
  @RequirePermission('design.view')
  @Endpoint({
    summary: 'Organization size charts',
    tags: ['sizes'],
    params: orgIdParamsSchema,
    response: sizeChartListResponseSchema,
    errors: ['PERMISSION_DENIED'],
  })
  list(@Req() req: Request) {
    return this.charts.list(authzContext(req));
  }

  @Post()
  @Idempotent()
  @RequirePermission('artifact.create')
  @Endpoint({
    summary: 'Create a size chart',
    tags: ['sizes'],
    params: orgIdParamsSchema,
    body: sizeChartInputSchema,
    response: sizeChartSchema,
    successStatus: 201,
    errors: ['PERMISSION_DENIED', 'VALIDATION_FAILED', 'CONFLICT'],
  })
  create(@Req() req: Request, @Body() body: z.output<typeof sizeChartInputSchema>) {
    return this.charts.create(authzContext(req), body);
  }

  @Get(':chartId')
  @RequirePermission('design.view', { resource: CHART })
  @Endpoint({
    summary: 'One size chart',
    tags: ['sizes'],
    params: sizeChartParamsSchema,
    response: sizeChartSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('chartId') chartId: string) {
    return this.charts.get(authzContext(req), chartId);
  }

  @Put(':chartId')
  @RequirePermission('artifact.edit', { resource: CHART })
  @Endpoint({
    summary: 'Replace a size chart (designs keep the copy they made)',
    tags: ['sizes'],
    params: sizeChartParamsSchema,
    body: sizeChartInputSchema,
    response: sizeChartSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED', 'CONFLICT'],
  })
  update(
    @Req() req: Request,
    @Param('chartId') chartId: string,
    @Body() body: z.output<typeof sizeChartInputSchema>,
  ) {
    return this.charts.update(authzContext(req), chartId, body);
  }

  @Delete(':chartId')
  @HttpCode(204)
  @RequirePermission('artifact.edit', { resource: CHART })
  @Endpoint({
    summary: 'Delete a size chart (designs keep the copy they made)',
    tags: ['sizes'],
    params: sizeChartParamsSchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  async remove(@Req() req: Request, @Param('chartId') chartId: string) {
    await this.charts.remove(authzContext(req), chartId);
  }
}
