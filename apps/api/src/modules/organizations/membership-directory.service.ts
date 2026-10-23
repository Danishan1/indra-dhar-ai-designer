import { Injectable, type OnModuleInit } from '@nestjs/common';

import type { MembershipAccess } from '../../platform/authz/access-cache.js';
import {
  type MembershipDirectory,
  MembershipDirectoryRegistry,
} from '../../platform/authz/membership-directory.js';
import { ResourceResolverRegistry } from '../../platform/authz/resource-resolvers.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

const LIVE = ['active', 'suspended'];

/**
 * The organizations module's side of authorization: live membership lookups for the PDP and owner
 * lookups for its resources (`membership`, `invitation`). Selects only what decisions need.
 */
@Injectable()
export class OrganizationsDirectory implements MembershipDirectory, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directories: MembershipDirectoryRegistry,
    private readonly resolvers: ResourceResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.directories.register(this);
    this.resolvers.register('membership', {
      label: 'Member',
      organizationOf: async (id) =>
        (
          await this.prisma.membership.findUnique({
            where: { id },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
    });
    this.resolvers.register('invitation', {
      label: 'Invitation',
      organizationOf: async (id) =>
        (
          await this.prisma.invitation.findUnique({
            where: { id },
            select: { organizationId: true },
          })
        )?.organizationId ?? null,
    });
  }

  async findAccess(organizationId: string, userId: string): Promise<MembershipAccess | null> {
    const m = await this.prisma.membership.findFirst({
      where: { organizationId, userId, status: { in: LIVE }, organization: { status: 'active' } },
      select: { id: true, status: true, roles: { select: { roleId: true } } },
    });
    return m ? this.toAccess(organizationId, userId, m) : null;
  }

  async findById(organizationId: string, membershipId: string): Promise<MembershipAccess | null> {
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId, status: { in: LIVE } },
      select: { id: true, userId: true, status: true, roles: { select: { roleId: true } } },
    });
    return m ? this.toAccess(organizationId, m.userId, m) : null;
  }

  private toAccess(
    organizationId: string,
    userId: string,
    m: { id: string; status: string; roles: { roleId: string }[] },
  ): MembershipAccess {
    return {
      membershipId: m.id,
      organizationId,
      userId,
      status: m.status === 'active' ? 'active' : 'suspended',
      roleIds: m.roles.map((r) => r.roleId),
    };
  }
}
