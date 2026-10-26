import {
  createProjectGrantRequestSchema,
  createProjectRequestSchema,
  deleteProjectQuerySchema,
  dependentsResponseSchema,
  duplicateProjectRequestSchema,
  lifecycleRequestSchema,
  orgIdParamsSchema,
  projectGrantListResponseSchema,
  projectGrantSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectParamsSchema,
  projectSchema,
  revokeProjectGrantQuerySchema,
  updateProjectRequestSchema,
  updateVisibilityRequestSchema,
} from '@ai-designer/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { ProjectsService } from './projects.service.js';

const PROJECT = { type: 'project', param: 'projectId' };
const STATE_ERRORS = [
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'INVALID_STATE_TRANSITION',
  'VALIDATION_BLOCKED',
  'VALIDATION_FAILED',
] as const;

@Controller('orgs/:orgId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('project.view')
  @Endpoint({
    summary: 'List projects (active work by default; filter by status and metadata, search)',
    tags: ['projects'],
    params: orgIdParamsSchema,
    query: projectListQuerySchema,
    response: projectListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  list(@Req() req: Request, @Query() query: z.output<typeof projectListQuerySchema>) {
    return this.projects.list(authzContext(req), query);
  }

  @Post()
  @Idempotent()
  @RequirePermission('project.create')
  @Endpoint({
    summary: 'Create a project (starts ACTIVE)',
    tags: ['projects'],
    params: orgIdParamsSchema,
    body: createProjectRequestSchema,
    response: projectSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  create(@Req() req: Request, @Body() body: z.output<typeof createProjectRequestSchema>) {
    return this.projects.create(authzContext(req), body);
  }

  @Get(':projectId')
  @RequirePermission('project.view', { resource: PROJECT })
  @Endpoint({
    summary: 'Project detail',
    tags: ['projects'],
    params: projectParamsSchema,
    response: projectSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.projects.get(authzContext(req), projectId);
  }

  @Patch(':projectId')
  @RequirePermission('project.edit', { resource: PROJECT })
  @Endpoint({
    summary: 'Update metadata (send the version you last saw)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: updateProjectRequestSchema,
    response: projectSchema,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'VALIDATION_FAILED',
      'CONCURRENT_MODIFICATION',
      'INVALID_STATE_TRANSITION',
    ],
  })
  update(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof updateProjectRequestSchema>,
  ) {
    return this.projects.update(authzContext(req), projectId, body);
  }

  @Put(':projectId/visibility')
  @HttpCode(200)
  @RequirePermission('project.manage_access', { resource: PROJECT })
  @Endpoint({
    summary: 'Make a project visible to the organization or restrict it to people with access',
    tags: ['projects'],
    params: projectParamsSchema,
    body: updateVisibilityRequestSchema,
    response: projectSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'CONCURRENT_MODIFICATION'],
  })
  visibility(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof updateVisibilityRequestSchema>,
  ) {
    return this.projects.setVisibility(
      authzContext(req),
      projectId,
      body.expectedVersion,
      body.visibility,
    );
  }

  @Post(':projectId/hold')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.edit', { resource: PROJECT })
  @Endpoint({
    summary: 'Put the project on hold (optional reason)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  hold(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'hold', body.reason);
  }

  @Post(':projectId/resume')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.edit', { resource: PROJECT })
  @Endpoint({
    summary: 'Resume a project that is on hold',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  resume(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'resume', body.reason);
  }

  @Post(':projectId/complete')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.edit', { resource: PROJECT })
  @Endpoint({
    summary: 'Mark the project completed (does not imply approvals or production readiness)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  complete(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'complete', body.reason);
  }

  @Post(':projectId/reopen')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.archive', { resource: PROJECT })
  @Endpoint({
    summary: 'Reopen a completed project (a reason is required)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  reopen(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'reopen', body.reason);
  }

  @Post(':projectId/archive')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.archive', { resource: PROJECT })
  @Endpoint({
    summary: 'Archive a project (history is kept; hidden from active work)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  archive(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'archive', body.reason);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('project.archive', { resource: PROJECT })
  @Endpoint({
    summary: 'Restore an archived project to ACTIVE',
    tags: ['projects'],
    params: projectParamsSchema,
    body: lifecycleRequestSchema,
    response: projectSchema,
    errors: [...STATE_ERRORS],
  })
  restore(
    @Req() req: Request,
    @Param('projectId') id: string,
    @Body() body: z.output<typeof lifecycleRequestSchema>,
  ) {
    return this.projects.transition(authzContext(req), id, 'restore', body.reason);
  }

  @Get(':projectId/dependents')
  @RequirePermission('project.view', { resource: PROJECT })
  @Endpoint({
    summary: 'What depends on this project (shown before deleting)',
    tags: ['projects'],
    params: projectParamsSchema,
    response: dependentsResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  dependents(@Req() req: Request, @Param('projectId') projectId: string) {
    return this.projects.dependents(authzContext(req), projectId);
  }

  @Delete(':projectId')
  @HttpCode(204)
  @RequirePermission('project.delete', { resource: PROJECT })
  @Endpoint({
    summary: 'Delete a project (logical; refused with 409 while dependents exist unless confirmed)',
    tags: ['projects'],
    params: projectParamsSchema,
    query: deleteProjectQuerySchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'CONFLICT', 'INVALID_STATE_TRANSITION'],
  })
  async remove(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query() query: z.output<typeof deleteProjectQuerySchema>,
  ): Promise<void> {
    await this.projects.remove(authzContext(req), projectId, query.acknowledgeDependents);
  }

  @Post(':projectId/duplicate')
  @Idempotent()
  @RequirePermission('project.create', { resource: PROJECT })
  @Endpoint({
    summary: 'Copy the project metadata into a new project (designs are copied from I12)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: duplicateProjectRequestSchema,
    response: projectSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED'],
  })
  duplicate(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof duplicateProjectRequestSchema>,
  ) {
    return this.projects.duplicate(authzContext(req), projectId, body.name);
  }

  @Get(':projectId/grants')
  @RequirePermission('project.manage_access', { resource: PROJECT })
  @Endpoint({
    summary: 'People with explicit access to the project',
    tags: ['projects'],
    params: projectParamsSchema,
    response: projectGrantListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'MFA_REQUIRED'],
  })
  async grants(@Req() req: Request, @Param('projectId') projectId: string) {
    return { items: await this.projects.listGrants(authzContext(req), projectId) };
  }

  @Post(':projectId/grants')
  @Idempotent()
  @RequirePermission('project.manage_access', { resource: PROJECT })
  @Endpoint({
    summary: 'Give an organization member access to the project (replaces their earlier grant)',
    tags: ['projects'],
    params: projectParamsSchema,
    body: createProjectGrantRequestSchema,
    response: projectGrantSchema,
    successStatus: 201,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'VALIDATION_FAILED', 'MFA_REQUIRED'],
  })
  grant(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof createProjectGrantRequestSchema>,
  ) {
    return this.projects.grantAccess(authzContext(req), projectId, body);
  }

  @Delete(':projectId/grants')
  @HttpCode(204)
  @RequirePermission('project.manage_access', { resource: PROJECT })
  @Endpoint({
    summary: "Take away a person's explicit access (?userId=)",
    tags: ['projects'],
    params: projectParamsSchema,
    query: revokeProjectGrantQuerySchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'MFA_REQUIRED'],
  })
  async revoke(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query() query: z.output<typeof revokeProjectGrantQuerySchema>,
  ): Promise<void> {
    await this.projects.revokeAccess(authzContext(req), projectId, query.userId);
  }
}
