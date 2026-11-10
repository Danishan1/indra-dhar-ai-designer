import { type SizeChart, type sizeChartInputSchema } from '@ai-designer/contracts';
import { newId, type Prisma } from '@ai-designer/db';
import { BodyMeasurementKeys } from '@ai-designer/garment-model';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

type Row = Prisma.SizeChartGetPayload<object>;
type Input = z.output<typeof sizeChartInputSchema>;

const KNOWN = new Set<string>(BodyMeasurementKeys);

/** Organization size charts (ADR-067): named sizes with body measurements, reused by designs. */
@Injectable()
export class SizeChartsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolvers: ResourceResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('size_chart', {
      label: 'Size chart',
      organizationOf: async (id) =>
        (await this.prisma.sizeChart.findFirst({ where: { id }, select: { organizationId: true } }))
          ?.organizationId ?? null,
    });
  }

  async list(ctx: AuthzContext): Promise<{ items: SizeChart[] }> {
    const rows = await this.prisma.sizeChart.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ audience: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  async get(ctx: AuthzContext, id: string): Promise<SizeChart> {
    return this.view(await this.find(ctx, id));
  }

  async create(ctx: AuthzContext, body: Input): Promise<SizeChart> {
    this.check(body);
    const id = newId();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.unique(tx, ctx.organizationId, body.name, null);
      const created = await tx.sizeChart.create({
        data: {
          id,
          organizationId: ctx.organizationId,
          name: body.name,
          audience: body.audience,
          sizes: body.sizes as unknown as Prisma.InputJsonValue,
          createdBy: ctx.userId,
        },
      });
      await this.audit.record(
        {
          eventType: 'size_chart.created',
          action: 'artifact.edit',
          outcome: 'success',
          resourceType: 'size_chart',
          resourceId: id,
          metadata: { name: body.name, audience: body.audience, sizes: body.sizes.length },
        },
        tx,
      );
      return created;
    });
    return this.view(row);
  }

  async update(ctx: AuthzContext, id: string, body: Input): Promise<SizeChart> {
    this.check(body);
    await this.find(ctx, id);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.unique(tx, ctx.organizationId, body.name, id);
      const updated = await tx.sizeChart.update({
        where: { id },
        data: {
          name: body.name,
          audience: body.audience,
          sizes: body.sizes as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(
        {
          eventType: 'size_chart.updated',
          action: 'artifact.edit',
          outcome: 'success',
          resourceType: 'size_chart',
          resourceId: id,
          metadata: { name: body.name, sizes: body.sizes.length },
        },
        tx,
      );
      return updated;
    });
    return this.view(row);
  }

  async remove(ctx: AuthzContext, id: string): Promise<void> {
    const row = await this.find(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.sizeChart.delete({ where: { id } });
      await this.audit.record(
        {
          eventType: 'size_chart.deleted',
          action: 'artifact.edit',
          outcome: 'success',
          resourceType: 'size_chart',
          resourceId: id,
          metadata: { name: row.name },
        },
        tx,
      );
    });
  }

  /** Only known body measurement keys (mm) — designs copy these into their spec. */
  private check(body: Input) {
    const issues = body.sizes.flatMap((s, i) =>
      Object.keys(s.body)
        .filter((k) => !KNOWN.has(k))
        .map((k) => ({
          path: `sizes.${i}.body.${k}`,
          message: `Unknown measurement "${k}"`,
          code: 'unknown_measurement',
        })),
    );
    if (issues.length) throw new AppError('VALIDATION_FAILED', 'Unknown measurements', { issues });
  }

  private async unique(
    tx: Prisma.TransactionClient,
    organizationId: string,
    name: string,
    except: string | null,
  ) {
    const clash = await tx.sizeChart.findFirst({
      where: { organizationId, name, ...(except ? { NOT: { id: except } } : {}) },
      select: { id: true },
    });
    if (clash)
      throw new AppError('CONFLICT', 'A size chart with this name already exists', {
        reason: 'duplicate_name',
      });
  }

  private async find(ctx: AuthzContext, id: string): Promise<Row> {
    const row = await this.prisma.sizeChart.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!row) throw AppError.notFound('Size chart');
    return row;
  }

  private view(row: Row): SizeChart {
    return {
      id: row.id,
      name: row.name,
      audience: row.audience as SizeChart['audience'],
      sizes: (row.sizes as SizeChart['sizes']) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
