import type { AccountStatus, Me } from '@ai-designer/contracts';
import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../platform/config/app-config.js';
import { AppError } from '../../platform/errors/app-error.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

/** Allowed account state transitions (FR-SEC-006). Admin flows (I45) add suspend/restore. */
const TRANSITIONS: Record<AccountStatus, readonly AccountStatus[]> = {
  pending_verification: ['active', 'deletion_pending'],
  active: ['suspended', 'locked', 'deletion_pending'],
  suspended: ['active', 'deletion_pending'],
  locked: ['active', 'deletion_pending'],
  deletion_pending: ['active', 'deleted_or_anonymized'],
  deleted_or_anonymized: [],
};

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Login-failure bookkeeping and profile reads/writes on the identity module's own tables. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  isLocked(user: { lockedUntil: Date | null }): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  /** Counts a failed password attempt; returns true when this attempt triggered a lockout. */
  async recordFailedLogin(userId: string): Promise<boolean> {
    const threshold = this.config.env.AUTH_LOCKOUT_THRESHOLD;
    const lockUntil = new Date(Date.now() + this.config.env.AUTH_LOCKOUT_MINUTES * 60_000);
    const rows = await this.prisma.$queryRaw<{ failed_login_count: number; locked: boolean }[]>`
      UPDATE users
      SET failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= ${threshold} THEN ${lockUntil} ELSE locked_until END,
          updated_at = now()
      WHERE id = ${userId}::uuid
      RETURNING failed_login_count, (failed_login_count = ${threshold}) AS locked`;
    return rows[0]?.locked ?? false;
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  /** Password reset is the safe recovery path from a lockout (FR-SEC-044). */
  async clearLockout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  /** Public profile fields for other modules (organizations) — they never read `users` directly. */
  async getProfiles(
    userIds: readonly string[],
  ): Promise<Map<string, { displayName: string; email: string; status: string }>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: { id: true, displayName: true, email: true, status: true },
    });
    return new Map(
      users.map((u) => [u.id, { displayName: u.displayName, email: u.email, status: u.status }]),
    );
  }

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('UNAUTHENTICATED', 'Not signed in');
    return toMe(user);
  }

  async updateDisplayName(userId: string, displayName: string): Promise<Me> {
    return toMe(await this.prisma.user.update({ where: { id: userId }, data: { displayName } }));
  }
}

export function toMe(user: {
  id: string;
  email: string;
  displayName: string;
  status: string;
  emailVerified: boolean;
  createdAt: Date;
}): Me {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status as AccountStatus,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}
