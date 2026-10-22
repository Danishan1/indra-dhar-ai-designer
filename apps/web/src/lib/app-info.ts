export const APP_NAME = 'AI Designer';
export const APP_TAGLINE = 'AI-powered garment design and development';

/** Resolves the public API base URL (I04 replaces this with a typed API client). */
export function apiBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
  return url.replace(/\/+$/, '');
}
