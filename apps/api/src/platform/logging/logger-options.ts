import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Options as PinoHttpOptions } from 'pino-http';

import type { AppConfig } from '../config/app-config.js';

/**
 * Paths whose values must never appear in logs (TECH-GDP-001 §3.11, SPEC-009 FR-SEC-174/181).
 * pino wildcards match one level; list deeper variants explicitly where needed.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.apiKey',
  '*.secret',
  '*.secretAccessKey',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.*.password',
  '*.*.apiKey',
  '*.*.secret',
  '*.*.token',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Accepts an inbound X-Request-Id only if it is a UUID; otherwise generates one. */
export function resolveRequestId(inbound: string | string[] | undefined): string {
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  return value && UUID_RE.test(value) ? value.toLowerCase() : randomUUID();
}

export function buildPinoHttpOptions(config: AppConfig): PinoHttpOptions {
  return {
    level: config.env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const id = resolveRequestId(req.headers['x-request-id']);
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
    base: { service: 'api', version: config.env.APP_VERSION },
    ...(config.env.LOG_PRETTY
      ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
      : {}),
  };
}
