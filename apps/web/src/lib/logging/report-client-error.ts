import type { ClientLogEntry } from './client-log-schema';

const ENDPOINT = '/api/client-logs';
const MAX_REPORTS_PER_PAGE = 20;
let sent = 0;
const seen = new Set<string>();

function describe(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    const digest = 'digest' in error && typeof error.digest === 'string' ? error.digest : undefined;
    return {
      message: error.message || error.name,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(digest ? { digest } : {}),
    };
  }
  return {
    message: typeof error === 'string' ? error : (JSON.stringify(error) ?? 'Unknown error'),
  };
}

/**
 * Sends a browser-side error to the web server, which writes it to logs/web/client.*.log.
 * Best-effort, de-duplicated and capped per page load; never throws.
 */
export function reportClientError(
  error: unknown,
  kind: ClientLogEntry['kind'],
  level: ClientLogEntry['level'] = 'error',
): void {
  try {
    if (typeof window === 'undefined' || sent >= MAX_REPORTS_PER_PAGE) return;
    const details = describe(error);
    const key = `${kind}:${details.message}:${details.stack?.slice(0, 200) ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;
    const entry: ClientLogEntry = {
      level,
      kind,
      ...details,
      message: details.message.slice(0, 2_000),
      ...(details.stack ? { stack: details.stack.slice(0, 8_000) } : {}),
      url: window.location.href.slice(0, 2_000),
      userAgent: navigator.userAgent.slice(0, 500),
      occurredAt: new Date().toISOString(),
    };
    const body = JSON.stringify(entry);
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      void fetch(ENDPOINT, {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // Reporting must never break the page.
  }
}
