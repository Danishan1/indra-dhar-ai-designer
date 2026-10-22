import { DevEchoedEvent } from '@ai-designer/contracts';
import {
  appendOutboxEvent,
  nextDisplayId,
  newId,
  recordAuditEvent,
  SYSTEM_ACTOR,
} from '@ai-designer/db';
import { type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { startTestApp } from '../app-factory.js';

describe('platform primitives (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  describe('display ids', () => {
    it('allocates unique, formatted ids under concurrency', async () => {
      const org = newId();
      const ids = await Promise.all(
        Array.from({ length: 40 }, () => nextDisplayId(prisma, org, 'PRJ')),
      );
      expect(new Set(ids).size).toBe(40);
      expect(ids.every((id) => /^PRJ-\d{6}$/.test(id))).toBe(true);
      expect([...ids].sort().at(-1)).toBe('PRJ-000040');
    });

    it('keeps separate sequences per organization', async () => {
      const [a, b] = [newId(), newId()];
      expect(await nextDisplayId(prisma, a, 'DSN')).toBe('DSN-000001');
      expect(await nextDisplayId(prisma, b, 'DSN')).toBe('DSN-000001');
    });
  });

  describe('audit events', () => {
    it('are append-only: UPDATE, DELETE and TRUNCATE are rejected by the database', async () => {
      const id = await recordAuditEvent(
        prisma,
        {
          eventType: 'test',
          action: 'test.check',
          outcome: 'success',
          metadata: { password: 'x', ok: 1 },
        },
        { actor: SYSTEM_ACTOR },
      );
      const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id } });
      expect(row.metadata).toEqual({ password: '[REDACTED]', ok: 1 });
      await expect(
        prisma.auditEvent.update({ where: { id }, data: { action: 'tampered' } }),
      ).rejects.toThrow();
      await expect(prisma.auditEvent.delete({ where: { id } })).rejects.toThrow();
      await expect(prisma.$executeRawUnsafe('TRUNCATE audit_events')).rejects.toThrow();
      expect((await prisma.auditEvent.findUniqueOrThrow({ where: { id } })).action).toBe(
        'test.check',
      );
    });
  });

  describe('outbox', () => {
    it('does not keep an event whose transaction rolled back', async () => {
      let eventId = '';
      await expect(
        prisma.$transaction(async (tx) => {
          eventId = await appendOutboxEvent(
            tx,
            DevEchoedEvent,
            { message: 'rollback' },
            { actor: SYSTEM_ACTOR },
          );
          throw new Error('business failure');
        }),
      ).rejects.toThrow('business failure');
      expect(eventId).not.toBe('');
      expect(await prisma.outboxEvent.findUnique({ where: { id: eventId } })).toBeNull();
    });

    it('rejects payloads that violate the event contract', async () => {
      await expect(
        appendOutboxEvent(
          prisma,
          DevEchoedEvent,
          { message: 'x'.repeat(501) },
          { actor: SYSTEM_ACTOR },
        ),
      ).rejects.toThrow();
    });
  });

  describe('idempotent POST /v1/_dev/echo-idempotent', () => {
    it('executes once and replays the stored response for the same key', async () => {
      const key = `it-${newId()}`;
      const first = await post(
        '/v1/_dev/echo-idempotent',
        { message: 'hello' },
        { 'Idempotency-Key': key },
      );
      const firstBody = (await first.json()) as {
        eventId: string;
        auditId: string;
        job: { id: string; displayId: string };
      };
      expect(first.status).toBe(201);
      expect(firstBody.job.displayId).toMatch(/^JOB-\d{6}$/);

      const second = await post(
        '/v1/_dev/echo-idempotent',
        { message: 'hello' },
        { 'Idempotency-Key': key },
      );
      expect(second.status).toBe(201);
      expect(second.headers.get('idempotent-replayed')).toBe('true');
      expect(await second.json()).toEqual(firstBody);

      expect(await prisma.job.count({ where: { id: firstBody.job.id } })).toBe(1);
      expect(
        await prisma.outboxEvent.count({
          where: { payload: { path: ['jobId'], equals: firstBody.job.id } },
        }),
      ).toBe(1);
      const job = await prisma.job.findUniqueOrThrow({ where: { id: firstBody.job.id } });
      expect(job.status).toBe('queued');
    });

    it('returns 409 IDEMPOTENCY_CONFLICT for the same key with a different body', async () => {
      const key = `it-${newId()}`;
      expect(
        (await post('/v1/_dev/echo-idempotent', { message: 'a' }, { 'Idempotency-Key': key }))
          .status,
      ).toBe(201);
      const conflict = await post(
        '/v1/_dev/echo-idempotent',
        { message: 'b' },
        { 'Idempotency-Key': key },
      );
      expect(conflict.status).toBe(409);
      expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe(
        'IDEMPOTENCY_CONFLICT',
      );
    });

    it('releases the key when the request fails validation, so a corrected retry works', async () => {
      const key = `it-${newId()}`;
      const bad = await post(
        '/v1/_dev/echo-idempotent',
        { message: '' },
        { 'Idempotency-Key': key },
      );
      expect(bad.status).toBe(400);
      const body = (await bad.json()) as {
        error: { code: string; requestId: string; details: { issues: unknown[] } };
      };
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.requestId).toBe(bad.headers.get('x-request-id'));
      expect(body.error.details.issues).toHaveLength(1);
    });
  });

  describe('error envelope', () => {
    it('renders unknown routes, malformed JSON and missing jobs as envelopes', async () => {
      const missing = await fetch(`${baseUrl}/v1/does-not-exist`);
      expect(missing.status).toBe(404);
      expect(((await missing.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');

      const malformed = await fetch(`${baseUrl}/v1/_dev/echo-idempotent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"message":',
      });
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as { error: { code: string } }).error.code).toBe(
        'VALIDATION_FAILED',
      );

      const job = await fetch(`${baseUrl}/v1/_dev/jobs/${newId()}`);
      expect(job.status).toBe(404);
      const badId = await fetch(`${baseUrl}/v1/_dev/jobs/not-a-uuid`);
      expect(badId.status).toBe(400);
    });
  });

  it('serves the OpenAPI document including dev routes', async () => {
    const res = await fetch(`${baseUrl}/v1/openapi.json`);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/v1/health', '/v1/_dev/echo-idempotent']),
    );
  });
});
