import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AppConfig } from '../config/app-config.js';
import { AppError } from '../errors/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for state-changing requests (FR-SEC-049) using Origin / Fetch-Metadata checks:
 * - an `Origin` header must be one of the trusted web origins;
 * - without `Origin`, a request that carries the session cookie must be `Sec-Fetch-Site: same-origin`
 *   (browsers always send one of the two); non-browser clients without cookies are unaffected.
 * Combined with `SameSite=Lax` session cookies.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly trusted: Set<string>;

  constructor(private readonly config: AppConfig) {
    this.trusted = new Set(config.trustedOrigins);
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin !== 'null') {
      if (!this.trusted.has(origin)) {
        next(
          new AppError('PERMISSION_DENIED', 'Cross-site request blocked', {
            reason: 'origin_not_trusted',
          }),
        );
        return;
      }
      next();
      return;
    }
    const hasSession = req.headers.cookie?.includes(`${this.config.sessionCookieName}=`) ?? false;
    const fetchSite = req.headers['sec-fetch-site'];
    if (hasSession && fetchSite !== 'same-origin') {
      next(
        new AppError('PERMISSION_DENIED', 'Cross-site request blocked', {
          reason: 'missing_origin',
        }),
      );
      return;
    }
    next();
  }
}
