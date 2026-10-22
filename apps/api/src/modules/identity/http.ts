import type { Request, Response } from 'express';

/** Converts an Express request into Fetch headers for Better Auth (cookie, UA, client IP). */
export function toFetchHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const name of ['cookie', 'user-agent', 'origin', 'referer']) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  // `req.ip` already honours the API's trust-proxy setting; Better Auth reads x-forwarded-for.
  if (req.ip) headers.set('x-forwarded-for', req.ip);
  return headers;
}

/** Copies Better Auth's Set-Cookie headers (session cookie issue/refresh/clear) to the response. */
export function forwardSetCookies(from: Headers | null | undefined, res: Response): void {
  const cookies = from?.getSetCookie() ?? [];
  for (const cookie of cookies) res.append('Set-Cookie', cookie);
}

/** Removes Better Auth helper cookies we never use (session_data, dont_remember) from a response. */
export function onlySessionCookies(from: Headers, sessionCookieName: string): Headers {
  const filtered = new Headers();
  for (const cookie of from.getSetCookie()) {
    if (cookie.startsWith(`${sessionCookieName}=`)) filtered.append('Set-Cookie', cookie);
  }
  return filtered;
}
