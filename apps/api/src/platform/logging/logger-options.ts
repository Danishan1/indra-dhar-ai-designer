import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { baseLoggerOptions } from '@ai-designer/logger';
import type { Options as PinoHttpOptions } from 'pino-http';

import type { AppConfig } from '../config/app-config.js';
import { RequestContext } from '../context/request-context.js';

export { REDACT_PATHS } from '@ai-designer/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accepts an inbound X-Request-Id only if it is a UUID; otherwise generates one. */
export function resolveRequestId(inbound: string | string[] | undefined): string {
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  return value && UUID_RE.test(value) ? value.toLowerCase() : randomUUID();
}

export function buildPinoHttpOptions(config: AppConfig): PinoHttpOptions {
  return {
    ...baseLoggerOptions(config.logSettings, { service: 'api', version: config.env.APP_VERSION }),
    // Adds correlationId/principal/organization from the RequestContext to every log line.
    mixin: () => RequestContext.logFields(),
    genReqId(req: IncomingMessage, res: ServerResponse) {
      // The RequestContext middleware may already have assigned the id (middleware order).
      const existing = (req as IncomingMessage & { id?: unknown }).id;
      const id =
        typeof existing === 'string' ? existing : resolveRequestId(req.headers['x-request-id']);
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customProps(req: IncomingMessage) {
      return { requestId: (req as IncomingMessage & { id?: string }).id };
    },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/v1/health') },
  };
}
