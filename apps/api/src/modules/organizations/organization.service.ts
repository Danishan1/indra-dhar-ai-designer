import {
  DisplayIdPrefixes,
  type MyOrganization,
  type Organization as OrganizationView,
  OrganizationCreatedEvent,
  type OrgRoleKey,
  OwnershipTransferredEvent,
} from '@ai-designer/contracts';
import { newId, nextDisplayId, Prisma, type TxClient } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import type { OrgMembershipContext } from './org-access.js';
import { roleKeyById, SystemRoleIds } from './roles.js';
import { slugify, slugWithSuffix } from './slug.js';

export function toOrganizationView(org: {
  id: string;
  displayId: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
}): OrganizationView {
  return {
    id: org.id,
    displayId: org.displayId,
    name: org.name,
    slug: org.slug,
    status: org.status as OrganizationView['status'],
    createdAt: org.createdAt.toISOString(),
  };
}

/** Serializes ownership-sensitive changes per organization (row lock). */
export async function lockOrganization(tx: TxClient, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Org + default workspace + owner membership + audit + outbox, all in one transaction. */
  async create(userId: string, name: string): Promise<MyOrganization> {
    const id = newId();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const slug = attempt === 0 ? slugify(name) : slugWithSuffix(name);
      try {
        return await this.prisma.$transaction(async (tx) => {
          const displayId = await nextDisplayId(tx, null, DisplayIdPrefixes.organization);
          const org = await tx.organization.create({
            data: { id, displayId, name, slug, createdBy: userId },
          });
          await tx.workspace.create({
            data: { id: newId(), organizationId: id, name: 'Default', isDefault: true },
          });
          const membershipId = newId();
          await tx.membership.create({
            data: {
              id: membershipId,
              organizationId: id,
              userId,
              status: 'active',
              joinedAt: new Date(),
              roles: { create: { roleId: SystemRoleIds.organization_owner, grantedBy: userId } },
            },
          });
          const meta = { organizationId: id };
          await this.audit.record(
            {
              eventType: 'organizations.organization.created',
              action: 'organization.create',
              outcome: 'success',
              resourceType: 'organization',
              resourceId: id,
              metadata: { displayId },
            },
            tx,
            meta,
          );
          await this.outbox.append(
            tx,
            OrganizationCreatedEvent,
            { organizationId: id, ownerUserId: userId },
            meta,
          );
          return {
            ...toOrganizationView(org),
            membership: { id: membershipId, status: 'active', roles: ['organization_owner'] },
          };
        });
      } catch (err) {
        const slugTaken =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!slugTaken || attempt === 2) throw err;
      }
    }
    throw new AppError('CONFLICT', 'Could not create the organization, try another name');
  }

  /** Organizations where I have a live (active or suspended) membership. */
  async listMine(userId: string): Promise<MyOrganization[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        userId,
        status: { in: ['active', 'suspended'] },
        organization: { status: 'active' },
      },
      include: { organization: true, roles: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      ...toOrganizationView(m.organization),
      membership: {
        id: m.id,
        status: m.status as MyOrganization['membership']['status'],
        roles: m.roles.map((r) => roleKeyById(r.roleId)).filter((r): r is OrgRoleKey => !!r),
      },
    }));
  }

  async get(ctx: OrgMembershipContext): Promise<MyOrganization> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    return {
      ...toOrganizationView(org),
      membership: { id: ctx.membershipId, status: 'active', roles: ctx.roles },
    };
  }

  async rename(ctx: OrgMembershipContext, name: string): Promise<MyOrganization> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      await tx.organization.update({ where: { id: ctx.organizationId }, data: { name } });
      await this.audit.record(
        {
          eventType: 'organizations.organization.updated',
          action: 'organization.update',
          outcome: 'success',
          resourceType: 'organization',
          resourceId: ctx.organizationId,
          metadata: { from: before.name, to: name },
        },
        tx,
      );
    });
    return this.get(ctx);
  }

  /**
   * Ownership transfer (FR-SEC-079…081): the current owner names an active member and confirms with
   * the organization's exact name. The member becomes owner; the previous owner becomes admin.
   * Step-up authentication is added in I08.
   */
  async transferOwnership(
    ctx: OrgMembershipContext,
    toMembershipId: string,
    confirmName: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, ctx.organizationId);
      const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
      if (confirmName.trim() !== org.name) {
        throw new AppError('VALIDATION_FAILED', 'Type the organization name exactly to confirm', {
          issues: [
            {
              path: 'confirmOrganizationName',
              message: 'Does not match the organization name',
              code: 'mismatch',
            },
          ],
        });
      }
      const target = await tx.membership.findFirst({
        where: { id: toMembershipId, organizationId: ctx.organizationId },
        include: { roles: true },
      });
      if (!target) throw AppError.notFound('Member');
      if (target.status !== 'active') throw AppError.invalidTransition(target.status, 'owner');
      if (target.id === ctx.membershipId)
        throw new AppError('CONFLICT', 'You already own this organization');

      await tx.membershipRole.deleteMany({ where: { membershipId: target.id } });
      await tx.membershipRole.create({
        data: {
          membershipId: target.id,
          roleId: SystemRoleIds.organization_owner,
          grantedBy: ctx.userId,
        },
      });
      await tx.membershipRole.deleteMany({ where: { membershipId: ctx.membershipId } });
      await tx.membershipRole.create({
        data: {
          membershipId: ctx.membershipId,
          roleId: SystemRoleIds.organization_admin,
          grantedBy: ctx.userId,
        },
      });

      await this.audit.record(
        {
          eventType: 'organizations.ownership.transferred',
          action: 'organization.transfer_ownership',
          outcome: 'success',
          resourceType: 'organization',
          resourceId: ctx.organizationId,
          metadata: {
            fromUserId: ctx.userId,
            toUserId: target.userId,
            previousOwnerNewRole: 'organization_admin',
          },
        },
        tx,
      );
      await this.outbox.append(tx, OwnershipTransferredEvent, {
        organizationId: ctx.organizationId,
        fromUserId: ctx.userId,
        toUserId: target.userId,
      });
    });
  }
}
