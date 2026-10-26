import {
  assetListQuerySchema,
  assetListResponseSchema,
  assetParamsSchema,
  assetSchema,
  assetUrlResponseSchema,
  assetVariantQuerySchema,
  createUploadRequestSchema,
  createUploadResponseSchema,
  orgIdParamsSchema,
} from '@ai-designer/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { z } from 'zod';

import { authzContext } from '../../platform/authz/authorizer.js';
import { RequirePermission } from '../../platform/authz/decorators.js';
import { Endpoint } from '../../platform/validation/endpoint.js';

import { AssetsService } from './assets.service.js';

const ASSET = { type: 'asset', param: 'assetId' };

@Controller('orgs/:orgId/assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermission('asset.view')
  @Endpoint({
    summary: 'List uploaded files (newest first)',
    tags: ['assets'],
    params: orgIdParamsSchema,
    query: assetListQuerySchema,
    response: assetListResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  list(@Req() req: Request, @Query() query: z.output<typeof assetListQuerySchema>) {
    return this.assets.list(authzContext(req), query);
  }

  @Post('uploads')
  @RequirePermission('asset.upload')
  @Endpoint({
    summary: 'Start an upload: checks type/size, returns the URL to PUT the bytes to',
    tags: ['assets'],
    params: orgIdParamsSchema,
    body: createUploadRequestSchema,
    response: createUploadResponseSchema,
    successStatus: 201,
    errors: [
      'NOT_FOUND',
      'PERMISSION_DENIED',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_CAPABILITY',
      'RATE_LIMITED',
    ],
  })
  createUpload(@Req() req: Request, @Body() body: z.output<typeof createUploadRequestSchema>) {
    return this.assets.createUpload(authzContext(req), body);
  }

  @Put(':assetId/content')
  @HttpCode(200)
  @RequirePermission('asset.upload', { resource: ASSET })
  @Endpoint({
    summary:
      'Send the file bytes (application/octet-stream); the file is then checked in the background',
    tags: ['assets'],
    params: assetParamsSchema,
    response: assetSchema,
    successStatus: 200,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'PAYLOAD_TOO_LARGE', 'INVALID_STATE_TRANSITION'],
  })
  upload(@Req() req: Request, @Param('assetId') assetId: string) {
    return this.assets.receiveContent(authzContext(req), assetId, req);
  }

  @Get(':assetId')
  @RequirePermission('asset.view', { resource: ASSET })
  @Endpoint({
    summary: 'File metadata',
    tags: ['assets'],
    params: assetParamsSchema,
    response: assetSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED'],
  })
  get(@Req() req: Request, @Param('assetId') assetId: string) {
    return this.assets.get(authzContext(req), assetId);
  }

  @Get(':assetId/url')
  @RequirePermission('asset.view', { resource: ASSET })
  @Endpoint({
    summary: 'Short-lived signed download URL (≤ 5 minutes)',
    tags: ['assets'],
    params: assetParamsSchema,
    query: assetVariantQuerySchema,
    response: assetUrlResponseSchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION'],
  })
  url(
    @Req() req: Request,
    @Param('assetId') assetId: string,
    @Query() query: z.output<typeof assetVariantQuerySchema>,
  ) {
    return this.assets.signedUrl(authzContext(req), assetId, query.variant);
  }

  @Get(':assetId/content')
  @RequirePermission('asset.view', { resource: ASSET })
  @Endpoint({
    summary: 'Stream the file through the API (authorized on every request)',
    tags: ['assets'],
    params: assetParamsSchema,
    query: assetVariantQuerySchema,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'INVALID_STATE_TRANSITION'],
  })
  async content(
    @Req() req: Request,
    @Param('assetId') assetId: string,
    @Query() query: z.output<typeof assetVariantQuerySchema>,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.assets.content(authzContext(req), assetId, query.variant);
    res.setHeader('Content-Type', file.mediaType);
    res.setHeader('Content-Disposition', file.disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Even sanitized SVG never runs anything when opened directly.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).end(file.body);
  }

  @Delete(':assetId')
  @HttpCode(204)
  @RequirePermission('asset.delete', { resource: ASSET })
  @Endpoint({
    summary: 'Delete a file (kept 30 days for recovery; refused while it is referenced)',
    tags: ['assets'],
    params: assetParamsSchema,
    successStatus: 204,
    errors: ['NOT_FOUND', 'PERMISSION_DENIED', 'CONFLICT'],
  })
  async remove(@Req() req: Request, @Param('assetId') assetId: string): Promise<void> {
    await this.assets.remove(authzContext(req), assetId);
  }
}
