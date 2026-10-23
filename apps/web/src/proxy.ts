import { type NextRequest, NextResponse } from 'next/server';

/** Session cookie names (API: AUTH_COOKIE_SECURE true → __Host- prefixed). */
const SESSION_COOKIES = ['__Host-aid_session', 'aid_session'];

/**
 * Optimistic guard (Next.js 16 "proxy", formerly middleware): requests for app pages without a
 * session cookie go straight to sign-in with `returnTo`. It only checks cookie presence; the
 * client RouteGuard and, above all, the API validate the session (never trust this for authz).
 */
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = '';
  const returnTo = `${pathname}${search}`;
  if (returnTo !== '/') url.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except public auth pages, API/proxy paths, Next internals and static files.
  matcher: [
    '/((?!sign-in|sign-up|verify-email|forgot-password|reset-password|invitations/|v1/|api/|_next/|icon\\.svg|favicon\\.ico|robots\\.txt).*)',
  ],
};
