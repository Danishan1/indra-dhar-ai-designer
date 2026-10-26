import {
  allowedActions,
  canTransition,
  createProjectRequestSchema,
  decodeCursor,
  DisplayIdPrefixes,
  encodeCursor,
  isEditable,
  type LifecycleAction,
  LIFECYCLE_TRANSITIONS,
  type Page,
  type PermissionKey,
  type Project as ProjectView,
  type ProjectGrant,
  ProjectArchivedEvent,
  ProjectCompletedEvent,
  ProjectCreatedEvent,
  ProjectDeletedEvent,
  ProjectMetadataUpdatedEvent,
  ProjectPlacedOnHoldEvent,
  ProjectReopenedEvent,
  ProjectRestoredEvent,
  ProjectResumedEvent,
  type ProjectStatus,
  ProjectVisibilityChangedEvent,
  type ProjectVisibility,
  projectListQuerySchema,
  updateProjectRequestSchema,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, type Prisma, type Project } from '@ai-designer/db';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { z } from 'zod';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { MembershipDirectoryRegistry } from '../../platform/authz/membership-directory.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { assertUpdated, assertVersion } from '../../platform/concurrency/assert-version.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { ResourceGrantService } from '../authorization/grants.service.js';
import { AccountService } from '../identity/account.service.js';

import { ProjectLifecycleRegistry } from './dependents-registry.js';

type ListQuery = z.output<typeof projectListQuerySchema>;

const EVENTS = {
  hold: ProjectPlacedOnHoldEvent,
  resume: ProjectResumedEvent,
  complete: ProjectCompletedEvent,
  reopen: ProjectReopenedEvent,
  archive: ProjectArchivedEvent,
  restore: ProjectRestoredEvent,
  delete: ProjectDeletedEvent,
} as const;

const ACTIVE_WORK: ProjectStatus[] = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];
const METADATA_FIELDS = [
  'name',
  'description',
  'productCategory',
  'season',
  'brand',
  'targetMarket',
  'styleNumber',
] as const;

const MANAGE_ACCESS: PermissionKey = 'project.manage_access';

/**
 * Project lifecycle core (SS-02, I10). Owns the `projects` table. Every change keeps state, audit
 * record and domain event in one transaction; transitions follow the shared table in
 * `@ai-designer/contracts` (SPEC-006 §7.5). Deleted projects are logically deleted and vanish from
 * every normal view (physical erasure is I47); archived projects stay readable.
 */
