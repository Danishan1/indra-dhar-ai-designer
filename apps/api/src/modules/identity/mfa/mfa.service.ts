import { createHmac } from 'node:crypto';

import {
  MfaDisabledEvent,
  MfaEnabledEvent,
  type MfaStatus,
  RecoveryCodesRegeneratedEvent,
  type TotpSetupResponse,
} from '@ai-designer/contracts';
import { newId, type TxClient, type WriteMeta } from '@ai-designer/db';
import { Injectable, Logger } from '@nestjs/common';

import { AuditService } from '../../../platform/audit/audit.service.js';
import type { RequestAuth } from '../../../platform/auth/request-auth.js';
import { AppConfig } from '../../../platform/config/app-config.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { OutboxService } from '../../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import {
  type RateLimitRule,
  RateLimitService,
} from '../../../platform/rate-limit/rate-limit.service.js';
import { SecretsService } from '../../../platform/secrets/secrets.service.js';
import { type SecurityNotice, IdentityMailService } from '../identity-mail.service.js';
import { verifyPassword } from '../password-hasher.js';

import {
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from './totp.js';

export const MfaRateLimits = {
  codeUser: { name: 'auth.mfa.user', limit: 10, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

/** Platform default freshness for step-up (orgs can tighten per policy). */
export const DEFAULT_STEP_UP_MAX_AGE_MIN = 10;

const asUser = (userId: string): Partial<WriteMeta> => ({ actor: { type: 'human', id: userId } });
const secretContext = (userId: string) => `mfa:totp:${userId}`;

export type SecondFactor = { code: string } | { recoveryCode: string };

/**
 * TOTP second factor + recovery codes (SPEC-009 §8.2). Secrets are envelope-encrypted
 * (SecretsService), recovery codes stored as keyed hashes, codes are single-use (TOTP: step replay
 * guard; recovery: `used_at`). Enrolment and removal revoke the user's other sessions (FR-SEC-055).
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger('Mfa');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly secrets: SecretsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly mail: IdentityMailService,
    private readonly rateLimits: RateLimitService,
  ) {}

  private recoveryHash(userId: string, code: string): string {
    return createHmac('sha256', this.config.env.BETTER_AUTH_SECRET)
      .update(`recovery:${userId}:${normalizeRecoveryCode(code)}`)
      .digest('base64url');
  }

  async hasActiveTotp(userId: string): Promise<boolean> {
    return (
      (await this.prisma.mfaFactor.count({ where: { userId, type: 'totp', status: 'active' } })) > 0
    );
  }

  async status(auth: RequestAuth): Promise<MfaStatus> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId: auth.userId, type: 'totp', status: 'active' },
    });
    const remaining = await this.prisma.mfaRecoveryCode.count({
      where: { userId: auth.userId, usedAt: null },
    });
    return {
      totpEnabled: !!factor,
      totpConfirmedAt: factor?.confirmedAt?.toISOString() ?? null,
      recoveryCodesRemaining: factor ? remaining : 0,
      sessionMfaVerified: auth.assurance === 'mfa_verified',
    };
  }

  async setup(userId: string): Promise<TotpSetupResponse> {
    if (await this.hasActiveTotp(userId))
      throw AppError.conflict('Two-step verification is already on', { reason: 'already_enabled' });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = generateTotpSecret();
    const ciphertext = this.secrets.encrypt(secret, secretContext(userId));
    await this.prisma.mfaFactor.upsert({
      where: { userId_type: { userId, type: 'totp' } },
      update: {
        status: 'pending',
        secretCiphertext: ciphertext,
        lastUsedStep: null,
        confirmedAt: null,
      },
      create: {
        id: newId(),
        userId,
        type: 'totp',
        status: 'pending',
        secretCiphertext: ciphertext,
      },
    });
    return { secret, otpauthUri: otpauthUri(this.config.env.MFA_ISSUER, user.email, secret) };
  }

  /** Confirms enrolment with a first code; returns the recovery codes (shown once). */
  async confirm(auth: RequestAuth, code: string): Promise<string[]> {
    const factor = await this.prisma.mfaFactor.findFirst({
      where: { userId: auth.userId, type: 'totp', status: 'pending' },
    });
    if (!factor) throw AppError.conflict('Start the setup first', { reason: 'no_pending_setup' });
    await this.rateLimits.enforce([{ rule: MfaRateLimits.codeUser, subject: auth.userId }]);
    const step = verifyTotp(
      this.secrets.decrypt(factor.secretCiphertext, secretContext(auth.userId)),
      code,
    );
    if (step === null) throw this.invalidCode();

    const codes = generateRecoveryCodes();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaFactor.update({
        where: { id: factor.id },
        data: { status: 'active', confirmedAt: now, lastUsedStep: BigInt(step) },
      });
      await this.replaceRecoveryCodes(tx, auth.userId, codes);
      await tx.session.update({
        where: { id: auth.sessionId },
        data: { authAssurance: 'mfa_verified', mfaVerifiedAt: now, stepUpAt: now },
      });
      const revoked = await this.revokeOtherSessions(tx, auth);
      await this.audit.record(
        {
          eventType: 'identity.mfa.enabled',
          action: 'mfa.enroll',
          outcome: 'success',
          resourceType: 'user',
          resourceId: auth.userId,
          metadata: { method: 'totp', otherSessionsRevoked: revoked },
        },
        tx,
        asUser(auth.userId),
      );
      await this.outbox.append(
        tx,
        MfaEnabledEvent,
        { userId: auth.userId, method: 'totp' },
        asUser(auth.userId),
      );
    });
    await this.notify(auth.userId, { kind: 'mfa_enabled' });
    return codes;
  }

  /** Needs the password and a current code — never only an email link (FR-SEC-039). */
  async disable(auth: RequestAuth, password: string, code: string): Promise<void> {
    await this.rateLimits.enforce([{ rule: MfaRateLimits.codeUser, subject: auth.userId }]);
    if (!(await this.checkPassword(auth.userId, password))) {
      await this.auditDenied(auth.userId, 'mfa.disable', 'invalid_password');
      throw new AppError('VALIDATION_FAILED', 'Password is incorrect', {
        issues: [{ path: 'password', message: 'Password is incorrect', code: 'invalid' }],
      });
    }
    await this.verifySecondFactor(auth.userId, { code }, { allowRecovery: false });
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaFactor.deleteMany({ where: { userId: auth.userId, type: 'totp' } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: auth.userId } });
      await tx.session.update({
        where: { id: auth.sessionId },
        data: { authAssurance: 'password', mfaVerifiedAt: null },
      });
      const revoked = await this.revokeOtherSessions(tx, auth);
      await this.audit.record(
        {
          eventType: 'identity.mfa.disabled',
          action: 'mfa.remove',
          outcome: 'success',
          resourceType: 'user',
          resourceId: auth.userId,
          metadata: { method: 'totp', otherSessionsRevoked: revoked },
        },
        tx,
        asUser(auth.userId),
      );
      await this.outbox.append(
        tx,
        MfaDisabledEvent,
        { userId: auth.userId, method: 'totp' },
        asUser(auth.userId),
      );
    });
    await this.notify(auth.userId, { kind: 'mfa_disabled' });
  }

  /** New recovery codes; the old ones stop working. Requires a recent step-up. */
  async regenerateRecoveryCodes(auth: RequestAuth): Promise<string[]> {
    if (!(await this.hasActiveTotp(auth.userId)))
      throw AppError.conflict('Turn on two-step verification first', { reason: 'not_enabled' });
    this.assertRecentStepUp(auth, DEFAULT_STEP_UP_MAX_AGE_MIN);
    const codes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await this.replaceRecoveryCodes(tx, auth.userId, codes);
      await this.audit.record(
        {
          eventType: 'identity.mfa.recovery_codes_regenerated',
          action: 'mfa.recovery_codes.regenerate',
          outcome: 'success',
          resourceType: 'user',
          resourceId: auth.userId,
        },
        tx,
        asUser(auth.userId),
      );
      await this.outbox.append(
        tx,
        RecoveryCodesRegeneratedEvent,
        { userId: auth.userId },
        asUser(auth.userId),
      );
    });
    await this.notify(auth.userId, { kind: 'recovery_codes_regenerated' });
    return codes;
  }

  /**
   * Checks a TOTP code (or, when allowed, a recovery code) and consumes it. Throws
   * MFA_CODE_INVALID. Returns the method used and, for recovery codes, how many remain.
   */
  async verifySecondFactor(
    userId: string,
    input: SecondFactor,
    options: { allowRecovery: boolean } = { allowRecovery: true },
  ): Promise<{ method: 'totp' | 'recovery_code'; remaining?: number }> {
    if ('code' in input) {
      const factor = await this.prisma.mfaFactor.findFirst({
        where: { userId, type: 'totp', status: 'active' },
      });
      if (!factor) throw this.invalidCode();
      const step = verifyTotp(
        this.secrets.decrypt(factor.secretCiphertext, secretContext(userId)),
        input.code,
        { lastUsedStep: factor.lastUsedStep === null ? null : Number(factor.lastUsedStep) },
      );
      if (step === null) {
        await this.auditDenied(userId, 'mfa.verify', 'invalid_code');
        throw this.invalidCode();
      }
      // Compare-and-set so two concurrent requests cannot both use the same step.
      const { count } = await this.prisma.mfaFactor.updateMany({
        where: {
          id: factor.id,
          OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
        },
        data: { lastUsedStep: BigInt(step) },
      });
      if (count !== 1) throw this.invalidCode();
      return { method: 'totp' };
    }
    if (!options.allowRecovery) throw this.invalidCode();
    const { count } = await this.prisma.mfaRecoveryCode.updateMany({
      where: { userId, codeHash: this.recoveryHash(userId, input.recoveryCode), usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) {
      await this.auditDenied(userId, 'mfa.verify', 'invalid_recovery_code');
      throw this.invalidCode();
    }
    const remaining = await this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
    await this.audit.record(
      {
        eventType: 'identity.mfa.recovery_code_used',
        action: 'mfa.recovery_code.use',
        outcome: 'success',
        resourceType: 'user',
        resourceId: userId,
        metadata: { remaining },
      },
      undefined,
      asUser(userId),
    );
    await this.notify(userId, { kind: 'recovery_code_used', remaining });
    return { method: 'recovery_code', remaining };
  }

  async checkPassword(userId: string, password: string): Promise<boolean> {
    const credential = await this.prisma.identityCredential.findFirst({
      where: { userId, providerId: 'credential' },
    });
    return credential?.password ? verifyPassword({ hash: credential.password, password }) : false;
  }

  assertRecentStepUp(auth: RequestAuth, maxAgeMinutes: number): void {
    const fresh = auth.stepUpAt && Date.now() - auth.stepUpAt.getTime() <= maxAgeMinutes * 60_000;
    if (!fresh) {
      throw new AppError('STEP_UP_REQUIRED', 'Confirm it is you to continue', {
        reason: 'stale',
        method: auth.assurance === 'mfa_verified' ? 'totp' : 'password',
        maxAgeMinutes,
      });
    }
  }

  async notify(userId: string, notice: SecurityNotice): Promise<void> {
    try {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await this.mail.sendSecurityNotice(user.email, user.displayName, notice);
    } catch (err) {
      // Delivery failure never undoes the security action (FR-SEC-232).
      this.logger.error({ err, userId, kind: notice.kind }, 'security notice could not be sent');
    }
  }

  private async replaceRecoveryCodes(tx: TxClient, userId: string, codes: string[]): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((c) => ({ id: newId(), userId, codeHash: this.recoveryHash(userId, c) })),
    });
  }

  private async revokeOtherSessions(tx: TxClient, auth: RequestAuth): Promise<number> {
    const { count } = await tx.session.deleteMany({
      where: { userId: auth.userId, id: { not: auth.sessionId } },
    });
    return count;
  }

  private async auditDenied(userId: string, action: string, reasonCode: string): Promise<void> {
    await this.audit.record(
      {
        eventType: 'identity.mfa.verify_failed',
        action,
        outcome: 'denied',
        reasonCode,
        resourceType: 'user',
        resourceId: userId,
      },
      undefined,
      asUser(userId),
    );
  }

  private invalidCode(): AppError {
    return new AppError('MFA_CODE_INVALID', 'That code is not valid. Try the current code.', {
      issues: [{ path: 'code', message: 'Invalid or already used code', code: 'invalid' }],
    });
  }
}
