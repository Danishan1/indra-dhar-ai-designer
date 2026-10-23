import {
  BASELINE_ROLES,
  canActOnMember,
  canDelegateRole,
  type Member,
  MembershipReactivatedEvent,
  MembershipRevokedEvent,
  MembershipSuspendedEvent,
  type OrgRoleKey,
  RoleAssignmentChangedEvent,
  roleKeyById,
} from '@ai-designer/contracts';
import type { TxClient } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AccessCache } from '../../platform/authz/access-cache.js';
import type { AuthzContext } from '../../platform/authz/authorizer.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { AccountService } from '../identity/account.service.js';

import { lockOrganization } from './organization.service.js';

const OWNER_ROLE_ID = BASELINE_ROLES.organization_owner.id;
const roleKeys = (rows: { roleId: string }[]): OrgRoleKey[] =>
  rows.map((r) => roleKeyById(r.roleId)).filter((r): r is OrgRoleKey => !!r);

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
    private readonly accessCache: AccessCache,
  ) {}

  /** Members with history (ended memberships kept for audit, FR-SEC-071). */
  async list(ctx: AuthzContext): Promise<Member[]> {
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
        roles: roleKeys(m.roles),
        joinedAt: m.joinedAt?.toISOString() ?? null,
        endedAt: m.endedAt?.toISOString() ?? null,
        endReason: m.endReason,
      };
    });
  }

  suspend(ctx: AuthzContext, membershipId: string): Promise<Member> {
    return this.change(ctx, membershipId, 'suspend');
  }

  reactivate(ctx: AuthzContext, membershipId: string): Promise<Member> {
    return this.change(ctx, membershipId, 'reactivate');
  }

  revoke(ctx: AuthzContext, membershipId: string): Promise<Member> {
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
        roles: { some: { roleId: OWNER_ROLE_ID } },
      },
    });
  }

  private async change(ctx: AuthzContext, membershipId: string, action: Action): Promise<Member> {
    const targetUserId = await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, ctx.organizationId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, organizationId: ctx.organizationId },
        include: { roles: true },
      });
      if (!target) throw AppError.notFound('Member');
      const targetRoles = roleKeys(target.roles);
      if (target.id === ctx.membershipId) {
        throw new AppError('CONFLICT', 'You cannot change your own membership here', {
          reason: 'self',
        });
      }
      if (!canActOnMember(ctx.roles, targetRoles)) {
        throw new AppError(
          'PERMISSION_DENIED',
          'You cannot manage a member who holds roles you cannot grant',
          { reason: 'delegation' },
        );
      }
      if (!canTransitionMembership(action, target.status))
        throw AppError.invalidTransition(target.status, TRANSITIONS[action].to);
      const others = await this.countOtherActiveOwners(tx, ctx.organizationId, target.id);
      if (violatesLastOwner(targetRoles.includes('organization_owner'), action, others)) {
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
      return target.userId;
    });
    // Revocation/suspension takes effect on the member's very next request (TR-SEC-004).
    await this.accessCache.invalidate(ctx.organizationId, targetUserId);
    const members = await this.list(ctx);
    const updated = members.find((m) => m.membershipId === membershipId);
    if (!updated) throw AppError.notFound('Member');
    return updated;
  }

  /**
   * Replaces a member's roles (FR-SEC-086…090). Every role added or removed must be delegable by
   * the actor (AC-SEC-003); Owner can neither be added nor removed here (transfer only), which also
   * keeps the last-owner invariant. Grants are scoped to this organization's membership row.
   */
  async updateRoles(ctx: AuthzContext, membershipId: string, roles: OrgRoleKey[]): Promise<Member> {
    const wanted = [...new Set(roles)];
    const targetUserId = await this.prisma.$transaction(async (tx) => {
      await lockOrganization(tx, ctx.organizationId);
      const target = await tx.membership.findFirst({
        where: { id: membershipId, organizationId: ctx.organizationId },
        include: { roles: true },
      });
      if (!target) throw AppError.notFound('Member');
      if (target.status !== 'active' && target.status !== 'suspended')
        throw AppError.invalidTransition(target.status, 'roles_changed');
      const current = roleKeys(target.roles);
      if (!canActOnMember(ctx.roles, current)) {
        throw new AppError(
          'PERMISSION_DENIED',
          'You cannot manage a member who holds roles you cannot grant',
          { reason: 'delegation' },
        );
      }
      const added = wanted.filter((r) => !current.includes(r));
      const removed = current.filter((r) => !wanted.includes(r));
      if (added.includes('organization_owner') || removed.includes('organization_owner')) {
        throw new AppError(
          'PERMISSION_DENIED',
          'Ownership can only change through an ownership transfer',
          { reason: 'ownership_transfer_only' },
        );
      }
      const notDelegable = [...added, ...removed].filter((r) => !canDelegateRole(ctx.roles, r));
      if (notDelegable.length) {
        throw new AppError('PERMISSION_DENIED', 'You cannot grant or remove these roles', {
          reason: 'delegation',
          roles: notDelegable,
        });
      }
      if (!added.length && !removed.length) return null;

      if (removed.length) {
        await tx.membershipRole.deleteMany({
          where: {
            membershipId: target.id,
            roleId: { in: removed.map((r) => BASELINE_ROLES[r].id) },
          },
        });
      }
      if (added.length) {
        await tx.membershipRole.createMany({
          data: added.map((r) => ({
            membershipId: target.id,
            roleId: BASELINE_ROLES[r].id,
            grantedBy: ctx.userId,
          })),
        });
      }
      await this.audit.record(
        {
          eventType: 'authorization.role_assignment_changed',
          action: 'members.manage_roles',
          outcome: 'success',
          resourceType: 'membership',
          resourceId: target.id,
          metadata: { userId: target.userId, before: current, after: wanted, added, removed },
        },
        tx,
      );
      await this.outbox.append(tx, RoleAssignmentChangedEvent, {
        organizationId: ctx.organizationId,
        membershipId: target.id,
        userId: target.userId,
        added,
        removed,
      });
      return target.userId;
    });
    if (targetUserId) await this.accessCache.invalidate(ctx.organizationId, targetUserId);
    const updated = (await this.list(ctx)).find((m) => m.membershipId === membershipId);
    if (!updated) throw AppError.notFound('Member');
    return updated;
  }
}
