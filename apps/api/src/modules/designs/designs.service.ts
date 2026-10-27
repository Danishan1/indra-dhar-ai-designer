import {
  decodeCursor,
  type Design as DesignView,
  DesignCreatedEvent,
  type DesignStatus,
  type DesignTemplate,
  DisplayIdPrefixes,
  type EditorState,
  isEditable,
  type ProjectStatus,
  encodeCursor,
  type Page,
  RevisionCommittedEvent,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, type Design } from '@ai-designer/db';
import {
  cloneWithNewIds,
  SCHEMA_VERSION,
  templates,
  type GarmentDesignState,
} from '@ai-designer/garment-model';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { PolicyEnforcer } from '../../platform/authz/policy-enforcer.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { ProjectLifecycleRegistry, type ProjectRef } from '../projects/dependents-registry.js';
import { ProjectsService } from '../projects/projects.service.js';

import { RevisionService } from './revision.service.js';
import { WorkingCopyService } from './working-copy.service.js';

const TEMPLATE_LABELS: Record<string, string> = {
  woven_shirt: 'Woven shirt',
  knit_tshirt: 'Knit T-shirt',
};

/** A design with no components yet; the category is chosen later. */
export function blankState(): GarmentDesignState {
  return {
    schemaVersion: SCHEMA_VERSION,
    garmentType: 'unspecified',
    garmentCategory: null,
    components: [],
    relationships: [],
    constraints: [],
    annotationsRef: null,
    metadata: {},
    provenance: { createdFrom: 'user', templateKey: null, sourceRevisionId: null },
  };
}

type DesignWithWc = Design & {
  workingCopy: { version: number; hasUncommittedChanges: boolean } | null;
};
const WITH_WC = {
  workingCopy: { select: { version: true, hasUncommittedChanges: true } },
} as const;

/**
 * Designs inside projects (SS-03 persistence, I12). Owns the `designs`, `working_copies` and
 * `design_revisions` tables (through WorkingCopyService and RevisionService). Registers the
 * `design` and `revision` resource types; both are governed by their project, so restricted
 * projects restrict their designs too (ADR-047).
 */
