import { type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp } from '../../../test/integration/app-factory.js';

describe('health endpoints (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health is live and echoes a valid X-Request-Id', async () => {
    const requestId = '0192f2a4-7c1e-7d3a-8b2f-1a2b3c4d5e6f';
    const res = await fetch(`${baseUrl}/v1/health`, { headers: { 'X-Request-Id': requestId } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe(requestId);
    expect(await res.json()).toMatchObject({ status: 'ok', service: 'api' });
  });

  it('generates a request id when none is supplied', async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /v1/health/ready reports every dependency ok', async () => {
    const res = await fetch(`${baseUrl}/v1/health/ready`);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok', objectStorage: 'ok' },
    });
  });

  it('readiness does not leak hostnames or credentials', async () => {
    const text = await (await fetch(`${baseUrl}/v1/health/ready`)).text();
    expect(text).not.toMatch(/localhost|5543|aid_test_password|secret/i);
  });
});

describe('health readiness when Redis is unreachable (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp({ REDIS_URL: 'redis://localhost:6399' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 503 degraded with redis down', async () => {
    const res = await fetch(`${baseUrl}/v1/health/ready`);
    const body = (await res.json()) as { status: string; checks: Record<string, string> };
    expect(res.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.checks.redis).toBe('down');
    expect(body.checks.database).toBe('ok');
  });
});
