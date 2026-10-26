import {
  type PermissionKey,
  ResourceGrantCreatedEvent,
  ResourceGrantRevokedEvent,
} from '@ai-designer/contracts';
import { newId } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

export interface CreateGrantInput {
  organizationId: string;
  resourceType: string;
  resourceId: string;
  recipientUserId: string;
  actions: PermissionKey[];
  grantedBy: string;
  expiresAt?: Date | null;
}

/**
 * Resource-level grants (FR-SEC-094…100). The PDP consults them after role permissions; expiry and
 * revocation are checked at every request (FR-SEC-100). Sharing endpoints arrive with shareable
 * resources (projects I10, tech packs I43) and must check `<resource>.manage_access` first.
 */
@Injectable()
export class ResourceGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async hasActiveGrant(
    organizationId: string,
    userId: string,
    resource: { type: string; id: string },
    action: PermissionKey,
  ): Promise<string | null> {
    const grant = await this.prisma.resourceGrant.findFirst({
      where: {
        organizationId,
        recipientType: 'user',
        recipientId: userId,
        resourceType: resource.type,
        resourceId: resource.id,
        revokedAt: null,
        actions: { has: action },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    return grant?.id ?? null;
  }

  /** Whether the user holds any active grant on the resource (for restricted visibility). */
  async hasAnyActiveGrant(
    organizationId: string,
    userId: string,
    resource: { type: string; id: string },
  ): Promise<boolean> {
    const grant = await this.prisma.resourceGrant.findFirst({
      where: {
        organizationId,
        recipientType: 'user',
        recipientId: userId,
        resourceType: resource.type,
        resourceId: resource.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    return grant !== null;
  }

  /** Active grants on one resource (the project's access tab). */
  async listForResource(organizationId: string, resource: { type: string; id: string }) {
    return this.prisma.resourceGrant.findMany({
      where: {
        organizationId,
        resourceType: resource.type,
        resourceId: resource.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Resource ids of one type the user may access through active grants (restricted listings). */
  async resourceIdsGrantedTo(
    organizationId: string,
    userId: string,
    resourceType: string,
    action: PermissionKey,
  ): Promise<string[]> {
    const rows = await this.prisma.resourceGrant.findMany({
      where: {
        organizationId,
        recipientType: 'user',
        recipientId: userId,
        resourceType,
        revokedAt: null,
        actions: { has: action },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { resourceId: true },
    });
    return rows.map((r) => r.resourceId);
  }

  async listActiveForUser(organizationId: string, userId: string) {
    return this.prisma.resourceGrant.findMany({
      where: {
        organizationId,
        recipientType: 'user',
        recipientId: userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(input: CreateGrantInput): Promise<string> {
    const id = newId();
    await this.prisma.$transaction(async (tx) => {
      await tx.resourceGrant.create({
        data: {
          id,
          organizationId: input.organizationId,
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          recipientType: 'user',
          recipientId: input.recipientUserId,
          actions: input.actions,
          grantedBy: input.grantedBy,
          expiresAt: input.expiresAt ?? null,
        },
      });
      const ref = { resourceType: input.resourceType, resourceId: input.resourceId };
      await this.audit.record(
        {
          eventType: 'authorization.resource_grant_created',
          action: 'grant.create',
          outcome: 'success',
          ...ref,
          metadata: { grantId: id, recipientUserId: input.recipientUserId, actions: input.actions },
        },
        tx,
        { organizationId: input.organizationId },
      );
      await this.outbox.append(
        tx,
        ResourceGrantCreatedEvent,
        { organizationId: input.organizationId, grantId: id, ...ref },
        { organizationId: input.organizationId },
      );
    });
    return id;
  }

  async revoke(organizationId: string, grantId: string, revokedBy: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.resourceGrant.findFirst({
        where: { id: grantId, organizationId, revokedAt: null },
      });
      if (!grant) return false;
      await tx.resourceGrant.update({
        where: { id: grantId },
        data: { revokedAt: new Date(), revokedBy },
      });
      const ref = { resourceType: grant.resourceType, resourceId: grant.resourceId };
      await this.audit.record(
        {
          eventType: 'authorization.resource_grant_revoked',
          action: 'grant.revoke',
          outcome: 'success',
          ...ref,
          metadata: { grantId },
        },
        tx,
        { organizationId },
      );
      await this.outbox.append(
        tx,
        ResourceGrantRevokedEvent,
        { organizationId, grantId, ...ref },
        { organizationId },
      );
      return true;
    });
  }
}
