import { SessionRevokedEvent, type SessionInfo } from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import { AuditService } from '../../platform/audit/audit.service.js';
import type { RequestAuth } from '../../platform/auth/request-auth.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { deviceLabel } from './device.js';

/** Users review and revoke their own sessions (FR-SEC-054). Revocation deletes the row: the next request with that cookie is anonymous (TR-SEC-013). */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(auth: RequestAuth): Promise<SessionInfo[]> {
    const rows = await this.prisma.session.findMany({
      where: {
        userId: auth.userId,
        expiresAt: { gt: new Date() },
        absoluteExpiresAt: { gt: new Date() },
        authAssurance: { not: 'mfa_pending' },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      deviceLabel: deviceLabel(r.userAgent),
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.updatedAt.toISOString(),
      expiresAt: (r.absoluteExpiresAt < r.expiresAt
        ? r.absoluteExpiresAt
        : r.expiresAt
      ).toISOString(),
      current: r.id === auth.sessionId,
      mfaVerified: r.authAssurance === 'mfa_verified',
    }));
  }

  async revoke(auth: RequestAuth, sessionId: string): Promise<void> {
    if (sessionId === auth.sessionId)
      throw AppError.conflict('Use “Sign out” to end the current session', { reason: 'current' });
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.deleteMany({
        where: { id: sessionId, userId: auth.userId },
      });
      if (count === 0) throw AppError.notFound('Session');
      await this.record(tx, auth.userId, [sessionId]);
    });
  }

  async revokeOthers(auth: RequestAuth): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const others = await tx.session.findMany({
        where: { userId: auth.userId, id: { not: auth.sessionId } },
        select: { id: true },
      });
      if (!others.length) return 0;
      await tx.session.deleteMany({ where: { id: { in: others.map((o) => o.id) } } });
      await this.record(
        tx,
        auth.userId,
        others.map((o) => o.id),
      );
      return others.length;
    });
  }

  private async record(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    userId: string,
    sessionIds: string[],
  ): Promise<void> {
    const actor = { actor: { type: 'human' as const, id: userId } };
    for (const sessionId of sessionIds) {
      await this.audit.record(
        {
          eventType: 'identity.session.revoked',
          action: 'session.revoke',
          outcome: 'success',
          resourceType: 'session',
          resourceId: sessionId,
          reasonCode: 'user_revoked',
        },
        tx,
        actor,
      );
      await this.outbox.append(
        tx,
        SessionRevokedEvent,
        { userId, sessionId, reason: 'user_revoked' },
        actor,
      );
    }
  }
}