@Injectable()
export class ProjectsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly resolvers: ResourceResolverRegistry,
    private readonly grants: ResourceGrantService,
    private readonly directory: MembershipDirectoryRegistry,
    private readonly accounts: AccountService,
    private readonly lifecycle: ProjectLifecycleRegistry,
  ) {}

  onModuleInit(): void {
    this.resolvers.register('project', {
      label: 'Project',
      organizationOf: async (id) =>
        (
          await this.prisma.project.findFirst({
            where: { id, status: { not: 'DELETED' } },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
      isRestricted: async (id) =>
        (
          await this.prisma.project.findFirst({
            where: { id },
            select: { visibility: true },
          })
        )?.visibility === 'restricted',
    });
  }

  // ---------------------------------------------------------------- create / read

  async create(
    ctx: AuthzContext,
    body: z.output<typeof createProjectRequestSchema>,
    duplicatedFromId?: string,
  ): Promise<ProjectView> {
    this.assertMayRestrict(ctx, body.visibility);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          id: newId(),
          organizationId: ctx.organizationId,
          displayId: await nextDisplayId(tx, ctx.organizationId, DisplayIdPrefixes.project),
          name: body.name,
          description: body.description ?? null,
          visibility: body.visibility,
          productCategory: body.productCategory ?? null,
          season: body.season ?? null,
          brand: body.brand ?? null,
          targetMarket: body.targetMarket ?? null,
          styleNumber: body.styleNumber ?? null,
          tags: body.tags ?? [],
          duplicatedFromId: duplicatedFromId ?? null,
          createdBy: ctx.userId,
        },
      });
      await this.audit.record(
        {
          eventType: 'projects.project_created',
          action: 'project.create',
          outcome: 'success',
          resourceType: 'project',
          resourceId: created.id,
          metadata: {
            displayId: created.displayId,
            visibility: created.visibility,
            ...(duplicatedFromId ? { duplicatedFromId } : {}),
          },
        },
        tx,
      );
      await this.outbox.append(tx, ProjectCreatedEvent, {
        organizationId: ctx.organizationId,
        projectId: created.id,
        ...(duplicatedFromId ? { duplicatedFromId } : {}),
      });
      return created;
    });
    return toView(row);
  }

  async get(ctx: AuthzContext, projectId: string): Promise<ProjectView> {
    return toView(await this.findInTenant(ctx.organizationId, projectId));
  }

  async list(ctx: AuthzContext, query: ListQuery): Promise<Page<ProjectView>> {
    const and: Prisma.ProjectWhereInput[] = [];
    // Restricted projects are listed only for people who manage access or hold a grant.
    if (!ctx.permissions.has(MANAGE_ACCESS)) {
      const granted = await this.grants.resourceIdsGrantedTo(
        ctx.organizationId,
        ctx.userId,
        'project',
        'project.view',
      );
      and.push({ OR: [{ visibility: 'organization' }, { id: { in: granted } }] });
    }
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: contains },
          { styleNumber: contains },
          { brand: contains },
          { productCategory: contains },
          { season: contains },
          { displayId: contains },
          { tags: { has: query.q } },
        ],
      });
    }
    const cursor = query.cursor ? decodeCursor<{ v: string; id: string }>(query.cursor) : null;
    if (cursor) and.push(cursorWhere(query.sort, cursor));
    const rows = await this.prisma.project.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: query.status ?? { in: ACTIVE_WORK },
        ...(query.category
          ? { productCategory: { equals: query.category, mode: 'insensitive' } }
          : {}),
        ...(query.season ? { season: { equals: query.season, mode: 'insensitive' } } : {}),
        ...(query.brand ? { brand: { equals: query.brand, mode: 'insensitive' } } : {}),
        AND: and,
      },
      orderBy: orderBy(query.sort),
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toView),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ v: sortValue(query.sort, last), id: last.id })
          : null,
    };
  }

  // ---------------------------------------------------------------- metadata

  async update(
    ctx: AuthzContext,
    projectId: string,
    body: z.output<typeof updateProjectRequestSchema>,
  ): Promise<ProjectView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.findInTenant(ctx.organizationId, projectId, tx);
      if (!isEditable(current.status as ProjectStatus))
        throw new AppError(
          'INVALID_STATE_TRANSITION',
          'Only active or on-hold projects can be edited. Restore or reopen it first.',
          { status: current.status },
        );
      assertVersion(body.expectedVersion, current.version, { projectId });

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const data: Prisma.ProjectUpdateInput = {};
      for (const field of METADATA_FIELDS) {
        const next = body[field];
        if (next === undefined) continue;
        const before = current[field];
        if (next !== before) {
          changes[field] = { from: before, to: next };
          (data as Record<string, unknown>)[field] = next;
        }
      }
      if (body.tags !== undefined && !sameTags(body.tags, current.tags)) {
        changes.tags = { from: current.tags, to: body.tags };
        data.tags = body.tags;
      }
      const changedFields = Object.keys(changes);
      if (changedFields.length === 0) return current;

      const { count } = await tx.project.updateMany({
        where: { id: projectId, organizationId: ctx.organizationId, version: current.version },
        data: { ...data, version: { increment: 1 } },
      });
      assertUpdated(count, { projectId, expectedVersion: body.expectedVersion });
      await this.audit.record(
        {
          eventType: 'projects.project_metadata_updated',
          action: 'project.edit',
          outcome: 'success',
          resourceType: 'project',
          resourceId: projectId,
          metadata: { changes },
        },
        tx,
      );
      await this.outbox.append(tx, ProjectMetadataUpdatedEvent, {
        organizationId: ctx.organizationId,
        projectId,
        changedFields,
      });
      return this.findInTenant(ctx.organizationId, projectId, tx);
    });
    return toView(row);
  }

  async setVisibility(
    ctx: AuthzContext,
    projectId: string,
    expectedVersion: number,
    visibility: ProjectVisibility,
  ): Promise<ProjectView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.findInTenant(ctx.organizationId, projectId, tx);
      assertVersion(expectedVersion, current.version, { projectId });
      if (current.visibility === visibility) return current;
      const { count } = await tx.project.updateMany({
        where: { id: projectId, organizationId: ctx.organizationId, version: current.version },
        data: { visibility, version: { increment: 1 } },
      });
      assertUpdated(count, { projectId, expectedVersion });
      await this.audit.record(
        {
          eventType: 'projects.project_visibility_changed',
          action: MANAGE_ACCESS,
          outcome: 'success',
          resourceType: 'project',
          resourceId: projectId,
          metadata: { from: current.visibility, to: visibility },
        },
        tx,
      );
      await this.outbox.append(tx, ProjectVisibilityChangedEvent, {
        organizationId: ctx.organizationId,
        projectId,
        visibility,
      });
      return this.findInTenant(ctx.organizationId, projectId, tx);
    });
    return toView(row);
  }

  // ---------------------------------------------------------------- lifecycle

  /** hold · resume · complete · reopen · archive · restore (deletion has its own method). */
  async transition(
    ctx: AuthzContext,
    projectId: string,
    action: Exclude<LifecycleAction, 'delete'>,
    reason?: string,
  ): Promise<ProjectView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.findInTenant(ctx.organizationId, projectId, tx);
      if (action === 'complete') {
        const blockers = await this.lifecycle.completionBlockers(current);
        if (blockers.length)
          throw new AppError('VALIDATION_BLOCKED', 'This project cannot be completed yet', {
            blockers,
          });
      }
      return this.applyTransition(ctx, tx, current, action, reason);
    });
    return toView(row);
  }

  /** Logical deletion; dependents (designs, reviews…) must be acknowledged (FR-PRJ-089…091). */
  async remove(ctx: AuthzContext, projectId: string, acknowledgeDependents: boolean) {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.findInTenant(ctx.organizationId, projectId, tx);
      const dependents = await this.lifecycle.dependentsOf(current);
      if (dependents.total > 0 && !acknowledgeDependents)
        throw new AppError('CONFLICT', 'This project has dependent items; confirm to delete', {
          reason: 'has_dependents',
          dependents,
        });
      await this.applyTransition(ctx, tx, current, 'delete', undefined, {
        dependents: dependents.items,
      });
    });
  }

  async dependents(ctx: AuthzContext, projectId: string) {
    const project = await this.findInTenant(ctx.organizationId, projectId);
    return this.lifecycle.dependentsOf(project);
  }

  private async applyTransition(
    ctx: AuthzContext,
    tx: Prisma.TransactionClient,
    current: Project,
    action: LifecycleAction,
    reason?: string,
    extraAudit: Record<string, unknown> = {},
  ): Promise<Project> {
    const rule = LIFECYCLE_TRANSITIONS[action];
    const from = current.status as ProjectStatus;
    if (!canTransition(from, action))
      throw new AppError(
        'INVALID_STATE_TRANSITION',
        `A project that is ${from.toLowerCase().replace('_', ' ')} cannot be ${PAST[action]}`,
        { from, action, to: rule.to, allowed: allowedActions(from) },
      );
    const text = reason?.trim() || undefined;
    if (rule.reasonRequired && !text)
      throw new AppError('VALIDATION_FAILED', 'Please give a reason', {
        issues: [{ path: 'reason', message: 'A reason is required', code: 'reason_required' }],
      });
    const now = new Date();
    const { count } = await tx.project.updateMany({
      // The status guard makes concurrent conflicting transitions fail instead of overwriting.
      where: { id: current.id, organizationId: ctx.organizationId, status: from },
      data: {
        status: rule.to,
        statusReason: action === 'resume' || action === 'restore' ? null : (text ?? null),
        completedAt: action === 'complete' ? now : action === 'reopen' ? null : undefined,
        archivedAt: action === 'archive' ? now : action === 'restore' ? null : undefined,
        deletedAt: action === 'delete' ? now : undefined,
        version: { increment: 1 },
      },
    });
    assertUpdated(count, { projectId: current.id });
    const event = EVENTS[action];
    await this.audit.record(
      {
        eventType: event.type,
        action: rule.permission,
        outcome: 'success',
        resourceType: 'project',
        resourceId: current.id,
        metadata: { from, to: rule.to, ...(text ? { reason: text } : {}), ...extraAudit },
      },
      tx,
    );
    await this.outbox.append(tx, event, {
      organizationId: ctx.organizationId,
      projectId: current.id,
      ...(text ? { reason: text } : {}),
    });
    return tx.project.findUniqueOrThrow({ where: { id: current.id } });
  }

  // ---------------------------------------------------------------- duplicate

  /** Metadata-only copy (FR-PRJ-007). Designs are copied from I12; approvals never are. */
  async duplicate(ctx: AuthzContext, projectId: string, name?: string): Promise<ProjectView> {
    const source = await this.findInTenant(ctx.organizationId, projectId);
    if (source.visibility === 'restricted' && !ctx.permissions.has(MANAGE_ACCESS))
      throw new AppError(
        'PERMISSION_DENIED',
        'Only people who manage project access can copy a restricted project',
        { permission: MANAGE_ACCESS },
      );
    return this.create(
      ctx,
      {
        name: (name ?? `Copy of ${source.name}`).slice(0, 120),
        description: source.description,
        productCategory: source.productCategory,
        season: source.season,
        brand: source.brand,
        targetMarket: source.targetMarket,
        // The style number identifies one style — a copy starts without it.
        styleNumber: null,
        tags: source.tags,
        visibility: source.visibility as ProjectVisibility,
      },
      source.id,
    );
  }

  // ---------------------------------------------------------------- grants (restricted projects)

  async listGrants(ctx: AuthzContext, projectId: string): Promise<ProjectGrant[]> {
    await this.findInTenant(ctx.organizationId, projectId);
    const rows = await this.grants.listForResource(ctx.organizationId, {
      type: 'project',
      id: projectId,
    });
    const profiles = await this.accounts.getProfiles(rows.map((r) => r.recipientId));
    return rows.map((g) => ({
      id: g.id,
      userId: g.recipientId,
      displayName: profiles.get(g.recipientId)?.displayName ?? 'Unknown user',
      email: profiles.get(g.recipientId)?.email ?? '',
      actions: g.actions as ProjectGrant['actions'],
      expiresAt: g.expiresAt?.toISOString() ?? null,
      grantedBy: g.grantedBy,
      createdAt: g.createdAt.toISOString(),
    }));
  }

  /** Gives an active member access (replaces their earlier grant on this project). */
  async grantAccess(
    ctx: AuthzContext,
    projectId: string,
    input: { userId: string; actions: ProjectGrant['actions']; expiresAt?: string | null },
  ): Promise<ProjectGrant> {
    await this.findInTenant(ctx.organizationId, projectId);
    const member = await this.directory.get().findAccess(ctx.organizationId, input.userId);
    if (member?.status !== 'active')
      throw new AppError(
        'VALIDATION_FAILED',
        'Only active members of this organization can be given access',
        {
          issues: [{ path: 'userId', message: 'Not an active member', code: 'not_a_member' }],
        },
      );
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now())
      throw new AppError('VALIDATION_FAILED', 'The expiry must be in the future', {
        issues: [{ path: 'expiresAt', message: 'Must be in the future', code: 'in_the_past' }],
      });
    await this.revokeFor(ctx, projectId, input.userId);
    await this.grants.create({
      organizationId: ctx.organizationId,
      resourceType: 'project',
      resourceId: projectId,
      recipientUserId: input.userId,
      actions: [...new Set(input.actions)],
      grantedBy: ctx.userId,
      expiresAt,
    });
    const created = (await this.listGrants(ctx, projectId)).find((g) => g.userId === input.userId);
    if (!created) throw new AppError('INTERNAL_ERROR', 'The access grant was not saved');
    return created;
  }

  async revokeAccess(ctx: AuthzContext, projectId: string, userId: string): Promise<void> {
    await this.findInTenant(ctx.organizationId, projectId);
    if (!(await this.revokeFor(ctx, projectId, userId))) throw AppError.notFound('Access grant');
  }

  private async revokeFor(ctx: AuthzContext, projectId: string, userId: string): Promise<boolean> {
    const active = await this.grants.listForResource(ctx.organizationId, {
      type: 'project',
      id: projectId,
    });
    let revoked = false;
    for (const g of active.filter((x) => x.recipientId === userId))
      revoked = (await this.grants.revoke(ctx.organizationId, g.id, ctx.userId)) || revoked;
    return revoked;
  }

  // ---------------------------------------------------------------- helpers

  private assertMayRestrict(ctx: AuthzContext, visibility: ProjectVisibility): void {
    if (visibility === 'restricted' && !ctx.permissions.has(MANAGE_ACCESS))
      throw new AppError('PERMISSION_DENIED', 'You cannot restrict access to a project', {
        permission: MANAGE_ACCESS,
      });
  }

  private async findInTenant(
    organizationId: string,
    projectId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Project> {
    const project = await (tx ?? this.prisma).project.findFirst({
      where: { id: projectId, organizationId, status: { not: 'DELETED' } },
    });
    if (!project) throw AppError.notFound('Project');
    return project;
  }
}

