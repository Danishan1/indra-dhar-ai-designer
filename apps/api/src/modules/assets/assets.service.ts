import {
  type AcceptedMediaType,
  type Asset as AssetView,
  AssetDeletedEvent,
  AssetUploadedEvent,
  type AssetVariant,
  type CreateUploadRequest,
  type CreateUploadResponse,
  decodeCursor,
  DisplayIdPrefixes,
  encodeCursor,
  JobKinds,
  MediaTypes,
  type Page,
  type Provenance,
  UPLOAD_RULES,
} from '@ai-designer/contracts';
import { type Asset, newId, nextDisplayId } from '@ai-designer/db';
import { assetObjectKey, extensionFor, SNIFF_BYTES, sniffMediaType } from '@ai-designer/media';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppConfig } from '../../platform/config/app-config.js';
import { AppError } from '../../platform/errors/app-error.js';
import { JobService } from '../../platform/jobs/job.service.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import {
  type RateLimitRule,
  RateLimitService,
} from '../../platform/rate-limit/rate-limit.service.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../platform/storage/object-storage.js';

import { AssetReferenceRegistry } from './reference-registry.js';

export const AssetRateLimits = {
  uploadUser: { name: 'assets.upload.user', limit: 120, windowSeconds: 3600 },
} satisfies Record<string, RateLimitRule>;

const RETENTION_DAYS = 30;

/**
 * Asset & storage service (SS-11, I09). Owns the `assets` table. Uploads are proxied through the
 * API (ADR-044): create → PUT bytes (streamed with a hard size cap, sniffed) → `quarantined` → the
 * worker's `asset.process` job decides `ready` / `rejected`. Bytes are only served when `ready`.
 */
