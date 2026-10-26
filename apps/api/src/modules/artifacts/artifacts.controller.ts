import {
  artifactDetailSchema,
  artifactListQuerySchema,
  artifactListResponseSchema,
  artifactParamsSchema,
  artifactRevisionParamsSchema,
  artifactRevisionSchema,
  compatibilityCheckRequestSchema,
  compatibilityCheckResponseSchema,
  createArtifactRequestSchema,
  createArtifactRevisionRequestSchema,
  duplicateArtifactRequestSchema,
  orgIdParamsSchema,
  updateArtifactRequestSchema,
  whereUsedResponseSchema,
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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Idempotent } from '../../platform/idempotency/idempotent.decorator.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { ArtifactsService } from './artifacts.service.js';

const ARTIFACT = { type: 'artifact', param: 'artifactId' };
const REVISION = { type: 'artifact_revision', param: 'artifactRevisionId' };
const READ = ['NOT_FOUND', 'PERMISSION_DENIED'] as const;
const WRITE = [
  'NOT_FOUND',
  'PERMISSION_DENIED',
  'VALIDATION_FAILED',
  'VALIDATION_BLOCKED',
  'CONCURRENT_MODIFICATION',
  'INVALID_STATE_TRANSITION',
] as const;

@Controller('orgs/:orgId/artifacts')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get()
  @RequirePermission('artifact.view')
  @Endpoint({
    summary:
      'Browse the library: built-in, organization and your private artifacts (active by default)',
    tags: ['artifacts'],
    params: orgIdParamsSchema,
    query: artifactListQuerySchema,
    response: artifactListResponseSchema,
    errors: [...READ],
  })
  list(@Req() req: Request, @Query() query: z.output<typeof artifactListQuerySchema>) {
    return this.artifacts.list(authzContext(req), query);
  }

  @Post()
  @Idempotent()
  @RequirePermission('artifact.create')
  @Endpoint({
    summary: 'Create a private or organization artifact with revision R001',
    tags: ['artifacts'],
    params: orgIdParamsSchema,
    body: createArtifactRequestSchema,
    response: artifactDetailSchema,
    successStatus: 201,
    errors: [...WRITE],
  })
  create(@Req() req: Request, @Body() body: z.output<typeof createArtifactRequestSchema>) {
    return this.artifacts.create(authzContext(req), body);
  }

  @Post('compatibility-check')
  @HttpCode(200)
  @RequirePermission('artifact.use')
  @Endpoint({
    summary:
      'Can this artifact revision go on that component type / region? (machine-readable rules)',
    tags: ['artifacts'],
    params: orgIdParamsSchema,
    body: compatibilityCheckRequestSchema,
    response: compatibilityCheckResponseSchema,
    errors: [...READ, 'VALIDATION_FAILED'],
  })
  compatibility(
    @Req() req: Request,
    @Body() body: z.output<typeof compatibilityCheckRequestSchema>,
  ) {
    return this.artifacts.compatibility(authzContext(req), body);
  }

  @Get(':artifactId')
  @RequirePermission('artifact.view', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Artifact with all its revisions',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    response: artifactDetailSchema,
    errors: [...READ],
  })
  get(@Req() req: Request, @Param('artifactId') artifactId: string) {
    return this.artifacts.get(authzContext(req), artifactId);
  }

  @Patch(':artifactId')
  @RequirePermission('artifact.edit', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Rename / retag (not revisioned)',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    body: updateArtifactRequestSchema,
    response: artifactDetailSchema,
    errors: [...WRITE],
  })
  update(
    @Req() req: Request,
    @Param('artifactId') artifactId: string,
    @Body() body: z.output<typeof updateArtifactRequestSchema>,
  ) {
    return this.artifacts.update(authzContext(req), artifactId, body);
  }

  @Post(':artifactId/revisions')
  @Idempotent()
  @RequirePermission('artifact.edit', { resource: ARTIFACT })
  @Endpoint({
    summary: 'New immutable revision (designs keep the revision they pinned)',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    body: createArtifactRevisionRequestSchema,
    response: artifactDetailSchema,
    successStatus: 201,
    errors: [...WRITE, 'NO_CHANGES'],
  })
  revise(
    @Req() req: Request,
    @Param('artifactId') artifactId: string,
    @Body() body: z.output<typeof createArtifactRevisionRequestSchema>,
  ) {
    return this.artifacts.revise(authzContext(req), artifactId, body);
  }

  @Post(':artifactId/deactivate')
  @HttpCode(200)
  @RequirePermission('artifact.edit', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Hide from browsing; existing revisions stay resolvable',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    response: artifactDetailSchema,
    errors: [...READ],
  })
  deactivate(@Req() req: Request, @Param('artifactId') artifactId: string) {
    return this.artifacts.setActive(authzContext(req), artifactId, false);
  }

  @Post(':artifactId/reactivate')
  @HttpCode(200)
  @RequirePermission('artifact.edit', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Make a deactivated artifact available again',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    response: artifactDetailSchema,
    errors: [...READ],
  })
  reactivate(@Req() req: Request, @Param('artifactId') artifactId: string) {
    return this.artifacts.setActive(authzContext(req), artifactId, true);
  }

  @Post(':artifactId/publish')
  @HttpCode(200)
  @RequirePermission('artifact.publish', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Share a private artifact with the organization',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    response: artifactDetailSchema,
    errors: [...READ, 'INVALID_STATE_TRANSITION'],
  })
  publish(@Req() req: Request, @Param('artifactId') artifactId: string) {
    return this.artifacts.publish(authzContext(req), artifactId);
  }

  @Post(':artifactId/duplicate')
  @Idempotent()
  @RequirePermission('artifact.create', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Copy into your private or the organization library (e.g. to customize a built-in)',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    body: duplicateArtifactRequestSchema,
    response: artifactDetailSchema,
    successStatus: 201,
    errors: [...WRITE, 'CONFLICT'],
  })
  duplicate(
    @Req() req: Request,
    @Param('artifactId') artifactId: string,
    @Body() body: z.output<typeof duplicateArtifactRequestSchema>,
  ) {
    return this.artifacts.duplicate(authzContext(req), artifactId, body);
  }

  @Get(':artifactId/where-used')
  @RequirePermission('artifact.view', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Design revisions and drafts in this organization that use the artifact',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    response: whereUsedResponseSchema,
    errors: [...READ],
  })
  whereUsed(@Req() req: Request, @Param('artifactId') artifactId: string) {
    return this.artifacts.whereUsed(authzContext(req), artifactId);
  }

  @Delete(':artifactId')
  @HttpCode(204)
  // Own private artifacts need `artifact.edit`; shared ones also `artifact.delete` (checked in the service).
  @RequirePermission('artifact.edit', { resource: ARTIFACT })
  @Endpoint({
    summary: 'Delete an artifact nothing uses (logical; revisions are kept)',
    tags: ['artifacts'],
    params: artifactParamsSchema,
    successStatus: 204,
    errors: [...READ, 'CONFLICT'],
  })
  async remove(@Req() req: Request, @Param('artifactId') artifactId: string): Promise<void> {
    await this.artifacts.remove(authzContext(req), artifactId);
  }
}

/** Exact revisions by id (only the revision id in the path, so the PEP can tenant-check it). */
@Controller('orgs/:orgId/artifact-revisions/:artifactRevisionId')
export class ArtifactRevisionsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Get()
  @RequirePermission('artifact.view', { resource: REVISION })
  @Endpoint({
    summary: 'One exact artifact revision (also of deactivated artifacts)',
    tags: ['artifacts'],
    params: artifactRevisionParamsSchema,
    response: artifactRevisionSchema,
    errors: [...READ],
  })
  get(@Req() req: Request, @Param('artifactRevisionId') id: string) {
    return this.artifacts.getRevision(authzContext(req), id);
  }

  @Get('preview')
  @RequirePermission('artifact.view', { resource: REVISION })
  @Endpoint({
    summary: 'SVG preview of a built-in revision',
    tags: ['artifacts'],
    params: artifactRevisionParamsSchema,
    errors: [...READ],
  })
  async preview(
    @Req() req: Request,
    @Param('artifactRevisionId') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const svg = await this.artifacts.previewSvg(authzContext(req), id);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    // Revisions never change, so the preview can be cached.
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    res.status(200).end(svg);
  }
}
