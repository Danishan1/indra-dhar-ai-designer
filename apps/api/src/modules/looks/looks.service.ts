import {
  type createLookRequestSchema,
  DisplayIdPrefixes,
  JobKinds,
  type Look,
  LookViews,
  type LookViewImage,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, type Prisma } from '@ai-designer/db';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { JobService } from '../../platform/jobs/job.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { AssetReferenceRegistry } from '../assets/reference-registry.js';
import { DesignsService } from '../designs/designs.service.js';
import { RevisionService } from '../designs/revision.service.js';

type LookRow = Prisma.DesignLookGetPayload<{
  include: { revision: { select: { revisionNumber: true; displayId: true } } };
}>;

const revisionLabel = (n: number) => `R${String(n).padStart(3, '0')}`;

/**
 * Look previews (ADR-064). A look always shows the patterns of one immutable revision — it is the
 * record of "this is how those patterns look" — so the designer can go back to the patterns of any
 * earlier look by restoring its revision. The worker draws the four views (`look.generate`); the
 * design itself is never changed.
 */
@Injectable()
export class LooksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly assetReferences: AssetReferenceRegistry,
    private readonly designs: DesignsService,
    private readonly revisions: RevisionService,
    private readonly ai: AiUsageService,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('look', {
      label: 'Look preview',
      organizationOf: async (id) =>
        (await this.prisma.designLook.findFirst({ where: { id }, select: { organizationId: true } }))
          ?.organizationId ?? null,
      governedBy: async (id) => {
        const row = await this.prisma.designLook.findFirst({
          where: { id },
          select: { designId: true },
        });
        return row ? { type: 'design', id: row.designId } : null;
      },
    });
    this.assetReferences.register('look previews', async (asset) => {
      const row = await this.prisma.designLook.findFirst({
        where: {
          organizationId: asset.organizationId,
          views: { array_contains: [{ assetId: asset.id }] },
        },
        select: { displayId: true },
      });
      return row ? `view of ${row.displayId}` : null;
    });
  }

  async create(
    ctx: AuthzContext,
    designId: string,
    body: z.output<typeof createLookRequestSchema>,
  ): Promise<Look> {
    const design = await this.designs.get(ctx, designId);
    const revisionId = body.revisionId ?? design.headRevisionId;
    if (!revisionId)
      throw new AppError('INVALID_STATE_TRANSITION', 'Commit the patterns before previewing the look');
    const { row: revision, state } = await this.revisions.loadVerified(
      this.prisma,
      ctx.organizationId,
      revisionId,
      designId,
    );
    if (!state.patternPieces?.length)
      throw new AppError('INVALID_STATE_TRANSITION', 'This revision has no pattern pieces to draw');
    const provider = await this.ai.preflight(ctx, body.provider, LookViews.length, [
      'image_generation',
    ]);
    const id = await this.prisma.$transaction(async (tx) => {
      const id = newId();
      await tx.designLook.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          designId,
          revisionId: revision.id,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.look),
          status: 'queued',
          stage: 'Waiting for the image model',
          provider,
          style: body.style,
          note: body.note || null,
          createdBy: ctx.userId,
        },
      });
      const job = await this.jobs.create(
        { kind: JobKinds.lookGenerate, payload: { lookId: id }, maxAttempts: 2 },
        tx,
      );
      await this.audit.record(
        {
          eventType: 'look.requested',
          action: 'design.generate',
          outcome: 'success',
          resourceType: 'look',
          resourceId: id,
          metadata: { designId, revisionId: revision.id, provider, style: body.style },
        },
        tx,
      );
      await tx.designLook.update({ where: { id }, data: { jobId: job.id } });
      return id;
    });
    return this.get(ctx, id);
  }

  async list(ctx: AuthzContext, designId: string): Promise<{ items: Look[] }> {
    await this.designs.get(ctx, designId);
    const rows = await this.prisma.designLook.findMany({
      where: { organizationId: ctx.organizationId, designId },
      include: { revision: { select: { revisionNumber: true, displayId: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  async get(ctx: AuthzContext, lookId: string): Promise<Look> {
    const row = await this.prisma.designLook.findFirst({
      where: { id: lookId, organizationId: ctx.organizationId },
      include: { revision: { select: { revisionNumber: true, displayId: true } } },
    });
    if (!row) throw AppError.notFound('Look preview');
    return this.view(row);
  }

  private view(row: LookRow): Look {
    const error = row.error as { message?: string; kind?: string } | null;
    const stored = (row.views as LookViewImage[] | null) ?? [];
    return {
      id: row.id,
      displayId: row.displayId,
      designId: row.designId,
      revisionId: row.revisionId,
      revisionLabel: revisionLabel(row.revision.revisionNumber),
      revisionDisplayId: row.revision.displayId,
      status: row.status as Look['status'],
      stage: row.stage,
      provider: row.provider as Look['provider'],
      style: row.style === 'realistic' ? 'realistic' : 'sketch',
      note: row.note,
      views: LookViews.map(
        (view) => stored.find((v) => v.view === view) ?? { view, assetId: null, note: null },
      ),
      error: error
        ? { message: error.message ?? 'Generation failed', kind: error.kind ?? null }
        : null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}
