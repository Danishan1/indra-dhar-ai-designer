import {
  commitRevisionRequestSchema,
  commitRevisionResponseSchema,
  compareQuerySchema,
  compareResponseSchema,
  createDesignRequestSchema,
  designListQuerySchema,
  designListResponseSchema,
  designParamsSchema,
  designSchema,
  duplicateDesignRequestSchema,
  projectDesignsParamsSchema,
  restoreRevisionRequestSchema,
  revisionListResponseSchema,
  revisionParamsSchema,
  revisionSchema,
  workingCopySchema,
} from '@ai-designer/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { CompareService } from './compare.service.js';
import { DesignsService } from './designs.service.js';
import { RevisionService } from './revision.service.js';
import { WorkingCopyService } from './working-copy.service.js';

const PROJECT = { type: 'project', param: 'projectId' };
const DESIGN = { type: 'design', param: 'designId' };
const REVISION = { type: 'revision', param: 'revisionId' };
const READ_ERRORS = ['NOT_FOUND', 'PERMISSION_DENIED'] as const;
const WRITE_ERRORS = [
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'VALIDATION_FAILED',
  'VALIDATION_BLOCKED',
  'CONCURRENT_MODIFICATION',
  'INVALID_STATE_TRANSITION',
] as const;

@Controller('orgs/:orgId/projects/:projectId/designs')
export class ProjectDesignsController {
  constructor(private readonly designs: DesignsService) {}

  @Get()
  @RequirePermission('design.view', { resource: PROJECT })
  @Endpoint({
    summary: 'Designs of a project (most recently changed first)',
    tags: ['designs'],
    params: projectDesignsParamsSchema,
    query: designListQuerySchema,
    response: designListResponseSchema,
    errors: [...READ_ERRORS],
  })
  list(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Query() query: z.output<typeof designListQuerySchema>,
  ) {
    return this.designs.list(authzContext(req), projectId, query);
  }

  @Post()
  @Idempotent()
  @RequirePermission('design.create', { resource: PROJECT })
  @Endpoint({
    summary: 'CreateDesign: from a template or blank; commits revision R001',
    tags: ['designs'],
    params: projectDesignsParamsSchema,
    body: createDesignRequestSchema,
    response: designSchema,
    successStatus: 201,
    errors: [...WRITE_ERRORS],
  })
  create(
    @Req() req: Request,
    @Param('projectId') projectId: string,
    @Body() body: z.output<typeof createDesignRequestSchema>,
  ) {
    return this.designs.create(authzContext(req), projectId, body);
  }
}

@Controller('orgs/:orgId/designs/:designId')
export class DesignsController {
  constructor(
    private readonly designs: DesignsService,
    private readonly workingCopies: WorkingCopyService,
    private readonly revisions: RevisionService,
    private readonly comparisons: CompareService,
  ) {}

  @Get()
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Design with its pointers (head, approved, working-copy version)',
    tags: ['designs'],
    params: designParamsSchema,
    response: designSchema,
    errors: [...READ_ERRORS],
  })
  get(@Req() req: Request, @Param('designId') designId: string) {
    return this.designs.get(authzContext(req), designId);
  }

  @Get('working-copy')
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'Working copy: current state, version and non-blocking findings',
    tags: ['designs'],
    params: designParamsSchema,
    response: workingCopySchema,
    errors: [...READ_ERRORS],
  })
  workingCopy(@Req() req: Request, @Param('designId') designId: string) {
    return this.workingCopies.get(authzContext(req), designId);
  }

  @Post('revisions')
  @Idempotent()
  @RequirePermission('design.commit', { resource: DESIGN })
  @Endpoint({
    summary: 'CommitRevision: snapshot the working copy as the next immutable revision',
    tags: ['designs'],
    params: designParamsSchema,
    body: commitRevisionRequestSchema,
    response: commitRevisionResponseSchema,
    successStatus: 201,
    errors: [...WRITE_ERRORS, 'NO_CHANGES', 'INTEGRITY_CHECK_FAILED'],
  })
  commit(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof commitRevisionRequestSchema>,
  ) {
    return this.workingCopies.commit(authzContext(req), designId, body);
  }

  @Get('revisions')
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary: 'GetDesignHistory: revisions, newest first (no snapshots)',
    tags: ['designs'],
    params: designParamsSchema,
    query: designListQuerySchema,
    response: revisionListResponseSchema,
    errors: [...READ_ERRORS],
  })
  history(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Query() query: z.output<typeof designListQuerySchema>,
  ) {
    return this.revisions.history(authzContext(req).organizationId, designId, query);
  }

  @Get('compare')
  @RequirePermission('design.view', { resource: DESIGN })
  @Endpoint({
    summary:
      'CompareRevisions: structural diff of two revisions, or a revision and the working copy',
    tags: ['designs'],
    params: designParamsSchema,
    query: compareQuerySchema,
    response: compareResponseSchema,
    errors: [...READ_ERRORS, 'REVISION_NOT_FOUND', 'INTEGRITY_CHECK_FAILED', 'VALIDATION_FAILED'],
  })
  compare(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Query() query: z.output<typeof compareQuerySchema>,
  ) {
    return this.comparisons.compare(authzContext(req), designId, query);
  }

  @Post('restore')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('design.restore', { resource: DESIGN })
  @Endpoint({
    summary: 'RestoreRevisionToWorkingCopy: history is kept; commit afterwards to record it',
    tags: ['designs'],
    params: designParamsSchema,
    body: restoreRevisionRequestSchema,
    response: workingCopySchema,
    errors: [...WRITE_ERRORS, 'REVISION_NOT_FOUND', 'INTEGRITY_CHECK_FAILED'],
  })
  restore(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof restoreRevisionRequestSchema>,
  ) {
    return this.workingCopies.restore(authzContext(req), designId, body);
  }

  @Post('duplicate')
  @Idempotent()
  @RequirePermission('design.create', { resource: DESIGN })
  @Endpoint({
    summary:
      'Duplicate the latest revision into a new design (same or another project); no approvals',
    tags: ['designs'],
    params: designParamsSchema,
    body: duplicateDesignRequestSchema,
    response: designSchema,
    successStatus: 201,
    errors: [...WRITE_ERRORS, 'CONFLICT', 'INTEGRITY_CHECK_FAILED'],
  })
  duplicate(
    @Req() req: Request,
    @Param('designId') designId: string,
    @Body() body: z.output<typeof duplicateDesignRequestSchema>,
  ) {
    return this.designs.duplicate(req, authzContext(req), designId, body);
  }
}

/** Revisions by id (the route's only id is the revision, so the PEP can tenant-check it). */
@Controller('orgs/:orgId/revisions/:revisionId')
export class RevisionsController {
  constructor(private readonly revisions: RevisionService) {}

  @Get()
  @RequirePermission('design.view', { resource: REVISION })
  @Endpoint({
    summary: 'A revision with its snapshot (integrity-checked)',
    tags: ['designs'],
    params: revisionParamsSchema,
    response: revisionSchema,
    errors: [...READ_ERRORS, 'REVISION_NOT_FOUND', 'INTEGRITY_CHECK_FAILED'],
  })
  get(@Req() req: Request, @Param('revisionId') revisionId: string) {
    return this.revisions.get(authzContext(req).organizationId, revisionId);
  }
}
