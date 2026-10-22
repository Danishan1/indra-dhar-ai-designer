import { livenessSchema, readinessSchema } from '@ai-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './client';
import { ApiError, friendlyMessage } from './errors';

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fn = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('apiRequest', () => {
  it('sends credentials, a request id and parses the response with the contract schema', async () => {
    const fetchMock = mockFetch(200, {
      status: 'ok',
      service: 'api',
      version: '1.0.0',
      time: 'now',
    });
    const result = await apiRequest('/v1/health', { schema: livenessSchema });
    expect(result.version).toBe('1.0.0');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('turns the error envelope into an ApiError with code and request id', async () => {
    mockFetch(409, {
      error: { code: 'IDEMPOTENCY_CONFLICT', message: 'used', requestId: 'req-123' },
    });
    const err = await apiRequest('/v1/x', {
      method: 'POST',
      body: { a: 1 },
      idempotencyKey: 'k',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      status: 409,
      requestId: 'req-123',
      isClientError: true,
    });
  });

  it('sends the Idempotency-Key header for retry-safe mutations', async () => {
    const fetchMock = mockFetch(201, {});
    await apiRequest('/v1/x', { method: 'POST', body: {}, idempotencyKey: 'key-1' });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('maps non-envelope failures by status and keeps the response request id', async () => {
    mockFetch(502, 'Bad gateway', { 'x-request-id': 'gw-1' });
    await expect(apiRequest('/v1/x')).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 502,
      requestId: 'gw-1',
    });
  });

  it('reports network failures as DEPENDENCY_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(apiRequest('/v1/x')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      status: 0,
    });
  });

  it('accepts listed non-2xx statuses as normal responses (readiness 503)', async () => {
    const body = {
      status: 'degraded',
      checks: { database: 'down', redis: 'ok', objectStorage: 'ok' },
      time: 't',
    };
    mockFetch(503, body);
    await expect(
      apiRequest('/v1/health/ready', { schema: readinessSchema, acceptStatuses: [503] }),
    ).resolves.toEqual(body);
  });

  it('rejects responses that violate the contract', async () => {
    mockFetch(200, { status: 'weird' });
    await expect(apiRequest('/v1/health', { schema: livenessSchema })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });

  it('has a friendly message for every code', () => {
    expect(friendlyMessage('CONCURRENT_MODIFICATION')).toMatch(/someone else/i);
    expect(friendlyMessage('NOT_FOUND')).not.toMatch(/forbidden|tenant/i);
  });
});
