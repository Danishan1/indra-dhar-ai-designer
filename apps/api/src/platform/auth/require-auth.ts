import {
  applyDecorators,
  type CanActivate,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';

import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

export const AUTH_METADATA = 'aid:auth';

/** Denies anonymous callers (UNAUTHENTICATED 401). I07 adds permission checks on top. */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(): boolean {
    const principal = RequestContext.get()?.principal;
    if (!principal || principal.type === 'anonymous') {
      throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
    }
    return true;
  }
}

/** Route requires a signed-in user (session cookie). Documented in OpenAPI as `sessionCookie`. */
export function RequireAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(AUTH_METADATA, 'session'), UseGuards(AuthenticatedGuard));
}

/** The signed-in user's id; only valid behind @RequireAuth(). */
export function currentUserId(): string {
  const principal = RequestContext.require().principal;
  if (principal.type !== 'human' || !principal.id)
    throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
  return principal.id;
}
