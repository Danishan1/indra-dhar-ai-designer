import {
  SessionRevokedEvent,
  UserEmailVerifiedEvent,
  UserPasswordChangedEvent,
  type Me,
} from '@ai-designer/contracts';
import type { WriteMeta } from '@ai-designer/db';
import { Inject, Injectable } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import type { Request, Response } from 'express';

import { AuditService } from '../../platform/audit/audit.service.js';
import { AppConfig } from '../../platform/config/app-config.js';
import { AppError } from '../../platform/errors/app-error.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';
import {
  type RateLimitRule,
  RateLimitService,
} from '../../platform/rate-limit/rate-limit.service.js';

import { AccountService } from './account.service.js';
import type { BetterAuthInstance } from './better-auth.js';
import { BETTER_AUTH } from './better-auth.provider.js';
import { emailRef } from './crypto.js';
import { forwardSetCookies, onlySessionCookies, toFetchHeaders } from './http.js';
import { IdentityMailService } from './identity-mail.service.js';
import { hashPassword, needsRehash } from './password-hasher.js';
import {
  EMAIL_VERIFICATION_TTL_MS,
  VerificationTokenService,
} from './verification-token.service.js';
import './request-auth.js';

const minutes = (n: number) => n * 60;
/** Rate limits per route (FR-SEC-041/042). Per-IP limits are looser than per-account ones. */
export const AuthRateLimits = {
  registerIp: { name: 'auth.register.ip', limit: 10, windowSeconds: minutes(60) },
  registerEmail: { name: 'auth.register.email', limit: 3, windowSeconds: minutes(60) },
  loginIp: { name: 'auth.login.ip', limit: 50, windowSeconds: minutes(15) },
  loginEmail: { name: 'auth.login.email', limit: 10, windowSeconds: minutes(15) },
  verifyIp: { name: 'auth.verify.ip', limit: 20, windowSeconds: minutes(60) },
  resendEmail: { name: 'auth.resend.email', limit: 3, windowSeconds: minutes(60) },
  resendIp: { name: 'auth.resend.ip', limit: 10, windowSeconds: minutes(60) },
  forgotEmail: { name: 'auth.forgot.email', limit: 3, windowSeconds: minutes(60) },
  forgotIp: { name: 'auth.forgot.ip', limit: 10, windowSeconds: minutes(60) },
  resetIp: { name: 'auth.reset.ip', limit: 20, windowSeconds: minutes(60) },
  changeUser: { name: 'auth.change.user', limit: 10, windowSeconds: minutes(15) },
} satisfies Record<string, RateLimitRule>;

export const GENERIC_LOGIN_FAILURE =
  'Incorrect email or password, or the account is temporarily locked.';

const asUser = (userId: string): Partial<WriteMeta> => ({ actor: { type: 'human', id: userId } });

function apiErrorCode(err: unknown): string | undefined {
  if (!(err instanceof APIError)) return undefined;
  const body = err.body as { code?: unknown } | undefined;
  return typeof body?.code === 'string' ? body.code : undefined;
}

