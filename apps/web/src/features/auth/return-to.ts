/**
 * Validates a post-login redirect target: same-origin absolute path only (no scheme, no host,
 * no protocol-relative `//`, no backslash tricks). Anything else falls back to '/'.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Control characters or backslashes can be normalized by browsers into another host.
  if (value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 0x20)) return fallback;
  try {
    const url = new URL(value, 'http://same-origin.invalid');
    if (url.origin !== 'http://same-origin.invalid') return fallback;
    if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function signInUrl(returnTo: string): string {
  const safe = safeReturnTo(returnTo);
  return safe === '/' ? '/sign-in' : `/sign-in?returnTo=${encodeURIComponent(safe)}`;
}
