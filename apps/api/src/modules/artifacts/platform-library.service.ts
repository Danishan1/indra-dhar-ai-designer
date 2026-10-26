import { newId, nextDisplayId, type Prisma } from '@ai-designer/db';
import { ArtifactCategories, validateArtifactRevision } from '@ai-designer/garment-model';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service.js';

import {
  ArtifactsService,
  revisionContentHash,
  type RevisionContent,
} from './artifacts.service.js';
import { PLATFORM_LIBRARY, type PlatformArtifactSpec } from './platform-library/library.js';

/** Serializes concurrent syncs (several API processes starting together). */
const LOCK_KEY = 4_202_610_13;

interface Desired {
  spec: PlatformArtifactSpec;
  content: RevisionContent;
  hash: string;
}

/**
 * Keeps the built-in library (FR-050) in the database, idempotently: missing items are created,
 * changed content becomes a new immutable revision, changed names/tags are updated in place,
 * items removed from the code are marked `deprecated` (still resolvable for old designs).
 * Runs at API start; a no-op when nothing changed.
 */
@Injectable()
export class PlatformLibraryService implements OnApplicationBootstrap {
  private readonly logger = new Logger('PlatformLibrary');

  constructor(
    private readonly prisma: PrismaService,
    private readonly artifacts: ArtifactsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.sync();
    if (result.created || result.revised || result.updated || result.deprecated)
      this.logger.log(result, 'built-in artifact library synced');
  }

  desired(): Desired[] {
    return PLATFORM_LIBRARY.map((spec) => {
      const v = validateArtifactRevision(spec.definition, {
        visual: spec.visual ?? {},
        physical: spec.physical ?? {},
      });
      if (!v.ok || !v.definition || !v.properties)
        throw new Error(`Built-in artifact ${spec.key} is invalid: ${JSON.stringify(v.findings)}`);
      const content: RevisionContent = {
        definition: v.definition,
        properties: v.properties,
        previewAssetId: null,
      };
      return { spec, content, hash: revisionContentHash(content) };
    });
  }

  async sync(): Promise<{ created: number; revised: number; updated: number; deprecated: number }> {
    const desired = this.desired();
    const stats = { created: 0, revised: 0, updated: 0, deprecated: 0 };
    const plan = async (db: Prisma.TransactionClient | PrismaService) => {
      const rows = await db.artifact.findMany({
        where: { ownerScope: 'platform' },
        include: { currentRevision: { select: { contentHash: true } } },
      });
      return new Map(rows.map((r) => [r.platformKey ?? '', r]));
    };
    const needsWork = (existing: Awaited<ReturnType<typeof plan>>) =>
      desired.some((d) => {
        const row = existing.get(d.spec.key);
        return (
          !row ||
          row.currentRevision?.contentHash !== d.hash ||
          !sameMeta(row, d.spec) ||
          row.lifecycleStatus !== 'active'
        );
      }) ||
      [...existing.values()].some(
        (r) => r.lifecycleStatus === 'active' && !desired.some((d) => d.spec.key === r.platformKey),
      );

    if (!needsWork(await plan(this.prisma))) return stats;

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
        const existing = await plan(tx);
        for (const d of desired) {
          let row = existing.get(d.spec.key);
          if (!row) {
            const created = await tx.artifact.create({
              data: {
                id: newId(),
                organizationId: null,
                ownerScope: 'platform',
                displayId: await nextDisplayId(tx, null, ArtifactCategories[d.spec.category]),
                category: d.spec.category,
                artifactType: d.spec.artifactType,
                name: d.spec.name,
                description: d.spec.description,
                tags: d.spec.tags,
                platformKey: d.spec.key,
                publishedAt: new Date(),
              },
            });
            await this.artifacts.insertRevision(tx, created, d.content, 'Built-in library', null);
            stats.created++;
            continue;
          }
          if (!sameMeta(row, d.spec) || row.lifecycleStatus !== 'active') {
            row = {
              ...row,
              ...(await tx.artifact.update({
                where: { id: row.id },
                data: {
                  name: d.spec.name,
                  description: d.spec.description,
                  tags: d.spec.tags,
                  artifactType: d.spec.artifactType,
                  lifecycleStatus: 'active',
                  version: { increment: 1 },
                },
              })),
            };
            stats.updated++;
          }
          if (row.currentRevision?.contentHash !== d.hash) {
            await this.artifacts.insertRevision(
              tx,
              row,
              d.content,
              'Built-in library update',
              null,
            );
            stats.revised++;
          }
        }
        for (const row of existing.values()) {
          if (
            row.lifecycleStatus === 'active' &&
            !desired.some((d) => d.spec.key === row.platformKey)
          ) {
            await tx.artifact.update({
              where: { id: row.id },
              data: { lifecycleStatus: 'deprecated' },
            });
            stats.deprecated++;
          }
        }
      },
      { timeout: 60_000 },
    );
    return stats;
  }
}

function sameMeta(
  row: { name: string; description: string | null; tags: string[]; artifactType: string },
  spec: PlatformArtifactSpec,
): boolean {
  return (
    row.name === spec.name &&
    row.description === spec.description &&
    row.artifactType === spec.artifactType &&
    row.tags.join('|') === spec.tags.join('|')
  );
}
