import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AppConfig } from '../../platform/config/app-config.js';
import { RequestContext } from '../../platform/context/request-context.js';
import { PrismaService } from '../../platform/prisma/prisma.service.js';

import type { BetterAuthInstance } from './better-auth.js';
import { BETTER_AUTH } from './better-auth.provider.js';
import { forwardSetCookies, onlySessionCookies, toFetchHeaders } from './http.js';
import '../../platform/auth/request-auth.js';

/** How long a password-only (second factor outstanding) session may wait for the code. */
export const MFA_PENDING_TTL_MS = 10 * 60_000;

/**
 * Resolves the session cookie into `RequestContext.principal` + `req.auth` on every request.
 * Enforces: account must be `active` (FR-SEC-005) and the absolute timeout (FR-SEC-053); the idle
 * timeout is Better Auth's sliding expiry (refreshed cookie forwarded). Invalid sessions are
 * cleared server-side; the request continues anonymously (guards decide what that means).
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Session');

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuthInstance,
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const cookieName = this.config.sessionCookieName;
    if (!req.headers.cookie?.includes(`${cookieName}=`)) {
      next();
      return;
    }
    try {
      const { headers, response } = await this.auth.api.getSession({
        headers: toFetchHeaders(req),
        returnHeaders: true,
      });
      forwardSetCookies(onlySessionCookies(headers, cookieName), res);
      if (response) {
        const { session, user } = response;
        const absolute = (session as { absoluteExpiresAt?: Date | string | null })
          .absoluteExpiresAt;
        const expired = absolute ? new Date(absolute).getTime() <= Date.now() : false;
        if (expired || (user as { status?: string }).status !== 'active') {
          await this.prisma.session.deleteMany({ where: { id: session.id } });
          res.append(
            'Set-Cookie',
            `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${this.config.env.AUTH_COOKIE_SECURE ? '; Secure' : ''}`,
          );
        } else {
          const extra = session as {
            authAssurance?: string | null;
            mfaVerifiedAt?: Date | string | null;
            stepUpAt?: Date | string | null;
            updatedAt?: Date | string;
            createdAt?: Date | string;
          };
          const assurance =
            extra.authAssurance === 'mfa_pending' || extra.authAssurance === 'mfa_verified'
              ? extra.authAssurance
              : 'password';
          const createdAt = new Date(extra.createdAt ?? Date.now());
          const pending = assurance === 'mfa_pending';
          if (pending && Date.now() - createdAt.getTime() > MFA_PENDING_TTL_MS) {
            // Half-finished sign-in left too long: discard it.
            await this.prisma.session.deleteMany({ where: { id: session.id } });
            next();
            return;
          }
          req.auth = {
            userId: user.id,
            sessionId: session.id,
            assurance,
            pending,
            createdAt,
            lastSeenAt: new Date(extra.updatedAt ?? createdAt),
            mfaVerifiedAt: extra.mfaVerifiedAt ? new Date(extra.mfaVerifiedAt) : null,
            stepUpAt: extra.stepUpAt ? new Date(extra.stepUpAt) : null,
          };
          // A session waiting for its second factor is NOT authenticated for anything else.
          if (!pending) RequestContext.patch({ principal: { type: 'human', id: user.id } });
        }
      }
    } catch (err) {
      this.logger.warn({ err }, 'session lookup failed; continuing unauthenticated');
    }
    next();
  }
}
