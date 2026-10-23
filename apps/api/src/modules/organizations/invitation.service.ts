import { createHash } from 'node:crypto';

import {
  type Invitation as InvitationView,
  InvitationAcceptedEvent,
  InvitationCancelledEvent,
  InvitationCreatedEvent,
  type InvitationPreview,
  type MyOrganization,
  type OrgRoleKey,
} from '@ai-designer/contracts';
import { newId, Prisma } from '@ai-designer/db';
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import { RateLimitService } from '../../platform/rate-limit/rate-limit.service.js';
import { AccountService } from '../identity/account.service.js';
import { randomToken } from '../identity/crypto.js';

import type { OrgMembershipContext } from './org-access.js';
import { toOrganizationView } from './organization.service.js';
import { OrganizationsMailService } from './organizations-mail.service.js';
import { roleKeyById, canGrant, SystemRoleIds } from './roles.js';

export const INVITATION_TTL_MS = 7 * 24 * 3_600_000;

export const InvitationRateLimits = {
  createPerOrg: { name: 'org.invite.org', limit: 50, windowSeconds: 3600 },
  resendPerInvitation: { name: 'org.invite.resend', limit: 5, windowSeconds: 3600 },
  previewPerIp: { name: 'org.invite.preview.ip', limit: 60, windowSeconds: 3600 },
  acceptPerUser: { name: 'org.invite.accept.user', limit: 20, windowSeconds: 3600 },
};

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(`invitation:${token}`).digest('base64url');
}

/** Effective status: a pending invitation past its expiry is expired even before the sweeper runs. */
export function effectiveInvitationStatus(
  inv: { status: string; expiresAt: Date },
  now = Date.now(),
): InvitationView['status'] {
  if (inv.status === 'pending' && inv.expiresAt.getTime() <= now) return 'expired';
  return inv.status as InvitationView['status'];
}

const INVALID = () =>
  new AppError(
    'TOKEN_INVALID_OR_EXPIRED',
    'This invitation is invalid, expired, cancelled or already used.',
  );

/**
 * Invitations (FR-SEC-072…078): org-scoped, proposed role, token = 32 random bytes stored as
 * SHA-256 only, single-use, 7 days, cancellable; acceptance requires the signed-in user's verified
 * email to equal the invited email. Never a domain-based auto-join (FR-SEC-068).
 */
