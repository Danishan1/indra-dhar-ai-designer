import {
  type CreateTechPackRequest,
  DisplayIdPrefixes,
  JobKinds,
  type TechPack,
  type TechPackSummary,
  type createTechPackRequestSchema,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, type Prisma } from '@ai-designer/db';
import { type CustomSizeChart, patternSpecSchema } from '@ai-designer/garment-model';
import { sizesFor } from '@ai-designer/pattern-model';
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
import { ProjectsService } from '../projects/projects.service.js';
import { SizeChartsService } from '../size-charts/size-charts.service.js';

type TechPackRow = Prisma.TechPackGetPayload<object>;

export type { CreateTechPackRequest };

/** Expected provider calls: text + front/back (+ side) + mannequin + model. */
const expectedCalls = (modelImages: boolean) => (modelImages ? 6 : 4);

export const revisionLabel = (n: number) => `R${String(n).padStart(3, '0')}`;

/**
 * Component 3 — tech pack generator (ADR-056). Owns `tech_packs`. A tech pack always documents one
 * immutable, integrity-checked revision; the generator never changes the design. The worker does
 * the work (`techpack.generate`): AI text and images, technical flats, patterns, BOM and the PDF.
 */
@Injectable()
export class TechPacksService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly assetReferences: AssetReferenceRegistry,
    private readonly designs: DesignsService,
    private readonly revisions: RevisionService,
    private readonly projects: ProjectsService,
    private readonly ai: AiUsageService,
    private readonly sizeCharts: SizeChartsService,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('tech_pack', {
      label: 'Tech pack',
      organizationOf: async (id) =>
        (await this.prisma.techPack.findFirst({ where: { id }, select: { organizationId: true } }))
          ?.organizationId ?? null,
      governedBy: async (id) => {
        const row = await this.prisma.techPack.findFirst({
          where: { id },
          select: { designId: true },
        });
        return row ? { type: 'design', id: row.designId } : null;
      },
    });
    this.assetReferences.register('tech packs', async (asset) => {
      const row = await this.prisma.techPack.findFirst({
        where: { organizationId: asset.organizationId, pdfAssetId: asset.id },
        select: { displayId: true },
      });
      return row ? `PDF of ${row.displayId}` : null;
    });
  }

  async create(
    ctx: AuthzContext,
    designId: string,
    body: z.output<typeof createTechPackRequestSchema>,
  ): Promise<TechPackSummary> {
    const design = await this.designs.get(ctx, designId);
    const revisionId = body.revisionId ?? design.headRevisionId;
    if (!revisionId)
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        'Commit the design before generating a tech pack',
      );
    const { row: revision, state } = await this.revisions.loadVerified(
      this.prisma,
      ctx.organizationId,
      revisionId,
      designId,
    );
    const sizing = body.sizing ? await this.sizing(ctx, state.patternSpec, body.sizing) : null;
    const project = await this.projects.get(ctx, design.projectId);
    const provider = await this.ai.preflight(ctx, body.provider, expectedCalls(body.modelImages), [
      'techpack_documentation',
    ]);
    const row = await this.prisma.$transaction(async (tx) => {
      const id = newId();
      await tx.techPack.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          designId,
          revisionId: revision.id,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.techPack),
          status: 'queued',
          stage: 'Waiting for the generator',
          provider,
          options: {
            modelImages: body.modelImages,
            presentation: body.presentation,
            revisionLabel: revisionLabel(revision.revisionNumber),
            designName: design.name,
            designDisplayId: design.displayId,
            projectName: project.name,
            ...(sizing ? { sizing } : {}),
          },
          createdBy: ctx.userId,
        },
      });
      const job = await this.jobs.create(
        { kind: JobKinds.techPackGenerate, payload: { techPackId: id }, maxAttempts: 2 },
        tx,
      );
      await this.audit.record(
        {
          eventType: 'techpack.requested',
          action: 'design.generate',
          outcome: 'success',
          resourceType: 'tech_pack',
          resourceId: id,
          metadata: { designId, revisionId: revision.id, provider },
        },
        tx,
      );
      return tx.techPack.update({ where: { id }, data: { jobId: job.id } });
    });
    return this.summary(row);
  }

  /**
   * The size chart request (ADR-067), checked against the standard's sizes for the design's wearer;
   * a custom chart is copied in, so the tech pack never changes when the chart is edited.
   */
  private async sizing(
    ctx: AuthzContext,
    rawSpec: unknown,
    req: NonNullable<z.output<typeof createTechPackRequestSchema>['sizing']>,
  ) {
    if (!rawSpec)
      throw new AppError('VALIDATION_FAILED', 'Size ranges need a pattern-first design', {
        issues: [{ path: 'sizing', message: 'This design has no patterns', code: 'no_patterns' }],
      });
    const spec = patternSpecSchema.parse(rawSpec);
    let customChart: CustomSizeChart | null = null;
    if (req.system === 'custom') {
      if (!req.chartId)
        throw new AppError('VALIDATION_FAILED', 'Choose a size chart', {
          issues: [{ path: 'sizing.chartId', message: 'Required', code: 'required' }],
        });
      const chart = await this.sizeCharts.get(ctx, req.chartId);
      if (chart.audience !== spec.audience)
        throw new AppError('VALIDATION_FAILED', `That size chart is for ${chart.audience}`, {
          issues: [{ path: 'sizing.chartId', message: 'Other wearer', code: 'audience' }],
        });
      customChart = {
        id: chart.id,
        name: chart.name,
        audience: chart.audience,
        sizes: chart.sizes.map((s) => ({ label: s.label, body: s.body })),
      };
    }
    const all = sizesFor(spec.audience, req.system, customChart);
    const unknown = [req.baseSize, ...req.sizes].filter((s) => !all.includes(s));
    if (unknown.length)
      throw new AppError(
        'VALIDATION_FAILED',
        `Not a size of this standard: ${unknown.join(', ')}`,
        {
          issues: unknown.map((s) => ({ path: 'sizing.sizes', message: s, code: 'unknown_size' })),
        },
      );
    const chosen = new Set([req.baseSize, ...req.sizes]);
    return {
      system: req.system,
      ...(customChart ? { customChart } : {}),
      baseSize: req.baseSize,
      // Smallest to largest, as the standard lists them.
      sizes: all.filter((s) => chosen.has(s)),
    };
  }

  async list(ctx: AuthzContext, designId: string): Promise<{ items: TechPackSummary[] }> {
    await this.designs.get(ctx, designId);
    const rows = await this.prisma.techPack.findMany({
      where: { organizationId: ctx.organizationId, designId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items: rows.map((r) => this.summary(r)) };
  }

  async get(ctx: AuthzContext, techPackId: string): Promise<TechPack> {
    const row = await this.prisma.techPack.findFirst({
      where: { id: techPackId, organizationId: ctx.organizationId },
    });
    if (!row) throw AppError.notFound('Tech pack');
    return {
      ...this.summary(row),
      document: (row.document as Record<string, unknown> | null) ?? null,
    };
  }

  /** Prints the PDF again from the stored document (no AI calls; the document is unchanged). */
  async reprintPdf(ctx: AuthzContext, techPackId: string): Promise<TechPackSummary> {
    const row = await this.prisma.techPack.findFirst({
      where: { id: techPackId, organizationId: ctx.organizationId },
    });
    if (!row) throw AppError.notFound('Tech pack');
    if (row.status !== 'succeeded' || !row.document)
      throw new AppError('INVALID_STATE_TRANSITION', 'The tech pack is not finished yet');
    if (row.pdfStatus === 'printing') return this.summary(row);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.jobs.create(
        { kind: JobKinds.techPackGenerate, payload: { techPackId, pdfOnly: true }, maxAttempts: 2 },
        tx,
      );
      return tx.techPack.update({
        where: { id: row.id },
        data: { pdfStatus: 'printing', pdfError: null },
      });
    });
    return this.summary(updated);
  }

  private summary(row: TechPackRow): TechPackSummary {
    const error = row.error as { message?: string; kind?: string } | null;
    const options = row.options as { revisionLabel?: string };
    return {
      id: row.id,
      displayId: row.displayId,
      designId: row.designId,
      revisionId: row.revisionId,
      revisionLabel: options.revisionLabel ?? '',
      status: row.status as TechPackSummary['status'],
      stage: row.stage,
      provider: row.provider as TechPackSummary['provider'],
      pdfAssetId: row.pdfAssetId,
      pdfStatus: row.pdfStatus as TechPackSummary['pdfStatus'],
      pdfError: row.pdfError,
      error: error
        ? { message: error.message ?? 'Generation failed', kind: error.kind ?? null }
        : null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}
