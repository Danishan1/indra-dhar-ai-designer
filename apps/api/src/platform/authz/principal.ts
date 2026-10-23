import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

/** The signed-in user's id; valid behind any non-public authorization declaration. */
export function currentUserId(): string {
  const principal = RequestContext.require().principal;
  if (principal.type !== 'human' || !principal.id)
    throw new AppError('UNAUTHENTICATED', 'Sign in to continue');
  return principal.id;
}