@Injectable()
export class InvitationService {
  private readonly logger = new Logger('Invitations');

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
    private readonly mail: OrganizationsMailService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly rateLimits: RateLimitService,
  ) {}

  private async views(
    rows: {
      id: string;
      email: string;
      proposedRoleIds: string[];
      status: string;
      invitedBy: string;
      expiresAt: Date;
      createdAt: Date;
      lastSentAt: Date;
    }[],
  ): Promise<InvitationView[]> {
    const profiles = await this.accounts.getProfiles(rows.map((r) => r.invitedBy));
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      roles: r.proposedRoleIds.map(roleKeyById).filter((k): k is OrgRoleKey => !!k),
      status: effectiveInvitationStatus(r),
      invitedBy: {
        userId: r.invitedBy,
        displayName: profiles.get(r.invitedBy)?.displayName ?? 'Unknown user',
      },
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      lastSentAt: r.lastSentAt.toISOString(),
    }));
  }

  async list(ctx: OrgMembershipContext): Promise<InvitationView[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { organizationId: ctx.organizationId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return this.views(rows);
  }

  private async send(
    organizationId: string,
    inviterId: string,
    email: string,
    roles: OrgRoleKey[],
    token: string,
  ): Promise<void> {
    const [org, profiles] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } }),
      this.accounts.getProfiles([inviterId]),
    ]);
    try {
      await this.mail.sendInvitation({
        to: email,
        organizationName: org.name,
        inviterName: profiles.get(inviterId)?.displayName ?? 'A colleague',
        roles,
        token,
      });
    } catch (err) {
      this.logger.error({ err, organizationId }, 'invitation email could not be sent');
    }
  }

  async create(
    ctx: OrgMembershipContext,
    email: string,
    role: OrgRoleKey,
  ): Promise<InvitationView> {
    if (!canGrant(ctx.roles, role))
      throw new AppError(
        'PERMISSION_DENIED',
        'You cannot invite someone with a role above your own',
      );
    await this.rateLimits.enforce([
      { rule: InvitationRateLimits.createPerOrg, subject: ctx.organizationId },
    ]);

    const existingMember = await this.prisma.membership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ['active', 'suspended'] },
        userId: { in: await this.userIdsForEmail(email) },
      },
    });
    if (existingMember)
      throw new AppError('CONFLICT', 'This person is already a member of the organization', {
        reason: 'already_member',
      });

    const token = randomToken();
    const id = newId();
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // A stale pending invitation that already expired must not block a new one.
        await tx.invitation.updateMany({
          where: {
            organizationId: ctx.organizationId,
            email,
            status: 'pending',
            expiresAt: { lte: new Date() },
          },
          data: { status: 'expired' },
        });
        const row = await tx.invitation.create({
          data: {
            id,
            organizationId: ctx.organizationId,
            email,
            proposedRoleIds: [SystemRoleIds[role]],
            tokenHash: hashInvitationToken(token),
            invitedBy: ctx.userId,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          },
        });
        await this.audit.record(
          {
            eventType: 'organizations.invitation.created',
            action: 'invitation.create',
            outcome: 'success',
            resourceType: 'invitation',
            resourceId: id,
            metadata: { role },
          },
          tx,
        );
        await this.outbox.append(tx, InvitationCreatedEvent, {
          organizationId: ctx.organizationId,
          invitationId: id,
        });
        return row;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          'CONFLICT',
          'An invitation for this email is already pending. Resend it instead.',
          { reason: 'pending_invitation' },
        );
      }
      throw err;
    }
    await this.send(ctx.organizationId, ctx.userId, email, [role], token);
    const [view] = await this.views([created]);
    return view!;
  }

  private async userIdsForEmail(email: string): Promise<string[]> {
    const user = await this.accounts.findByEmail(email);
    return user ? [user.id] : [];
  }

  private async pendingInOrg(ctx: OrgMembershipContext, invitationId: string) {
    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId: ctx.organizationId },
    });
    if (!inv) throw AppError.notFound('Invitation');
    const status = effectiveInvitationStatus(inv);
    if (status !== 'pending') throw AppError.invalidTransition(status, 'pending');
    return inv;
  }

  async cancel(ctx: OrgMembershipContext, invitationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inv = await this.pendingInOrg(ctx, invitationId);
      const { count } = await tx.invitation.updateMany({
        where: { id: inv.id, status: 'pending' },
        data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: ctx.userId },
      });
      if (count === 0) throw AppError.invalidTransition('changed', 'cancelled');
      await this.audit.record(
        {
          eventType: 'organizations.invitation.cancelled',
          action: 'invitation.cancel',
          outcome: 'success',
          resourceType: 'invitation',
          resourceId: inv.id,
        },
        tx,
      );
      await this.outbox.append(tx, InvitationCancelledEvent, {
        organizationId: ctx.organizationId,
        invitationId: inv.id,
      });
    });
  }

  /** New token (the old link stops working) and a fresh 7-day window. */
  async resend(ctx: OrgMembershipContext, invitationId: string): Promise<InvitationView> {
    await this.rateLimits.enforce([
      { rule: InvitationRateLimits.resendPerInvitation, subject: invitationId },
    ]);
    const inv = await this.pendingInOrg(ctx, invitationId);
    const token = randomToken();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.invitation.update({
        where: { id: inv.id },
        data: {
          tokenHash: hashInvitationToken(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          lastSentAt: new Date(),
          sendCount: { increment: 1 },
        },
      });
      await this.audit.record(
        {
          eventType: 'organizations.invitation.resent',
          action: 'invitation.resend',
          outcome: 'success',
          resourceType: 'invitation',
          resourceId: inv.id,
        },
        tx,
      );
      return row;
    });
    const roles = inv.proposedRoleIds.map(roleKeyById).filter((k): k is OrgRoleKey => !!k);
    await this.send(ctx.organizationId, ctx.userId, inv.email, roles, token);
    const [view] = await this.views([updated]);
    return view!;
  }

  /** Public preview: organization name, inviter name, invited email and role only. */
  async preview(token: string, ip: string): Promise<InvitationPreview> {
    await this.rateLimits.enforce([{ rule: InvitationRateLimits.previewPerIp, subject: ip }]);
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      include: { organization: true },
    });
    if (
      !inv ||
      effectiveInvitationStatus(inv) !== 'pending' ||
      inv.organization.status !== 'active'
    )
      throw INVALID();
    const profiles = await this.accounts.getProfiles([inv.invitedBy]);
    return {
      organizationName: inv.organization.name,
      invitedByName: profiles.get(inv.invitedBy)?.displayName ?? 'A colleague',
      email: inv.email,
      roles: inv.proposedRoleIds.map(roleKeyById).filter((k): k is OrgRoleKey => !!k),
      expiresAt: inv.expiresAt.toISOString(),
    };
  }

  /**
   * Accept (FR-SEC-074/075/077): row-locked check of status + expiry + verified email match, then
   * membership + roles + invitation consumed + audit + outbox in one transaction.
   */
  async accept(userId: string, token: string): Promise<MyOrganization> {
    await this.rateLimits.enforce([{ rule: InvitationRateLimits.acceptPerUser, subject: userId }]);
    const tokenHash = hashInvitationToken(token);
    const profile = (await this.accounts.getProfiles([userId])).get(userId);
    if (!profile || profile.status !== 'active')
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue');

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM invitations WHERE token_hash = ${tokenHash} FOR UPDATE`;
      if (!rows[0]) throw INVALID();
      const inv = await tx.invitation.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { organization: true },
      });
      if (effectiveInvitationStatus(inv) !== 'pending' || inv.organization.status !== 'active')
        throw INVALID();
      if (inv.email !== profile.email) {
        await this.audit.record(
          {
            eventType: 'organizations.invitation.accept_denied',
            action: 'invitation.accept',
            outcome: 'denied',
            reasonCode: 'email_mismatch',
            resourceType: 'invitation',
            resourceId: inv.id,
          },
          undefined,
          { organizationId: inv.organizationId },
        );
        throw new AppError(
          'INVITATION_EMAIL_MISMATCH',
          'This invitation was sent to a different email address. Sign in with that address to accept it.',
        );
      }
      const live = await tx.membership.findFirst({
        where: {
          organizationId: inv.organizationId,
          userId,
          status: { in: ['active', 'suspended', 'invited'] },
        },
      });
      if (live)
        throw new AppError('CONFLICT', 'You are already a member of this organization', {
          reason: 'already_member',
        });

      const membershipId = newId();
      const now = new Date();
      await tx.membership.create({
        data: {
          id: membershipId,
          organizationId: inv.organizationId,
          userId,
          status: 'active',
          invitedBy: inv.invitedBy,
          invitationId: inv.id,
          joinedAt: now,
          roles: {
            create: inv.proposedRoleIds.map((roleId) => ({ roleId, grantedBy: inv.invitedBy })),
          },
        },
      });
      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: 'accepted', acceptedAt: now, acceptedBy: userId },
      });
      const meta = { organizationId: inv.organizationId };
      await this.audit.record(
        {
          eventType: 'organizations.invitation.accepted',
          action: 'invitation.accept',
          outcome: 'success',
          resourceType: 'invitation',
          resourceId: inv.id,
          metadata: { membershipId },
        },
        tx,
        meta,
      );
      await this.audit.record(
        {
          eventType: 'organizations.membership.created',
          action: 'membership.create',
          outcome: 'success',
          resourceType: 'membership',
          resourceId: membershipId,
          metadata: { roles: inv.proposedRoleIds.map(roleKeyById), via: 'invitation' },
        },
        tx,
        meta,
      );
      await this.outbox.append(
        tx,
        InvitationAcceptedEvent,
        { organizationId: inv.organizationId, invitationId: inv.id, membershipId, userId },
        meta,
      );
      return {
        ...toOrganizationView(inv.organization),
        membership: {
          id: membershipId,
          status: 'active' as const,
          roles: inv.proposedRoleIds.map(roleKeyById).filter((k): k is OrgRoleKey => !!k),
        },
      };
    });
  }
}