@Injectable()
export class AssetsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly jobs: JobService,
    private readonly rateLimits: RateLimitService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly references: AssetReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('asset', {
      label: 'Asset',
      organizationOf: async (id) =>
        (
          await this.prisma.asset.findFirst({
            where: { id, deletedAt: null },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
    });
  }

  /** Byte limit for the media family the client says it will send (re-checked on the bytes). */
  maxBytesFor(mediaType: string): number {
    const l = this.config.assetLimits;
    if (mediaType === MediaTypes.svg) return l.svgBytes;
    if (mediaType === MediaTypes.pdf) return l.documentBytes;
    return l.imageBytes;
  }

  async createUpload(
    ctx: AuthzContext,
    body: Required<
      Pick<CreateUploadRequest, 'assetType' | 'fileName' | 'mediaType' | 'sizeBytes'>
    > &
      CreateUploadRequest,
  ): Promise<CreateUploadResponse> {
    if (body.projectId)
      throw new AppError(
        'UNSUPPORTED_CAPABILITY',
        'Attaching uploads to projects arrives with projects (I10)',
      );
    const allowed = UPLOAD_RULES[body.assetType];
    if (!allowed)
      throw new AppError('VALIDATION_FAILED', 'This kind of file cannot be uploaded', {
        issues: [{ path: 'assetType', message: 'Not uploadable', code: 'not_uploadable' }],
      });
    const declared = body.mediaType.toLowerCase() as AcceptedMediaType;
    if (!allowed.includes(declared))
      throw new AppError(
        'VALIDATION_FAILED',
        `Unsupported file type. Allowed: ${allowed.join(', ')}`,
        {
          issues: [
            { path: 'mediaType', message: 'Unsupported file type', code: 'unsupported_media_type' },
          ],
        },
      );
    const maxBytes = this.maxBytesFor(declared);
    if (body.sizeBytes > maxBytes)
      throw new AppError(
        'PAYLOAD_TOO_LARGE',
        `The file is larger than ${Math.round(maxBytes / 1048576)} MB`,
        {
          maxBytes,
        },
      );
    await this.rateLimits.enforce([{ rule: AssetRateLimits.uploadUser, subject: ctx.userId }]);

    const id = newId();
    const createdAt = new Date();
    const provenance: Provenance = {
      sourceType: 'user_upload',
      uploadedBy: ctx.userId,
      originalFileName: body.fileName,
    };
    const row = await this.prisma.$transaction(async (tx) =>
      tx.asset.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.asset),
          assetType: body.assetType,
          status: 'pending_upload',
          bucket: this.config.storage.buckets.originals,
          storageKey: assetObjectKey(ctx.organizationId, id, 'original', createdAt),
          declaredSize: BigInt(body.sizeBytes),
          declaredChecksum: body.checksumSha256 ?? null,
          fileName: body.fileName,
          provenance,
          createdBy: ctx.userId,
          createdAt,
        },
      }),
    );
    return {
      asset: await this.view(row),
      uploadUrl: `/v1/orgs/${ctx.organizationId}/assets/${id}/content`,
      maxBytes,
    };
  }

  /** Receives the bytes (streamed, capped), sniffs them, stores the original and queues processing. */
  async receiveContent(ctx: AuthzContext, assetId: string, req: Request): Promise<AssetView> {
    const asset = await this.findInTenant(ctx.organizationId, assetId);
    if (asset.createdBy !== ctx.userId)
      throw new AppError('PERMISSION_DENIED', 'Only the person who started the upload can send it');
    if (asset.status !== 'pending_upload')
      throw AppError.invalidTransition(asset.status, 'quarantined');

    const declaredSize = Number(asset.declaredSize ?? 0);
    const cap = Math.min(declaredSize, this.config.assetLimits.documentBytes);
    const body = await readCapped(req, cap);
    if (body === 'too_large')
      throw new AppError('PAYLOAD_TOO_LARGE', 'The file is larger than announced', {
        maxBytes: cap,
      });
    const sniffed = sniffMediaType(body.subarray(0, SNIFF_BYTES));
    const allowed = UPLOAD_RULES[asset.assetType as keyof typeof UPLOAD_RULES] ?? [];
    if (!sniffed || !allowed.includes(sniffed)) {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'rejected', rejectionReason: 'unsupported_content' },
      });
      throw new AppError('VALIDATION_FAILED', 'The file content is not an accepted type', {
        issues: [
          {
            path: 'content',
            message: 'Unsupported or disguised file type',
            code: 'unsupported_content',
          },
        ],
      });
    }
    if (body.length > this.maxBytesFor(sniffed))
      throw new AppError('PAYLOAD_TOO_LARGE', 'The file is too large for its type', {
        maxBytes: this.maxBytesFor(sniffed),
      });

    await this.storage.putObject({
      bucket: asset.bucket,
      key: asset.storageKey,
      body,
      contentType: sniffed,
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.asset.update({
        where: { id: asset.id },
        data: { status: 'quarantined', mediaType: sniffed, sizeBytes: BigInt(body.length) },
      });
      await this.jobs.create(
        { kind: JobKinds.assetProcess, payload: { assetId: asset.id }, maxAttempts: 3 },
        tx,
      );
      await this.audit.record(
        {
          eventType: 'assets.asset.uploaded',
          action: 'asset.upload',
          outcome: 'success',
          resourceType: 'asset',
          resourceId: asset.id,
          metadata: { mediaType: sniffed, sizeBytes: body.length, assetType: asset.assetType },
        },
        tx,
      );
      await this.outbox.append(tx, AssetUploadedEvent, {
        organizationId: ctx.organizationId,
        assetId: asset.id,
      });
      return row;
    });
    return this.view(updated);
  }

  async get(ctx: AuthzContext, assetId: string): Promise<AssetView> {
    return this.view(await this.findInTenant(ctx.organizationId, assetId));
  }

  async list(
    ctx: AuthzContext,
    query: {
      cursor?: string | undefined;
      limit: number;
      type?: string | undefined;
      status?: string | undefined;
      projectId?: string | undefined;
    },
  ): Promise<Page<AssetView>> {
    const cursor = query.cursor ? decodeCursor<{ t: string; id: string }>(query.cursor) : null;
    const rows = await this.prisma.asset.findMany({
      where: {
        organizationId: ctx.organizationId,
        isDerived: false,
        deletedAt: null,
        ...(query.type ? { assetType: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.t) } },
                { createdAt: new Date(cursor.t), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const views = await this.views(page);
    const last = page[page.length - 1];
    return {
      items: views,
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ t: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /** The stored object of a ready asset variant (throws 404 when not servable). */
  async resolveVariant(ctx: AuthzContext, assetId: string, variant: AssetVariant): Promise<Asset> {
    const asset = await this.findInTenant(ctx.organizationId, assetId);
    if (asset.status !== 'ready')
      throw new AppError('INVALID_STATE_TRANSITION', 'The file is not ready yet', {
        status: asset.status,
      });
    if (variant === 'original') return asset;
    const derived = await this.prisma.asset.findFirst({
      where: {
        organizationId: ctx.organizationId,
        parentAssetId: asset.id,
        variant,
        deletedAt: null,
        status: 'ready',
      },
    });
    if (!derived) throw AppError.notFound('Asset variant');
    return derived;
  }

  /** Short-lived signed URL (≤ 5 min) for a ready variant — authorization is checked first (SEC-002). */
  async signedUrl(ctx: AuthzContext, assetId: string, variant: AssetVariant) {
    const target = await this.resolveVariant(ctx, assetId, variant);
    const ttl = this.config.assetLimits.urlTtlSeconds;
    const url = await this.storage.presignGet(target.bucket, target.storageKey, {
      expiresInSeconds: ttl,
      contentDisposition: this.disposition(target, variant),
      ...(target.mediaType ? { contentType: target.mediaType } : {}),
    });
    return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
  }

  async content(ctx: AuthzContext, assetId: string, variant: AssetVariant) {
    const target = await this.resolveVariant(ctx, assetId, variant);
    const body = await this.storage.getObject(target.bucket, target.storageKey);
    return {
      body,
      mediaType: target.mediaType ?? 'application/octet-stream',
      disposition: this.disposition(target, variant),
    };
  }

  private disposition(asset: Asset, variant: AssetVariant): string {
    const base = (asset.fileName ?? asset.displayId)
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 80);
    const ext = asset.mediaType ? extensionFor(asset.mediaType as AcceptedMediaType) : 'bin';
    return `inline; filename="${base}${variant === 'original' ? '' : `-${variant}`}.${ext}"`;
  }

  /** Soft delete (retention keeps bytes for 30 days); refused while referenced (AST-006). */
  async remove(ctx: AuthzContext, assetId: string): Promise<void> {
    const asset = await this.findInTenant(ctx.organizationId, assetId);
    const refs = await this.references.referencesOf(asset);
    if (refs.length)
      throw new AppError('CONFLICT', 'This file is used elsewhere and cannot be deleted', {
        reason: 'referenced',
        references: refs,
      });
    const now = new Date();
    const retentionUntil = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.asset.updateMany({
        where: {
          organizationId: ctx.organizationId,
          OR: [{ id: asset.id }, { parentAssetId: asset.id }],
        },
        data: { deletedAt: now, retentionUntil },
      });
      await this.audit.record(
        {
          eventType: 'assets.asset.deleted',
          action: 'asset.delete',
          outcome: 'success',
          resourceType: 'asset',
          resourceId: asset.id,
          metadata: { retentionUntil: retentionUntil.toISOString() },
        },
        tx,
      );
      await this.outbox.append(tx, AssetDeletedEvent, {
        organizationId: ctx.organizationId,
        assetId: asset.id,
      });
    });
  }

  private async findInTenant(organizationId: string, assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId, deletedAt: null },
    });
    if (!asset) throw AppError.notFound('Asset');
    return asset;
  }

  private async view(asset: Asset): Promise<AssetView> {
    return (await this.views([asset]))[0] as AssetView;
  }

  private async views(assets: Asset[]): Promise<AssetView[]> {
    const derived = assets.length
      ? await this.prisma.asset.findMany({
          where: {
            parentAssetId: { in: assets.map((a) => a.id) },
            deletedAt: null,
            status: 'ready',
          },
          select: { parentAssetId: true, variant: true },
        })
      : [];
    return assets.map((a) => ({
      id: a.id,
      displayId: a.displayId,
      assetType: a.assetType as AssetView['assetType'],
      status: a.status as AssetView['status'],
      mediaType: a.mediaType,
      sizeBytes: a.sizeBytes === null ? null : Number(a.sizeBytes),
      checksumSha256: a.checksumSha256,
      dimensions: (a.dimensions as AssetView['dimensions']) ?? null,
      fileName: a.fileName,
      projectId: a.projectId,
      isDerived: a.isDerived,
      parentAssetId: a.parentAssetId,
      variant: a.variant as AssetVariant,
      variants: [
        ...(a.status === 'ready' ? (['original'] as AssetVariant[]) : []),
        ...derived.filter((d) => d.parentAssetId === a.id).map((d) => d.variant as AssetVariant),
      ],
      provenance: a.provenance as Provenance,
      rejectionReason: a.rejectionReason,
      createdAt: a.createdAt.toISOString(),
    }));
  }
}

/** Reads a request body up to `cap` bytes; stops reading (and reports) as soon as it is exceeded. */
function readCapped(req: Request, cap: number): Promise<Buffer | 'too_large'> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const declared = Number(req.headers['content-length'] ?? '0');
    if (declared > cap) {
      resolve('too_large');
      req.resume();
      return;
    }
    req.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > cap) {
        done = true;
        req.removeAllListeners('data');
        req.resume();
        resolve('too_large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!done) resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!done) reject(err);
    });
  });
}