const PAST: Record<LifecycleAction, string> = {
  hold: 'put on hold',
  resume: 'resumed',
  complete: 'completed',
  reopen: 'reopened',
  archive: 'archived',
  restore: 'restored',
  delete: 'deleted',
};

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

function orderBy(sort: ListQuery['sort']): Prisma.ProjectOrderByWithRelationInput[] {
  if (sort === 'name_asc') return [{ name: 'asc' }, { id: 'asc' }];
  if (sort === 'created_desc') return [{ createdAt: 'desc' }, { id: 'desc' }];
  return [{ updatedAt: 'desc' }, { id: 'desc' }];
}

function sortValue(sort: ListQuery['sort'], p: Project): string {
  if (sort === 'name_asc') return p.name;
  return (sort === 'created_desc' ? p.createdAt : p.updatedAt).toISOString();
}

function cursorWhere(
  sort: ListQuery['sort'],
  cursor: { v: string; id: string },
): Prisma.ProjectWhereInput {
  if (sort === 'name_asc')
    return { OR: [{ name: { gt: cursor.v } }, { name: cursor.v, id: { gt: cursor.id } }] };
  const field = sort === 'created_desc' ? 'createdAt' : 'updatedAt';
  const at = new Date(cursor.v);
  return { OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: cursor.id } }] };
}

export function toView(p: Project): ProjectView {
  return {
    id: p.id,
    displayId: p.displayId,
    name: p.name,
    description: p.description,
    status: p.status as ProjectStatus,
    visibility: p.visibility as ProjectVisibility,
    productCategory: p.productCategory,
    season: p.season,
    brand: p.brand,
    targetMarket: p.targetMarket,
    styleNumber: p.styleNumber,
    tags: p.tags,
    defaultDesignId: p.defaultDesignId,
    statusReason: p.statusReason,
    version: p.version,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    duplicatedFromId: p.duplicatedFromId,
  };
}
