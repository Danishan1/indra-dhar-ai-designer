import { errorEnvelopeSchema } from '@ai-designer/contracts';
import type { z } from 'zod';

import { ApiError } from './errors';

export interface ApiRequestOptions<S extends z.ZodType | undefined> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Response schema from packages/contracts; the response is parsed (and typed) with it. */
  schema?: S;
  /** Mutations that may be retried send an Idempotency-Key (SPEC-006 API-004). */
  idempotencyKey?: string;
  /** Non-2xx statuses whose body is a normal response, e.g. 503 from /v1/health/ready. */
  acceptStatuses?: readonly number[];
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type Result<S> = S extends z.ZodType ? z.output<S> : unknown;

/**
 * Base URL: same-origin `/v1/*` — Next.js rewrites it to the API in development (next.config.ts),
 * so cookies are first-party (I05). Server-side callers must pass an absolute base.
 */
let baseUrl = '';
export function setApiBaseUrl(url: string): void {
  baseUrl = url.replace(/\/$/, '');
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Typed fetch for the AI Designer API. Sends credentials and an X-Request-Id, turns the error
 * envelope into an `ApiError` (code + requestId), and validates successful responses with zod.
 */
export async function apiRequest<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: ApiRequestOptions<S> = {},
): Promise<Result<S>> {
  const requestId = newRequestId();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': requestId,
    ...options.headers,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('DEPENDENCY_UNAVAILABLE', 'Cannot reach the server', 0, requestId);
  }

  const responseRequestId = response.headers.get('x-request-id') ?? requestId;
  const text = await response.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!response.ok && !options.acceptStatuses?.includes(response.status)) {
    const envelope = errorEnvelopeSchema.safeParse(json);
    if (envelope.success) {
      const { code, message, details, requestId: rid } = envelope.data.error;
      throw new ApiError(code, message, response.status, rid, details);
    }
    const code =
      response.status >= 500
        ? 'INTERNAL_ERROR'
        : response.status === 404
          ? 'NOT_FOUND'
          : 'VALIDATION_FAILED';
    throw new ApiError(
      code,
      `Request failed with status ${response.status}`,
      response.status,
      responseRequestId,
    );
  }

  if (!options.schema) return json as Result<S>;
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      'INTERNAL_ERROR',
      'Unexpected response from the server',
      response.status,
      responseRequestId,
      {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    );
  }
  return parsed.data as Result<S>;
}
