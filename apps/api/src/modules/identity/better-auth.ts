import { newId, type PrismaClient } from '@ai-designer/db';
import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';

import type { AppConfig } from '../../platform/config/app-config.js';

import { hashIp } from './crypto.js';
import { hashPassword, verifyPassword } from './password-hasher.js';

/** Callbacks into our services; Better Auth calls them at the right moment of each flow. */
export interface AuthHooks {
  onUserCreated(user: { id: string; email: string; displayName: string }): Promise<void>;
  onExistingUserSignUp(user: { id: string; email: string; displayName: string }): Promise<void>;
  sendResetPassword(
    user: { id: string; email: string; displayName: string },
    token: string,
  ): Promise<void>;
  onPasswordReset(user: { id: string; email: string }): Promise<void>;
}

/**
 * Better Auth (ADR-006) used as an in-process library: our NestJS controllers call `auth.api.*`;
 * its own HTTP handler is NOT mounted. We keep routes, error envelope, generic responses, rate
 * limiting, CSRF, audit and outbox in our code. Its models map onto our tables (packages/db).
 */
export function createBetterAuth(prisma: PrismaClient, config: AppConfig, hooks: AuthHooks) {
  const env = config.env;
  const idleSeconds = env.SESSION_IDLE_TIMEOUT_MIN * 60;
  const absoluteMs = env.SESSION_ABSOLUTE_TIMEOUT_H * 3_600_000;

  const logger = new Logger('BetterAuth');
  return betterAuth({
    appName: 'AI Designer',
    // Into our structured logs. Extra args are dropped (they can contain request data).
    logger: {
      level: 'warn',
      log: (level, message) => {
        if (/invalid password/i.test(message))
          logger.debug(message); // expected; audited separately
        else if (level === 'error') logger.error(message);
        else if (level === 'warn') logger.warn(message);
        else logger.log(message);
      },
    },
    baseURL: env.APP_BASE_URL,
    basePath: '/v1/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    trustedOrigins: config.trustedOrigins,
    telemetry: { enabled: false },
    // Our RateLimitService covers every auth route (Redis, per IP + per account).
    rateLimit: { enabled: false },
    user: {
      modelName: 'user',
      fields: { name: 'displayName' },
      additionalFields: {
        status: {
          type: 'string',
          input: false,
          required: false,
          defaultValue: 'pending_verification',
        },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: 'session',
      expiresIn: idleSeconds,
      updateAge: env.SESSION_TOUCH_INTERVAL_MIN * 60,
      cookieCache: { enabled: false },
      additionalFields: {
        absoluteExpiresAt: { type: 'date', input: false, required: false },
        authAssurance: { type: 'string', input: false, required: false, defaultValue: 'password' },
        mfaVerifiedAt: { type: 'date', input: false, required: false },
        stepUpAt: { type: 'date', input: false, required: false },
      },
    },
    account: { modelName: 'identityCredential', accountLinking: { enabled: false } },
    // Reset tokens are stored as SHA-256 hashes, single-use (FR-SEC-012/015/020).
    verification: { modelName: 'verificationToken', storeIdentifier: 'hashed' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        await hooks.sendResetPassword(
          { id: user.id, email: user.email, displayName: user.name },
          token,
        );
      },
      onPasswordReset: async ({ user }) => {
        await hooks.onPasswordReset({ id: user.id, email: user.email });
      },
      onExistingUserSignUp: async ({ user }) => {
        await hooks.onExistingUserSignUp({
          id: user.id,
          email: user.email,
          displayName: user.name,
        });
      },
    },
    // Email verification links are our own single-use hashed tokens (Better Auth's are stateless
    // JWTs that can be replayed until expiry — FR-SEC-015), so its verification sending is off.
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
    },
    advanced: {
      database: { generateId: () => newId() },
      // `__Host-` cookie: Secure, Path=/, no Domain. Better Auth's own `__Secure-` prefixing is off.
      useSecureCookies: false,
      cookies: {
        session_token: {
          name: config.sessionCookieName,
          attributes: {
            secure: env.AUTH_COOKIE_SECURE,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
          },
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await hooks.onUserCreated({ id: user.id, email: user.email, displayName: user.name });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Only active accounts may authenticate (FR-SEC-005).
            const user = await prisma.user.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (user?.status !== 'active') {
              throw new APIError('FORBIDDEN', {
                code: 'ACCOUNT_NOT_ACTIVE',
                message: 'This account cannot sign in',
              });
            }
            return {
              data: {
                ...session,
                ipAddress: hashIp(env.BETTER_AUTH_SECRET, session.ipAddress),
                userAgent: session.userAgent ? session.userAgent.slice(0, 200) : null,
                absoluteExpiresAt: new Date(Date.now() + absoluteMs),
                authAssurance: 'password',
              },
            };
          },
        },
      },
    },
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