@Injectable()
export class DesignsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly enforcer: PolicyEnforcer,
    private readonly projects: ProjectsService,
    private readonly lifecycle: ProjectLifecycleRegistry,
    private readonly revisions: RevisionService,
    private readonly workingCopies: WorkingCopyService,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('design', {
      label: 'Design',
      organizationOf: async (id) =>
        (
          await this.prisma.design.findFirst({
            where: { id, deletedAt: null },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      governedBy: async (id) => {
        const d = await this.prisma.design.findFirst({
          where: { id },
          select: { projectId: true },
        });
        return d ? { type: 'project', id: d.projectId } : null;
      },
    });
    this.resolvers.register('revision', {
      label: 'Revision',
      organizationOf: async (id) =>
        (
          await this.prisma.designRevision.findFirst({
            where: { id, design: { deletedAt: null } },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      governedBy: async (id) => {
        const r = await this.prisma.designRevision.findFirst({
          where: { id },
          select: { design: { select: { projectId: true } } },
        });
        return r ? { type: 'project', id: r.design.projectId } : null;
      },
    });
    this.lifecycle.registerDependents('designs', {
      label: 'Designs',
      count: (project) =>
        this.prisma.design.count({
          where: { organizationId: project.organizationId, projectId: project.id, deletedAt: null },
        }),
    });
    this.lifecycle.registerDuplicator('designs', (ctx, source, target) =>
      this.copyProjectDesigns(ctx, source, target),
    );
  }

  // ---------------------------------------------------------------- create / read

  /** CreateDesign: template or blank → design + first revision R001 + working copy (one transaction). */
  async create(
    ctx: AuthzContext,
    projectId: string,
    body: { name: string; template: DesignTemplate },
  ): Promise<DesignView> {
    await this.projects.requireWorkable(ctx.organizationId, projectId);
    const state = body.template === 'blank' ? blankState() : templates.create(body.template);
    const summary =
      body.template === 'blank'
        ? 'Created as a blank design'
        : `Created from the ${TEMPLATE_LABELS[body.template] ?? body.template} template`;
    const design = await this.createWithState(ctx, {
      projectId,
      name: body.name,
      state,
      summary,
      template: body.template,
      duplicatedFromDesignId: null,
    });
    return this.get(ctx, design.id);
  }

  async list(
    ctx: AuthzContext,
    projectId: string,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<Page<DesignView>> {
    await this.projects.get(ctx, projectId);
    const cursor = query.cursor ? decodeCursor<{ u: string; id: string }>(query.cursor) : null;
    const rows = await this.prisma.design.findMany({
      where: {
        organizationId: ctx.organizationId,
        projectId,
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { updatedAt: { lt: new Date(cursor.u) } },
                { updatedAt: new Date(cursor.u), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: WITH_WC,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toView),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ u: last.updatedAt.toISOString(), id: last.id })
          : null,
    };
  }

  async get(ctx: AuthzContext, designId: string): Promise<DesignView> {
    const row = await this.prisma.design.findFirst({
      where: { id: designId, organizationId: ctx.organizationId, deletedAt: null },
      include: WITH_WC,
    });
    if (!row) throw AppError.notFound('Design');
    return toView(row);
  }

  // ---------------------------------------------------------------- editor

  /**
   * What the editor needs to open a design (I15): design, project, working copy, revision pointers
   * and capability flags (computed with the same PDP that guards each action).
   */
  async editorState(req: Request, ctx: AuthzContext, designId: string): Promise<EditorState> {
    const design = await this.get(ctx, designId);
    const [project, workingCopy] = await Promise.all([
      this.projects.get(ctx, design.projectId),
      this.workingCopies.get(ctx, designId),
    ]);
    const revisionIds = [design.headRevisionId, design.approvedRevisionId].filter(
      (x): x is string => !!x,
    );
    const resource = { type: 'design', id: designId };
    const can = (
      permission: 'design.edit' | 'design.commit' | 'design.restore' | 'design.generate',
    ) => this.enforcer.can(req, { organizationId: ctx.organizationId, permission, resource });
    const [summaries, edit, commit, restore, generate] = await Promise.all([
      this.revisions.summariesByIds(ctx.organizationId, designId, revisionIds),
      can('design.edit'),
      can('design.commit'),
      can('design.restore'),
      can('design.generate'),
    ]);
    const editable = isEditable(project.status as ProjectStatus);
    return {
      design,
      project: {
        id: project.id,
        displayId: project.displayId,
        name: project.name,
        status: project.status,
        editable,
      },
      workingCopy,
      headRevision: (design.headRevisionId && summaries.get(design.headRevisionId)) || null,
      approvedRevision:
        (design.approvedRevisionId && summaries.get(design.approvedRevisionId)) || null,
      capabilities: {
        canEdit: editable && edit,
        canCommit: editable && commit,
        canRestore: editable && restore,
        canGenerate: editable && generate,
      },
      readOnlyReason: !edit ? 'permission' : !editable ? 'project_status' : null,
      userId: ctx.userId,
    };
  }

  // ---------------------------------------------------------------- duplicate

  /**
   * Copies the latest revision into a new design (same or another project of the organization):
   * new ids, provenance `duplicate`, status DRAFT, **no approval** (FR-PRJ-007). Uncommitted
   * working-copy changes are not copied.
   */
  async duplicate(
    req: Request,
    ctx: AuthzContext,
    designId: string,
    body: { targetProjectId?: string | undefined; name?: string | undefined },
  ): Promise<DesignView> {
    const source = await this.prisma.design.findFirst({
      where: { id: designId, organizationId: ctx.organizationId, deletedAt: null },
    });
    if (!source) throw AppError.notFound('Design');
    const targetProjectId = body.targetProjectId ?? source.projectId;
    if (targetProjectId !== source.projectId) {
      // The second resource named in the body gets the same checks as a route resource.
      await this.enforcer.enforce(req, {
        organizationId: ctx.organizationId,
        permission: 'design.create',
        resource: { type: 'project', id: targetProjectId },
        notFoundLabel: 'Project',
      });
    }
    await this.projects.requireWorkable(ctx.organizationId, targetProjectId);
    const copy = await this.copyDesign(
      ctx,
      source,
      targetProjectId,
      body.name ?? `Copy of ${source.name}`,
    );
    return this.get(ctx, copy.id);
  }

  private async copyDesign(
    ctx: AuthzContext,
    source: Design,
    targetProjectId: string,
    name: string,
  ): Promise<Design> {
    if (!source.headRevisionId)
      throw new AppError('CONFLICT', 'The design has no revision to copy');
    const head = await this.revisions.loadVerified(
      this.prisma,
      ctx.organizationId,
      source.headRevisionId,
      source.id,
    );
    const { state } = cloneWithNewIds(head.state, { sourceRevisionId: head.row.id });
    return this.createWithState(ctx, {
      projectId: targetProjectId,
      name: name.slice(0, 120),
      state,
      summary: `Duplicated from ${head.row.displayId}`,
      template: 'duplicate',
      duplicatedFromDesignId: source.id,
    });
  }

  /** Project duplication hook: every design's latest revision, same names. */
  private async copyProjectDesigns(ctx: AuthzContext, source: ProjectRef, target: ProjectRef) {
    const designs = await this.prisma.design.findMany({
      where: { organizationId: source.organizationId, projectId: source.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    for (const d of designs) await this.copyDesign(ctx, d, target.id, d.name);
  }

  // ---------------------------------------------------------------- internals

  private async createWithState(
    ctx: AuthzContext,
    input: {
      projectId: string;
      name: string;
      state: GarmentDesignState;
      summary: string;
      template: string;
      duplicatedFromDesignId: string | null;
    },
  ): Promise<Design> {
    const { state, findings } = this.workingCopies.validate(input.state);
    return this.prisma.$transaction(async (tx) => {
      await this.projects.requireWorkable(ctx.organizationId, input.projectId, tx);
      const design = await tx.design.create({
        data: {
          id: newId(),
          organizationId: ctx.organizationId,
          projectId: input.projectId,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.design),
          name: input.name,
          garmentType: state.garmentType,
          garmentCategory: state.garmentCategory,
          duplicatedFromDesignId: input.duplicatedFromDesignId,
          createdBy: ctx.userId,
        },
      });
      const revision = await this.revisions.insert(tx, {
        design,
        state,
        parent: null,
        restoredFromRevisionId: null,
        summaryText: input.summary,
        findings,
        createdBy: ctx.userId,
      });
      await this.workingCopies.create(tx, {
        design,
        state,
        baseRevisionId: revision.id,
        userId: ctx.userId,
      });
      await this.projects.setDefaultDesignIfUnset(
        tx,
        ctx.organizationId,
        input.projectId,
        design.id,
      );
      await this.audit.record(
        {
          eventType: DesignCreatedEvent.type,
          action: 'design.create',
          outcome: 'success',
          resourceType: 'design',
          resourceId: design.id,
          metadata: {
            displayId: design.displayId,
            projectId: input.projectId,
            template: input.template,
            revisionId: revision.id,
            ...(input.duplicatedFromDesignId
              ? { duplicatedFromDesignId: input.duplicatedFromDesignId }
              : {}),
          },
        },
        tx,
      );
      await this.outbox.append(tx, DesignCreatedEvent, {
        organizationId: ctx.organizationId,
        projectId: input.projectId,
        designId: design.id,
        template: input.template,
        ...(input.duplicatedFromDesignId
          ? { duplicatedFromDesignId: input.duplicatedFromDesignId }
          : {}),
      });
      await this.outbox.append(tx, RevisionCommittedEvent, {
        organizationId: ctx.organizationId,
        projectId: input.projectId,
        designId: design.id,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        contentHash: revision.contentHash,
        parentRevisionIds: [],
      });
      return tx.design.findUniqueOrThrow({ where: { id: design.id } });
    });
  }
}

function toView(d: DesignWithWc): DesignView {
  return {
    id: d.id,
    displayId: d.displayId,
    projectId: d.projectId,
    name: d.name,
    garmentType: d.garmentType,
    garmentCategory: d.garmentCategory,
    status: d.status as DesignStatus,
    headRevisionId: d.headRevisionId,
    headRevisionNumber: d.revisionCounter,
    approvedRevisionId: d.approvedRevisionId,
    workingCopyVersion: d.workingCopy?.version ?? 0,
    hasUncommittedChanges: d.workingCopy?.hasUncommittedChanges ?? false,
    duplicatedFromDesignId: d.duplicatedFromDesignId,
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}
