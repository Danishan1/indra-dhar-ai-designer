import {
  type Member,
  MembershipReactivatedEvent,
  MembershipRevokedEvent,
  MembershipSuspendedEvent,
  type OrgRoleKey,
} from '@ai-designer/contracts';
import type { TxClient } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AccountService } from '../identity/account.service.js';

import type { OrgMembershipContext } from './org-access.js';
import { lockOrganization } from './organization.service.js';
import { canManage, isOwner, roleKeyById, SystemRoleIds } from './roles.js';

type Action = 'suspend' | 'reactivate' | 'revoke';

const TRANSITIONS: Record<Action, { from: string[]; to: string }> = {
  suspend: { from: ['active'], to: 'suspended' },
  reactivate: { from: ['suspended'], to: 'active' },
  revoke: { from: ['active', 'suspended'], to: 'revoked' },
};

export function canTransitionMembership(action: Action, from: string): boolean {
  return TRANSITIONS[action].from.includes(from);
}

/**
 * Last-owner invariant (FR-SEC-080): after the change, at least one *active* owner must remain.
 * `remainingActiveOwners` counts active owners other than the target.
 */
export function violatesLastOwner(
  targetIsOwner: boolean,
  action: Action,
  remainingActiveOwners: number,
): boolean {
  return targetIsOwner && action !== 'reactivate' && remainingActiveOwners === 0;
}

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Members with history (ended memberships kept for audit, FR-SEC-071). */
  async list(ctx: OrgMembershipContext): Promise<Member[]> {
    const rows = await this.prisma.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['active', 'suspended', 'revoked'] },
      },
      include: { roles: true },
      orderBy: [{ joinedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const profiles = await this.accounts.getProfiles(rows.map((r) => r.userId));
    return rows.map((m) => {
      const profile = profiles.get(m.userId);
      return {
        membershipId: m.id,
        userId: m.userId,
        displayName: profile?.displayName ?? 'Unknown user',
        email: profile?.email ?? '',
        status: m.status as Member['status'],
        roles: m.roles.map((r) => roleKeyById(r.roleId)).filter((r): r is OrgRoleKey => !!r),
        joinedAt: m.joinedAt?.toISOString() ?? null,
        endedAt: m.endedAt?.toISOString() ?? null,
        endReason: m.endReason,
      };
    });
  }

  suspend(ctx: OrgMembershipContext, membershipId: string): Promise<Member> {
    return this.change(ctx, membershipId, 'suspend');
  }

  reactivate(ctx: OrgMembershipContext, membershipId: string): Promise<Member> {
    return this.change(ctx, membershipId, 'reactivate');
  }

  revoke(ctx: OrgMembershipContext, membershipId: string): Promise<Member> {
    return this.change(ctx, membershipId, 'revoke');
  }

  private async countOtherActiveOwners(
    tx: TxClient,
    organizationId: string,
    exceptMembershipId: string,
  ): Promise<number> {
    return tx.membership.count({
      where: {
        organizationId,
        status: 'active',
        id: { not: exceptMembershipId },
        roles: { some: { roleId: SystemRoleIds.organization_owner } },
      },
    });
  }

  private async change(
    ctx: OrgMembershipContext,
    membershipId: string,
    action: Action,
  ): Promise<Member> {
    await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, ctx.organizationId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, organizationId: ctx.organizationId },
        include: { roles: true },
      });
      if (!target) throw AppError.notFound('Member');
      const targetRoles = target.roles
        .map((r) => roleKeyById(r.roleId))
        .filter((r): r is OrgRoleKey => !!r);
      if (target.id === ctx.membershipId) {
        throw new AppError('CONFLICT', 'You cannot change your own membership here', {
          reason: 'self',
        });
      }
      if (!canManage(ctx.roles, targetRoles)) {
        throw new AppError(
          'PERMISSION_DENIED',
          'You cannot manage a member with the same or higher role',
        );
      }
      if (!canTransitionMembership(action, target.status))
        throw AppError.invalidTransition(target.status, TRANSITIONS[action].to);
      const others = await this.countOtherActiveOwners(tx, ctx.organizationId, target.id);
      if (violatesLastOwner(isOwner(targetRoles), action, others)) {
        throw new AppError(
          'LAST_OWNER_REQUIRED',
          'The organization must keep at least one active owner. Transfer ownership first.',
        );
      }

      const now = new Date();
      await tx.membership.update({
        where: { id: target.id },
        data:
          action === 'revoke'
            ? { status: 'revoked', endedAt: now, endReason: 'revoked_by_admin' }
            : { status: TRANSITIONS[action].to },
      });
      const eventType = { suspend: 'suspended', reactivate: 'reactivated', revoke: 'revoked' }[
        action
      ];
      await this.audit.record(
        {
          eventType: `organizations.membership.${eventType}`,
          action: `membership.${action}`,
          outcome: 'success',
          resourceType: 'membership',
          resourceId: target.id,
          metadata: { userId: target.userId, roles: targetRoles, previousStatus: target.status },
        },
        tx,
      );
      const def = {
        suspend: MembershipSuspendedEvent,
        reactivate: MembershipReactivatedEvent,
        revoke: MembershipRevokedEvent,
      }[action];
      await this.outbox.append(tx, def, {
        organizationId: ctx.organizationId,
        membershipId: target.id,
        userId: target.userId,
      });
    });
    const members = await this.list(ctx);
    const updated = members.find((m) => m.membershipId === membershipId);
    if (!updated) throw AppError.notFound('Member');
    return updated;
  }
}
