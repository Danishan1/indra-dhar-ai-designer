import { createHmac } from 'node:crypto';

/** Human label from a user-agent summary: "Chrome on Windows". Never shows IPs. */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|undici|curl|playwright/i.test(ua)
              ? 'Script'
              : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

/** Stable, non-reversible reference for "have we seen this device before?" (audit metadata). */
export function deviceRef(secret: string, userAgent: string | null | undefined): string {
  return createHmac('sha256', secret)
    .update(`device:${deviceLabel(userAgent)}`)
    .digest('base64url')
    .slice(0, 16);
}
