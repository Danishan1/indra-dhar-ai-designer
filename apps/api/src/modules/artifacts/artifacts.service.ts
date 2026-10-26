import {
  type Artifact as ArtifactView,
  ArtifactCreatedEvent,
  ArtifactDeactivatedEvent,
  ArtifactDeletedEvent,
  type ArtifactDetail,
  type ArtifactLifecycleStatuses,
  ArtifactPublishedEvent,
  ArtifactReactivatedEvent,
  type ArtifactRevision as ArtifactRevisionView,
  ArtifactRevisionCreatedEvent,
  artifactListQuerySchema,
  type createArtifactRequestSchema,
  type createArtifactRevisionRequestSchema,
  decodeCursor,
  encodeCursor,
  formatRevisionId,
  type Page,
  type PermissionKey,
  type updateArtifactRequestSchema,
  type WhereUsed,
} from '@ai-designer/contracts';
import {
  newId,
  nextDisplayId,
  type Artifact,
  type ArtifactRevision,
  type Prisma,
} from '@ai-designer/db';
import {
  ArtifactCategories,
  type ArtifactCategory,
  canonicalJson,
  checkCompatibility,
  deriveGeometryCapability,
  deriveValidationStatus,
  type GeometryCapability,
  SCHEMA_VERSION,
  sha256Hex,
  validateArtifactRevision,
  type ArtifactDefinition,
  type ArtifactProperties,
} from '@ai-designer/garment-model';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { assertUpdated, assertVersion } from '../../platform/concurrency/assert-version.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AssetsService } from '../assets/assets.service.js';
import { AssetReferenceRegistry } from '../assets/reference-registry.js';
import { DesignReferencesService } from '../designs/references.service.js';

import { visibleArtifacts, writableArtifacts } from './artifact-scope.js';

type ListQuery = z.output<typeof artifactListQuerySchema>;
type Db = Prisma.TransactionClient | PrismaService;
type WithCurrent = Artifact & { currentRevision: ArtifactRevision | null };

/** What the built-in library allows from inside an organization: read, use, copy (FR-SEC-116). */
export const PLATFORM_ARTIFACT_PERMISSIONS: readonly PermissionKey[] = [
  'artifact.view',
  'artifact.use',
  'artifact.create',
];

export interface RevisionContent {
  definition: ArtifactDefinition;
  properties: ArtifactProperties;
  previewAssetId: string | null;
}

/** Stable identity of a revision's content (used to skip no-op revisions). */
export function revisionContentHash(c: RevisionContent): string {
  return sha256Hex(canonicalJson(c as unknown as Record<string, unknown>));
}

const PUBLISH: PermissionKey = 'artifact.publish';
const INACTIVE_VISIBLE: (typeof ArtifactLifecycleStatuses)[number][] = [
  'active',
  'deprecated',
  'deactivated',
];

/**
 * Artifact registry (SS-05, I13). Owns `artifacts` and `artifact_revisions`. Revisions are
 * immutable (DB trigger); designs pin revision ids, so a new revision never changes a design
 * (ART-005). Scopes: platform (read/use only), organization, user-private.
 */
