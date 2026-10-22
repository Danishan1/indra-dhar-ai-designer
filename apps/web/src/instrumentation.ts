import type { Instrumentation } from 'next';

/** Next.js server instrumentation: initialises file logging (logs/web/server.*.log). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getWebLogger } = await import('./lib/logging/server-logger');
  const logger = await getWebLogger('server');
  logger.info({ pid: process.pid }, 'web server started');
}

/** Captures server-side request errors (RSC render, route handlers, server actions). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { getWebLogger } = await import('./lib/logging/server-logger');
  const logger = await getWebLogger('server');
  const error = err instanceof Error ? err : new Error(String(err));
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;
  // Only path/method/route context — never request headers (cookies, auth).
  logger.error(
    {
      err: error,
      digest,
      request: { path: request.path, method: request.method },
      route: { path: context.routePath, type: context.routeType, router: context.routerKind },
    },
    `request error: ${error.message}`,
  );
};