/**
 * Authentication flows (SPEC-009 §7–9) on top of Better Auth. Responses never reveal whether an
 * account exists (FR-SEC-014/024); every outcome is audited (§15.1).
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
    private readonly tokens: VerificationTokenService,
    private readonly mail: IdentityMailService,
    private readonly rateLimits: RateLimitService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  private ip(req: Request): string {
    return req.ip ?? 'unknown';
  }

  async register(
    input: { email: string; password: string; displayName: string },
    req: Request,
  ): Promise<void> {
    await this.rateLimits.enforce([
      { rule: AuthRateLimits.registerIp, subject: this.ip(req) },
      { rule: AuthRateLimits.registerEmail, subject: input.email },
    ]);
    try {
      // New address → user + verification email (hook); existing → notice email; same response.
      await this.auth.api.signUpEmail({
        body: { email: input.email, password: input.password, name: input.displayName },
        headers: toFetchHeaders(req),
      });
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG') {
        throw new AppError('VALIDATION_FAILED', 'Password does not meet the policy', {
          issues: [{ path: 'password', message: 'Use 12–128 characters', code: 'policy' }],
        });
      }
      throw err;
    }
  }

  async verifyEmail(token: string, req: Request): Promise<void> {
    await this.rateLimits.enforce([{ rule: AuthRateLimits.verifyIp, subject: this.ip(req) }]);
    const userId = await this.tokens.consume('email-verification', token);
    if (!userId)
      throw new AppError(
        'TOKEN_INVALID_OR_EXPIRED',
        'This link is invalid or has expired. Request a new one.',
      );
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: 'pending_verification' },
        data: { status: 'active', emailVerified: true, emailVerifiedAt: new Date() },
      });
      if (count === 0) return; // already verified (e.g. via password reset)
      await this.audit.record(
        {
          eventType: 'identity.email.verified',
          action: 'email.verify',
          outcome: 'success',
          resourceType: 'user',
          resourceId: userId,
        },
        tx,
        asUser(userId),
      );
      await this.outbox.append(tx, UserEmailVerifiedEvent, { userId }, asUser(userId));
    });
  }

  async resendVerification(email: string, req: Request): Promise<void> {
    await this.rateLimits.enforce([
      { rule: AuthRateLimits.resendIp, subject: this.ip(req) },
      { rule: AuthRateLimits.resendEmail, subject: email },
    ]);
    const user = await this.accounts.findByEmail(email);
    if (!user || user.status !== 'pending_verification') return;
    const token = await this.tokens.issue('email-verification', user.id, EMAIL_VERIFICATION_TTL_MS);
    await this.mail.sendVerification(user.email, user.displayName, token).catch(() => undefined);
  }

  async login(
    input: { email: string; password: string },
    req: Request,
    res: Response,
  ): Promise<Me> {
    await this.rateLimits.enforce([
      { rule: AuthRateLimits.loginIp, subject: this.ip(req) },
      { rule: AuthRateLimits.loginEmail, subject: input.email },
    ]);
    const user = await this.accounts.findByEmail(input.email);
    const failureMeta = (reasonCode: string, extra: Record<string, unknown> = {}) => ({
      eventType: 'identity.login.failure',
      action: 'session.create',
      outcome: 'denied' as const,
      reasonCode,
      ...(user ? { resourceType: 'user', resourceId: user.id } : {}),
      metadata: { emailRef: emailRef(this.config.env.BETTER_AUTH_SECRET, input.email), ...extra },
    });

    if (user && this.accounts.isLocked(user)) {
      await hashPassword(input.password); // same cost as a real attempt (timing)
      await this.audit.record(failureMeta('locked'), undefined, asUser(user.id));
      throw new AppError('UNAUTHENTICATED', GENERIC_LOGIN_FAILURE);
    }

    let userId: string;
    let setCookies: Headers;
    try {
      const result = await this.auth.api.signInEmail({
        body: { email: input.email, password: input.password, rememberMe: true },
        headers: toFetchHeaders(req),
        returnHeaders: true,
      });
      userId = result.response.user.id;
      setCookies = result.headers;
    } catch (err) {
      const code = apiErrorCode(err);
      if (code === 'EMAIL_NOT_VERIFIED') {
        await this.audit.record(
          failureMeta('email_not_verified'),
          undefined,
          user ? asUser(user.id) : {},
        );
        throw new AppError(
          'EMAIL_NOT_VERIFIED',
          'Confirm your email address first. We can send you a new link.',
        );
      }
      if (code === 'ACCOUNT_NOT_ACTIVE') {
        await this.audit.record(
          failureMeta('account_not_active', { status: user?.status }),
          undefined,
          user ? asUser(user.id) : {},
        );
        throw new AppError(
          'ACCOUNT_NOT_ACTIVE',
          'This account cannot sign in. Contact support if you think this is a mistake.',
        );
      }
      if (err instanceof APIError && err.statusCode === 401) {
        const lockedNow = user ? await this.accounts.recordFailedLogin(user.id) : false;
        await this.audit.record(
          failureMeta('invalid_credentials', { lockout: lockedNow }),
          undefined,
          user ? asUser(user.id) : {},
        );
        if (lockedNow && user) {
          await this.audit.record(
            {
              eventType: 'identity.account.locked',
              action: 'account.lock',
              outcome: 'success',
              resourceType: 'user',
              resourceId: user.id,
              reasonCode: 'too_many_failures',
              metadata: { minutes: this.config.env.AUTH_LOCKOUT_MINUTES },
            },
            undefined,
            asUser(user.id),
          );
        }
        throw new AppError('UNAUTHENTICATED', GENERIC_LOGIN_FAILURE);
      }
      throw err;
    }

    forwardSetCookies(onlySessionCookies(setCookies, this.config.sessionCookieName), res);
    await this.accounts.recordSuccessfulLogin(userId);
    await this.rehashIfNeeded(userId, input.password);
    await this.audit.record(
      {
        eventType: 'identity.login.success',
        action: 'session.create',
        outcome: 'success',
        resourceType: 'user',
        resourceId: userId,
      },
      undefined,
      asUser(userId),
    );
    return this.accounts.getMe(userId);
  }

  /** Upgrades the stored hash when the argon2 baseline was raised (task I05-3). */
  private async rehashIfNeeded(userId: string, password: string): Promise<void> {
    const credential = await this.prisma.identityCredential.findFirst({
      where: { userId, providerId: 'credential' },
    });
    if (credential?.password && needsRehash(credential.password)) {
      await this.prisma.identityCredential.update({
        where: { id: credential.id },
        data: { password: await hashPassword(password) },
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    const auth = req.auth;
    const { headers } = await this.auth.api.signOut({
      headers: toFetchHeaders(req),
      returnHeaders: true,
    });
    forwardSetCookies(onlySessionCookies(headers, this.config.sessionCookieName), res);
    if (!auth) return;
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: 'identity.logout',
          action: 'session.revoke',
          outcome: 'success',
          resourceType: 'session',
          resourceId: auth.sessionId,
        },
        tx,
        asUser(auth.userId),
      );
      await this.outbox.append(
        tx,
        SessionRevokedEvent,
        { userId: auth.userId, sessionId: auth.sessionId, reason: 'logout' },
        asUser(auth.userId),
      );
    });
  }

  async forgotPassword(email: string, req: Request): Promise<void> {
    await this.rateLimits.enforce([
      { rule: AuthRateLimits.forgotIp, subject: this.ip(req) },
      { rule: AuthRateLimits.forgotEmail, subject: email },
    ]);
    await this.auth.api.requestPasswordReset({
      body: {
        email,
        redirectTo: new URL('/reset-password', this.config.env.APP_BASE_URL).toString(),
      },
      headers: toFetchHeaders(req),
    });
  }

  async resetPassword(input: { token: string; newPassword: string }, req: Request): Promise<void> {
    await this.rateLimits.enforce([{ rule: AuthRateLimits.resetIp, subject: this.ip(req) }]);
    try {
      await this.auth.api.resetPassword({
        body: { token: input.token, newPassword: input.newPassword },
        headers: toFetchHeaders(req),
      });
    } catch (err) {
      if (apiErrorCode(err) === 'INVALID_TOKEN') {
        throw new AppError(
          'TOKEN_INVALID_OR_EXPIRED',
          'This link is invalid or has expired. Request a new one.',
        );
      }
      throw err;
    }
  }

  async changePassword(
    input: { currentPassword: string; newPassword: string },
    req: Request,
    res: Response,
  ): Promise<void> {
    const auth = req.auth;
    if (!auth) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    await this.rateLimits.enforce([{ rule: AuthRateLimits.changeUser, subject: auth.userId }]);
    let headers: Headers;
    try {
      ({ headers } = await this.auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
        headers: toFetchHeaders(req),
        returnHeaders: true,
      }));
    } catch (err) {
      if (apiErrorCode(err) === 'INVALID_PASSWORD') {
        await this.audit.record(
          {
            eventType: 'identity.password.change',
            action: 'password.change',
            outcome: 'denied',
            reasonCode: 'invalid_current_password',
            resourceType: 'user',
            resourceId: auth.userId,
          },
          undefined,
          asUser(auth.userId),
        );
        throw new AppError('VALIDATION_FAILED', 'Current password is incorrect', {
          issues: [
            { path: 'currentPassword', message: 'Current password is incorrect', code: 'invalid' },
          ],
        });
      }
      throw err;
    }
    forwardSetCookies(onlySessionCookies(headers, this.config.sessionCookieName), res);
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          eventType: 'identity.password.change',
          action: 'password.change',
          outcome: 'success',
          resourceType: 'user',
          resourceId: auth.userId,
          metadata: { otherSessionsRevoked: true },
        },
        tx,
        asUser(auth.userId),
      );
      await this.outbox.append(
        tx,
        UserPasswordChangedEvent,
        { userId: auth.userId, reason: 'change' },
        asUser(auth.userId),
      );
    });
  }

  async me(req: Request): Promise<Me> {
    if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    return this.accounts.getMe(req.auth.userId);
  }
}