@Injectable()
export class ArtifactsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly assets: AssetsService,
    private readonly assetReferences: AssetReferenceRegistry,
    private readonly references: DesignReferencesService,
  ) {}

  onModuleInit(): void {
    const ownerOf = async (artifactWhere: Prisma.ArtifactWhereInput) =>
      this.prisma.artifact.findFirst({
        where: { ...artifactWhere, lifecycleStatus: { not: 'deleted' } },
        select: { organizationId: true, ownerScope: true, ownerUserId: true },
      });
    const hooks = (lookup: (id: string) => ReturnType<typeof ownerOf>) => ({
      organizationOf: async (id: string) => (await lookup(id))?.organizationId ?? null,
      platformAccess: {
        isPlatform: async (id: string) => (await lookup(id))?.ownerScope === 'platform',
        permissions: PLATFORM_ARTIFACT_PERMISSIONS,
      },
      privateOwnerOf: async (id: string) => {
        const a = await lookup(id);
        return a?.ownerScope === 'user' ? a.ownerUserId : null;
      },
    });
    this.resolvers.register('artifact', { label: 'Artifact', ...hooks((id) => ownerOf({ id })) });
    this.resolvers.register('artifact_revision', {
      label: 'Artifact revision',
      ...hooks((id) => ownerOf({ revisions: { some: { id } } })),
    });
    // Artifact revisions are immutable: their preview files must stay (AST-006).
    this.assetReferences.register('artifact revisions', async (asset) => {
      const rev = await this.prisma.artifactRevision.findFirst({
        where: { organizationId: asset.organizationId, previewAssetId: asset.id },
        select: { displayId: true },
      });
      return rev ? `preview of ${rev.displayId}` : null;
    });
  }

  // ---------------------------------------------------------------- read

  async list(ctx: AuthzContext, query: ListQuery): Promise<Page<ArtifactView>> {
    const and: Prisma.ArtifactWhereInput[] = [visibleArtifacts(ctx)];
    and.push({ lifecycleStatus: query.includeInactive ? { in: INACTIVE_VISIBLE } : 'active' });
    if (query.category) and.push({ category: query.category });
    if (query.scope) and.push({ ownerScope: query.scope });
    if (query.tag) and.push({ tags: { has: query.tag } });
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: contains },
          { description: contains },
          { displayId: contains },
          { tags: { has: query.q.toLowerCase() } },
        ],
      });
    }
    if (query.compatibleWith)
      and.push({
        currentRevision: {
          definition: { path: ['compatibleTargetTypes'], array_contains: [query.compatibleWith] },
        },
      });
    const cursor = query.cursor ? decodeCursor<{ n: string; id: string }>(query.cursor) : null;
    if (cursor)
      and.push({ OR: [{ name: { gt: cursor.n } }, { name: cursor.n, id: { gt: cursor.id } }] });
    const rows = await this.prisma.artifact.findMany({
      where: { AND: and },
      include: { currentRevision: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((a) => this.toView(ctx, a)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ n: last.name, id: last.id }) : null,
    };
  }

  async get(ctx: AuthzContext, artifactId: string): Promise<ArtifactDetail> {
    const a = await this.findVisible(ctx, artifactId);
    const revisions = await this.prisma.artifactRevision.findMany({
      where: { artifactId },
      orderBy: { revisionNumber: 'desc' },
    });
    return { ...this.toView(ctx, a), revisions: revisions.map((r) => this.revisionView(ctx, r)) };
  }

  /** An exact revision — also of deactivated artifacts, so historical designs stay resolvable (ART-010). */
  async getRevision(ctx: AuthzContext, revisionId: string): Promise<ArtifactRevisionView> {
    return this.revisionView(ctx, await this.findVisibleRevision(ctx, revisionId));
  }

  /** Inline SVG preview of a built-in revision (generated by us, served with a sandbox CSP). */
  async previewSvg(ctx: AuthzContext, revisionId: string): Promise<string> {
    const rev = await this.findVisibleRevision(ctx, revisionId);
    const svg = (rev.definition as { previewSvg?: unknown }).previewSvg;
    if (typeof svg !== 'string') throw AppError.notFound('Preview');
    return svg;
  }

  async whereUsed(ctx: AuthzContext, artifactId: string): Promise<WhereUsed> {
    await this.findVisible(ctx, artifactId);
    const ids = await this.revisionIds(artifactId);
    return {
      items: await this.references.revisionsUsing(ctx.organizationId, ids),
      draftCount: await this.references.draftsUsing(ctx.organizationId, ids),
    };
  }

  async compatibility(
    ctx: AuthzContext,
    body: {
      artifactRevisionId: string;
      componentType: string;
      region?: string | null | undefined;
      existingUses?: number | undefined;
    },
  ) {
    const rev = await this.findVisibleRevision(ctx, body.artifactRevisionId);
    const definition = validateArtifactRevision(rev.definition, rev.properties).definition;
    if (!definition)
      throw new AppError('INTERNAL_ERROR', 'Stored artifact definition is not readable');
    return checkCompatibility(definition, rev.geometryCapability as GeometryCapability, {
      componentType: body.componentType,
      region: body.region ?? null,
      existingUses: body.existingUses ?? 0,
    });
  }

  // ---------------------------------------------------------------- write

  async create(
    ctx: AuthzContext,
    body: z.output<typeof createArtifactRequestSchema>,
  ): Promise<ArtifactDetail> {
    this.assertMayPublishTo(ctx, body.scope);
    const content = await this.validateContent(
      ctx,
      body.definition,
      body.properties,
      body.previewAssetId ?? null,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const artifact = await this.insertArtifact(tx, ctx, {
        category: body.category,
        artifactType: body.artifactType ?? body.category,
        name: body.name,
        description: body.description ?? null,
        tags: body.tags ?? [],
        scope: body.scope,
        derivedFromArtifactRevisionId: null,
      });
      await this.insertRevision(tx, artifact, content, body.changeNote ?? 'Created', ctx.userId);
      return artifact;
    });
    return this.get(ctx, created.id);
  }

  async revise(
    ctx: AuthzContext,
    artifactId: string,
    body: z.output<typeof createArtifactRevisionRequestSchema>,
  ): Promise<ArtifactDetail> {
    const current = await this.findWritable(ctx, artifactId);
    if (current.lifecycleStatus !== 'active')
      throw new AppError('INVALID_STATE_TRANSITION', 'Reactivate the artifact before changing it', {
        lifecycleStatus: current.lifecycleStatus,
      });
    if (current.currentRevisionId !== body.expectedCurrentRevisionId)
      throw new AppError('CONCURRENT_MODIFICATION', 'A newer revision exists; reload and retry', {
        currentRevisionId: current.currentRevisionId,
      });
    const prev = current.currentRevision;
    const content = await this.validateContent(
      ctx,
      body.definition,
      body.properties ?? (prev?.properties as Record<string, unknown> | undefined),
      body.previewAssetId === undefined ? (prev?.previewAssetId ?? null) : body.previewAssetId,
    );
    if (prev && prev.contentHash === revisionContentHash(content))
      throw new AppError('NO_CHANGES', 'This revision would be identical to the current one');
    await this.prisma.$transaction(async (tx) => {
      await this.insertRevision(tx, current, content, body.changeNote ?? null, ctx.userId);
    });
    return this.get(ctx, artifactId);
  }

  async update(
    ctx: AuthzContext,
    artifactId: string,
    body: z.output<typeof updateArtifactRequestSchema>,
  ): Promise<ArtifactDetail> {
    const current = await this.findWritable(ctx, artifactId);
    assertVersion(body.expectedVersion, current.version, { artifactId });
    const data: Prisma.ArtifactUpdateManyMutationInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.tags !== undefined) data.tags = body.tags;
    if (Object.keys(data).length) {
      const { count } = await this.prisma.artifact.updateMany({
        where: { id: artifactId, version: current.version },
        data: { ...data, version: { increment: 1 } },
      });
      assertUpdated(count, { artifactId, expectedVersion: body.expectedVersion });
    }
    return this.get(ctx, artifactId);
  }

  async setActive(ctx: AuthzContext, artifactId: string, active: boolean): Promise<ArtifactDetail> {
    const current = await this.findWritable(ctx, artifactId);
    const target = active ? 'active' : 'deactivated';
    if (current.lifecycleStatus === target) return this.get(ctx, artifactId);
    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.update({
        where: { id: artifactId },
        data: { lifecycleStatus: target, version: { increment: 1 } },
      });
      const event = active ? ArtifactReactivatedEvent : ArtifactDeactivatedEvent;
      await this.audit.record(
        {
          eventType: event.type,
          action: 'artifact.edit',
          outcome: 'success',
          resourceType: 'artifact',
          resourceId: artifactId,
          metadata: { from: current.lifecycleStatus, to: target },
        },
        tx,
      );
      await this.outbox.append(tx, event, { organizationId: ctx.organizationId, artifactId });
    });
    return this.get(ctx, artifactId);
  }

  /** User-private → organization library (FR-SEC-118). */
  async publish(ctx: AuthzContext, artifactId: string): Promise<ArtifactDetail> {
    const current = await this.findWritable(ctx, artifactId);
    if (current.ownerScope !== 'user')
      throw new AppError('INVALID_STATE_TRANSITION', 'Only private artifacts can be published', {
        ownerScope: current.ownerScope,
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.update({
        where: { id: artifactId },
        data: {
          ownerScope: 'organization',
          ownerUserId: null,
          publishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          eventType: ArtifactPublishedEvent.type,
          action: PUBLISH,
          outcome: 'success',
          resourceType: 'artifact',
          resourceId: artifactId,
          metadata: { displayId: current.displayId },
        },
        tx,
      );
      await this.outbox.append(tx, ArtifactPublishedEvent, {
        organizationId: ctx.organizationId,
        artifactId,
      });
    });
    return this.get(ctx, artifactId);
  }

  /** Copy the current revision into the caller's library (e.g. customize a built-in), ART-009. */
  async duplicate(
    ctx: AuthzContext,
    artifactId: string,
    body: { scope: 'organization' | 'user'; name?: string | undefined },
  ): Promise<ArtifactDetail> {
    this.assertMayPublishTo(ctx, body.scope);
    const source = await this.findVisible(ctx, artifactId);
    const rev = source.currentRevision;
    if (!rev) throw new AppError('CONFLICT', 'The artifact has no revision to copy');
    const content = await this.validateContent(
      ctx,
      rev.definition,
      rev.properties as Record<string, unknown>,
      // A built-in has no organization files; an organization preview can be shared within it.
      rev.organizationId === ctx.organizationId ? rev.previewAssetId : null,
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const artifact = await this.insertArtifact(tx, ctx, {
        category: source.category as ArtifactCategory,
        artifactType: source.artifactType,
        name: (body.name ?? `${source.name} (copy)`).slice(0, 120),
        description: source.description,
        tags: source.tags,
        scope: body.scope,
        derivedFromArtifactRevisionId: rev.id,
      });
      await this.insertRevision(tx, artifact, content, `Copied from ${rev.displayId}`, ctx.userId);
      return artifact;
    });
    return this.get(ctx, created.id);
  }

  /**
   * Logical deletion, only while nothing in this organization references any revision
   * (ART-011). Shared (organization) artifacts also need `artifact.delete`.
   */
  async remove(ctx: AuthzContext, artifactId: string): Promise<void> {
    const current = await this.findWritable(ctx, artifactId);
    if (current.ownerScope === 'organization' && !ctx.permissions.has('artifact.delete'))
      throw new AppError('PERMISSION_DENIED', 'You cannot delete shared library artifacts', {
        permission: 'artifact.delete',
      });
    const ids = await this.revisionIds(artifactId);
    const used = await this.references.revisionsUsing(ctx.organizationId, ids, 5);
    const drafts = await this.references.draftsUsing(ctx.organizationId, ids);
    if (used.length || drafts)
      throw new AppError('CONFLICT', 'This artifact is used by designs; deactivate it instead', {
        reason: 'has_references',
        revisions: used.map((u) => u.revisionDisplayId),
        draftCount: drafts,
      });
    await this.prisma.$transaction(async (tx) => {
      await tx.artifact.update({
        where: { id: artifactId },
        data: { lifecycleStatus: 'deleted', deletedAt: new Date(), version: { increment: 1 } },
      });
      await this.audit.record(
        {
          eventType: ArtifactDeletedEvent.type,
          action: 'artifact.delete',
          outcome: 'success',
          resourceType: 'artifact',
          resourceId: artifactId,
          metadata: { displayId: current.displayId },
        },
        tx,
      );
      await this.outbox.append(tx, ArtifactDeletedEvent, {
        organizationId: ctx.organizationId,
        artifactId,
      });
    });
  }

  // ---------------------------------------------------------------- shared with the platform library sync

  /** Inserts the next immutable revision and moves the artifact's current pointer to it. */
  async insertRevision(
    tx: Prisma.TransactionClient,
    artifact: Artifact,
    content: RevisionContent,
    changeNote: string | null,
    createdBy: string | null,
  ): Promise<ArtifactRevision> {
    const number = artifact.revisionCounter + 1;
    const rev = await tx.artifactRevision.create({
      data: {
        id: newId(),
        artifactId: artifact.id,
        organizationId: artifact.organizationId,
        displayId: formatRevisionId(artifact.displayId, number),
        revisionNumber: number,
        parentRevisionId: artifact.currentRevisionId,
        definition: content.definition as unknown as Prisma.InputJsonValue,
        properties: content.properties as unknown as Prisma.InputJsonValue,
        previewAssetId: content.previewAssetId,
        geometryCapability: deriveGeometryCapability(content.definition),
        validationStatus: deriveValidationStatus(
          content.definition,
          content.properties,
          content.previewAssetId !== null,
        ),
        schemaVersion: SCHEMA_VERSION,
        contentHash: revisionContentHash(content),
        changeNote,
        createdBy,
      },
    });
    const { count } = await tx.artifact.updateMany({
      where: { id: artifact.id, revisionCounter: artifact.revisionCounter },
      data: { currentRevisionId: rev.id, revisionCounter: number },
    });
    if (count !== 1)
      throw new AppError('CONCURRENT_MODIFICATION', 'Another revision was saved at the same time', {
        artifactId: artifact.id,
      });
    if (artifact.organizationId) {
      await this.outbox.append(tx, ArtifactRevisionCreatedEvent, {
        organizationId: artifact.organizationId,
        artifactId: artifact.id,
        artifactRevisionId: rev.id,
        revisionNumber: number,
      });
      await this.audit.record(
        {
          eventType: ArtifactRevisionCreatedEvent.type,
          action: 'artifact.edit',
          outcome: 'success',
          resourceType: 'artifact',
          resourceId: artifact.id,
          metadata: { revisionId: rev.id, displayId: rev.displayId },
        },
        tx,
      );
    }
    return rev;
  }

  // ---------------------------------------------------------------- helpers

  private async insertArtifact(
    tx: Prisma.TransactionClient,
    ctx: AuthzContext,
    input: {
      category: ArtifactCategory;
      artifactType: string;
      name: string;
      description: string | null;
      tags: string[];
      scope: 'organization' | 'user';
      derivedFromArtifactRevisionId: string | null;
    },
  ): Promise<Artifact> {
    const artifact = await tx.artifact.create({
      data: {
        id: newId(),
        organizationId: ctx.organizationId,
        ownerScope: input.scope,
        ownerUserId: input.scope === 'user' ? ctx.userId : null,
        displayId: await nextDisplayId(tx, ctx.organizationId, ArtifactCategories[input.category]),
        category: input.category,
        artifactType: input.artifactType,
        name: input.name,
        description: input.description,
        tags: input.tags,
        derivedFromArtifactRevisionId: input.derivedFromArtifactRevisionId,
        publishedAt: input.scope === 'organization' ? new Date() : null,
        createdBy: ctx.userId,
      },
    });
    await this.audit.record(
      {
        eventType: ArtifactCreatedEvent.type,
        action: 'artifact.create',
        outcome: 'success',
        resourceType: 'artifact',
        resourceId: artifact.id,
        metadata: {
          displayId: artifact.displayId,
          scope: input.scope,
          ...(input.derivedFromArtifactRevisionId
            ? { derivedFromArtifactRevisionId: input.derivedFromArtifactRevisionId }
            : {}),
        },
      },
      tx,
    );
    await this.outbox.append(tx, ArtifactCreatedEvent, {
      organizationId: ctx.organizationId,
      artifactId: artifact.id,
      scope: input.scope,
      ...(input.derivedFromArtifactRevisionId
        ? { derivedFromArtifactRevisionId: input.derivedFromArtifactRevisionId }
        : {}),
    });
    return artifact;
  }

  private async validateContent(
    ctx: AuthzContext,
    definition: unknown,
    properties: unknown,
    previewAssetId: string | null,
  ): Promise<RevisionContent> {
    const result = validateArtifactRevision(definition, properties ?? {});
    if (!result.ok || !result.definition || !result.properties)
      throw new AppError('VALIDATION_BLOCKED', 'The artifact definition has problems', {
        findings: result.findings.slice(0, 50),
      });
    if (previewAssetId) {
      const asset = await this.assets.get(ctx, previewAssetId);
      if (asset.status !== 'ready' || !asset.mediaType?.startsWith('image/'))
        throw new AppError(
          'VALIDATION_FAILED',
          'The preview must be an uploaded image that finished checking',
          {
            issues: [
              { path: 'previewAssetId', message: 'Not a ready image', code: 'preview_not_ready' },
            ],
          },
        );
    }
    return { definition: result.definition, properties: result.properties, previewAssetId };
  }

  private assertMayPublishTo(ctx: AuthzContext, scope: 'organization' | 'user'): void {
    if (scope === 'organization' && !ctx.permissions.has(PUBLISH))
      throw new AppError(
        'PERMISSION_DENIED',
        'Adding to the shared library needs permission to publish artifacts',
        { permission: PUBLISH },
      );
  }

  private async findVisible(
    ctx: AuthzContext,
    artifactId: string,
    db: Db = this.prisma,
  ): Promise<WithCurrent> {
    const a = await db.artifact.findFirst({
      where: { AND: [{ id: artifactId }, visibleArtifacts(ctx)] },
      include: { currentRevision: true },
    });
    if (!a) throw AppError.notFound('Artifact');
    return a;
  }

  private async findWritable(ctx: AuthzContext, artifactId: string): Promise<WithCurrent> {
    const a = await this.prisma.artifact.findFirst({
      where: { AND: [{ id: artifactId }, writableArtifacts(ctx)] },
      include: { currentRevision: true },
    });
    if (!a) throw AppError.notFound('Artifact');
    return a;
  }

  private async findVisibleRevision(
    ctx: AuthzContext,
    revisionId: string,
  ): Promise<ArtifactRevision> {
    const rev = await this.prisma.artifactRevision.findFirst({
      where: { id: revisionId, artifact: visibleArtifacts(ctx) },
    });
    if (!rev) throw AppError.notFound('Artifact revision');
    return rev;
  }

  private async revisionIds(artifactId: string): Promise<string[]> {
    return (
      await this.prisma.artifactRevision.findMany({ where: { artifactId }, select: { id: true } })
    ).map((r) => r.id);
  }

  private previewUrl(ctx: AuthzContext, rev: ArtifactRevision | null): string | null {
    if (!rev) return null;
    const org = `/v1/orgs/${ctx.organizationId}`;
    if (rev.previewAssetId) return `${org}/assets/${rev.previewAssetId}/content?variant=thumb_256`;
    return typeof (rev.definition as { previewSvg?: unknown }).previewSvg === 'string'
      ? `${org}/artifact-revisions/${rev.id}/preview`
      : null;
  }

  revisionView(ctx: AuthzContext, r: ArtifactRevision): ArtifactRevisionView {
    const props = r.properties as {
      visual?: Record<string, unknown>;
      physical?: Record<string, unknown>;
    };
    return {
      id: r.id,
      artifactId: r.artifactId,
      displayId: r.displayId,
      revisionNumber: r.revisionNumber,
      parentRevisionId: r.parentRevisionId,
      definition: r.definition as Record<string, unknown>,
      properties: { visual: props.visual ?? {}, physical: props.physical ?? {} },
      previewAssetId: r.previewAssetId,
      previewUrl: this.previewUrl(ctx, r),
      geometryCapability: r.geometryCapability as GeometryCapability,
      validationStatus: r.validationStatus as ArtifactRevisionView['validationStatus'],
      schemaVersion: r.schemaVersion,
      contentHash: r.contentHash,
      changeNote: r.changeNote,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    };
  }

  toView(ctx: AuthzContext, a: WithCurrent): ArtifactView {
    const rev = a.currentRevision;
    const def = rev?.definition as { compatibleTargetTypes?: string[] } | undefined;
    return {
      id: a.id,
      displayId: a.displayId,
      category: a.category as ArtifactView['category'],
      artifactType: a.artifactType,
      name: a.name,
      description: a.description,
      tags: a.tags,
      ownerScope: a.ownerScope as ArtifactView['ownerScope'],
      ownerUserId: a.ownerUserId,
      lifecycleStatus: a.lifecycleStatus as ArtifactView['lifecycleStatus'],
      currentRevisionId: a.currentRevisionId,
      currentRevisionNumber: a.revisionCounter,
      geometryCapability: (rev?.geometryCapability as GeometryCapability | undefined) ?? null,
      validationStatus:
        (rev?.validationStatus as ArtifactView['validationStatus'] | undefined) ?? null,
      compatibleTargetTypes: def?.compatibleTargetTypes ?? [],
      previewUrl: this.previewUrl(ctx, rev),
      derivedFromArtifactRevisionId: a.derivedFromArtifactRevisionId,
      version: a.version,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      publishedAt: a.publishedAt?.toISOString() ?? null,
    };
  }
}
