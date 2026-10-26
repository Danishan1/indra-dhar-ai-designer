import { Injectable, type OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AssetReferenceRegistry } from '../assets/reference-registry.js';

export interface DesignRevisionReference {
  designId: string;
  designDisplayId: string;
  designName: string;
  projectId: string;
  revisionId: string;
  revisionDisplayId: string;
  artifactRevisionIds: string[];
}

/**
 * "Where used" over design revisions and drafts (owned here because designs own those tables).
 * The artifact registry asks it before deleting (ART-011) and for its where-used view; the asset
 * service asks it before deleting a file a revision pins.
 */
@Injectable()
export class DesignReferencesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetReferences: AssetReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.assetReferences.register('design revisions', async (asset) => {
      const rev = await this.prisma.designRevision.findFirst({
        where: { organizationId: asset.organizationId, sourceAssetRefs: { has: asset.id } },
        select: { displayId: true },
      });
      return rev ? `used by ${rev.displayId}` : null;
    });
  }

  /** Committed revisions in one organization that pin any of the given artifact revisions. */
  async revisionsUsing(
    organizationId: string,
    artifactRevisionIds: readonly string[],
    limit = 200,
  ): Promise<DesignRevisionReference[]> {
    if (artifactRevisionIds.length === 0) return [];
    const rows = await this.prisma.designRevision.findMany({
      where: { organizationId, artifactRevisionRefs: { hasSome: [...artifactRevisionIds] } },
      select: {
        id: true,
        displayId: true,
        artifactRevisionRefs: true,
        design: {
          select: { id: true, displayId: true, name: true, projectId: true, deletedAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const wanted = new Set(artifactRevisionIds);
    return rows
      .filter((r) => r.design.deletedAt === null)
      .map((r) => ({
        designId: r.design.id,
        designDisplayId: r.design.displayId,
        designName: r.design.name,
        projectId: r.design.projectId,
        revisionId: r.id,
        revisionDisplayId: r.displayId,
        artifactRevisionIds: r.artifactRevisionRefs.filter((x) => wanted.has(x)),
      }));
  }

  /** Any reference at all — in ANY organization (platform artifacts are shared). */
  async isReferencedAnywhere(artifactRevisionIds: readonly string[]): Promise<boolean> {
    if (artifactRevisionIds.length === 0) return false;
    const rev = await this.prisma.designRevision.findFirst({
      where: { artifactRevisionRefs: { hasSome: [...artifactRevisionIds] } },
      select: { id: true },
    });
    return rev !== null || (await this.draftsUsing(null, artifactRevisionIds)) > 0;
  }

  /** Design drafts (working copies) whose components bind any of the artifact revisions. */
  async draftsUsing(
    organizationId: string | null,
    artifactRevisionIds: readonly string[],
  ): Promise<number> {
    if (artifactRevisionIds.length === 0) return 0;
    const ids = [...artifactRevisionIds];
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM working_copies wc
      WHERE (${organizationId}::uuid IS NULL OR wc.organization_id = ${organizationId}::uuid)
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(wc.state->'components') c,
                        jsonb_array_elements(COALESCE(c->'artifactBindings', '[]'::jsonb)) b
          WHERE b->>'artifactRevisionId' = ANY(${ids}::text[])
        )`;
    return Number(rows[0]?.n ?? 0);
  }
}
