import { newId } from '@ai-designer/db';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { startTestApp } from '../app-factory.js';
import { TestClient } from '../helpers/http-client.js';
import { findMessages, tokenFromLink, waitForEmail } from '../helpers/mailpit.js';

const PASSWORD = 'correct horse battery staple';
const COOKIE = '__Host-aid_session';

describe('identity: accounts & authentication (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
  });

  beforeEach(async () => {
    const keys = await redis.keys('aid:rl:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
  });

  const newEmail = () => `it-${newId()}@example.com`;

  async function registerAndVerify(client: TestClient, email = newEmail()): Promise<string> {
    expect(
      (
        await client.post('/v1/auth/register', {
          email,
          password: PASSWORD,
          displayName: 'Test User',
        })
      ).status,
    ).toBe(202);
    const mail = await waitForEmail(email, /confirm your email/i);
    const token = tokenFromLink(mail.text, '/verify-email');
    expect((await client.post('/v1/auth/verify-email', { token })).status).toBe(200);
    return email;
  }

  async function signedIn(email?: string): Promise<{ client: TestClient; email: string }> {
    const client = new TestClient(baseUrl);
    const e = await registerAndVerify(client, email);
    expect((await client.post('/v1/auth/login', { email: e, password: PASSWORD })).status).toBe(
      200,
    );
    return { client, email: e };
  }

  it('register → verify → login → /me → logout revokes the session server-side (AC1, AC5)', async () => {
    const client = new TestClient(baseUrl);
    const email = newEmail();
    const reg = await client.post('/v1/auth/register', {
      email: `  ${email.toUpperCase()} `,
      password: PASSWORD,
      displayName: ' Ada ',
    });
    expect(reg.status).toBe(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({
      status: 'pending_verification',
      emailVerified: false,
      displayName: 'Ada',
    });

    const mail = await waitForEmail(email, /confirm your email/i);
    const token = tokenFromLink(mail.text, '/verify-email');
    expect((await client.post('/v1/auth/verify-email', { token })).status).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      status: 'active',
      emailVerified: true,
    });

    const login = await client.post('/v1/auth/login', { email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { user: { email: string } }).user.email).toBe(email);
    const setCookie = login.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`)) ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).not.toMatch(/Domain=/i);
    expect(login.headers.getSetCookie().some((c) => c.startsWith('better-auth.'))).toBe(false);

    const me = await client.get('/v1/me');
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      email,
      displayName: 'Ada',
      status: 'active',
      emailVerified: true,
    });

    const stolenCookie = client.cookieHeader();
    expect((await client.post('/v1/auth/logout')).status).toBe(204);
    expect(client.cookies.has(COOKIE)).toBe(false);
    expect((await client.get('/v1/me', { cookie: stolenCookie })).status).toBe(401);

    const events = await prisma.auditEvent.findMany({
      where: { actorId: user.id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.eventType)).toEqual(
      expect.arrayContaining([
        'identity.user.registered',
        'identity.email.verified',
        'identity.login.success',
        'identity.logout',
      ]),
    );
    const outbox = await prisma.outboxEvent.findMany({
      where: { payload: { path: ['userId'], equals: user.id } },
    });
    expect(outbox.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'identity.user_registered',
        'identity.user_email_verified',
        'identity.session_revoked',
      ]),
    );
  });

  it('stores passwords only as argon2id hashes and tokens only hashed (AC2, AC3)', async () => {
    const { email } = await signedIn();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { credentials: true },
    });
    expect(user.credentials[0]?.password).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user.credentials[0]?.password).not.toContain(PASSWORD);
    await new TestClient(baseUrl).post('/v1/auth/password/forgot', { email });
    const token = tokenFromLink(
      (await waitForEmail(email, /reset your password/i)).text,
      '/reset-password',
    );
    const rows = await prisma.verificationToken.findMany();
    expect(rows.some((r) => r.identifier.includes(token) || r.value.includes(token))).toBe(false);
  });

  it('verification tokens are single-use and expire (AC3, FR-SEC-015)', async () => {
    const client = new TestClient(baseUrl);
    const email = newEmail();
    await client.post('/v1/auth/register', { email, password: PASSWORD, displayName: 'T' });
    const token = tokenFromLink((await waitForEmail(email, /confirm/i)).text, '/verify-email');
    expect((await client.post('/v1/auth/verify-email', { token })).status).toBe(200);
    const replay = await client.post('/v1/auth/verify-email', { token });
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as { error: { code: string } }).error.code).toBe(
      'TOKEN_INVALID_OR_EXPIRED',
    );

    const email2 = newEmail();
    await client.post('/v1/auth/register', { email: email2, password: PASSWORD, displayName: 'T' });
    const token2 = tokenFromLink((await waitForEmail(email2, /confirm/i)).text, '/verify-email');
    const user2 = await prisma.user.findUniqueOrThrow({ where: { email: email2 } });
    await prisma.verificationToken.updateMany({
      where: { value: `email-verification:${user2.id}` },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await client.post('/v1/auth/verify-email', { token: token2 })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: email2 } })).status).toBe(
      'pending_verification',
    );
  });

  it('responses do not reveal whether an email has an account (AC4)', async () => {
    const { email } = await signedIn();
    const client = new TestClient(baseUrl);
    const unknown = newEmail();

    const regExisting = await client.post('/v1/auth/register', {
      email,
      password: PASSWORD,
      displayName: 'X',
    });
    const regNew = await client.post('/v1/auth/register', {
      email: newEmail(),
      password: PASSWORD,
      displayName: 'X',
    });
    expect(regExisting.status).toBe(regNew.status);
    expect(await regExisting.json()).toEqual(await regNew.json());
    await waitForEmail(email, /sign-in help/i); // the real owner is told instead

    const forgotKnown = await client.post('/v1/auth/password/forgot', { email });
    const forgotUnknown = await client.post('/v1/auth/password/forgot', { email: unknown });
    expect(forgotKnown.status).toBe(202);
    expect(await forgotKnown.json()).toEqual(await forgotUnknown.json());
    expect(await findMessages(unknown)).toHaveLength(0);

    const resendKnown = await client.post('/v1/auth/resend-verification', { email });
    const resendUnknown = await client.post('/v1/auth/resend-verification', { email: unknown });
    expect(await resendKnown.json()).toEqual(await resendUnknown.json());

    const wrongPw = await client.post('/v1/auth/login', { email, password: 'wrong password 123' });
    const noUser = await client.post('/v1/auth/login', {
      email: unknown,
      password: 'wrong password 123',
    });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(((await wrongPw.json()) as { error: { message: string } }).error.message).toBe(
      ((await noUser.json()) as { error: { message: string } }).error.message,
    );
  });

  it('unverified accounts cannot sign in; wrong password stays generic', async () => {
    const client = new TestClient(baseUrl);
    const email = newEmail();
    await client.post('/v1/auth/register', { email, password: PASSWORD, displayName: 'T' });
    const unverified = await client.post('/v1/auth/login', { email, password: PASSWORD });
    expect(unverified.status).toBe(403);
    expect(((await unverified.json()) as { error: { code: string } }).error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect(client.cookies.has(COOKIE)).toBe(false);
    expect(
      (await client.post('/v1/auth/login', { email, password: 'not the password' })).status,
    ).toBe(401);
  });

  it('locks after repeated failures; password reset is the escape hatch and revokes sessions (AC7, FR-SEC-044)', async () => {
    const { client: victim, email } = await signedIn();
    const attacker = new TestClient(baseUrl);
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await attacker.post('/v1/auth/login', { email, password: `wrong password ${i}` })).status,
      ).toBe(401);
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(
      (await new TestClient(baseUrl).post('/v1/auth/login', { email, password: PASSWORD })).status,
    ).toBe(401);
    expect(
      await prisma.auditEvent.count({
        where: { actorId: user.id, eventType: 'identity.account.locked' },
      }),
    ).toBe(1);

    await new TestClient(baseUrl).post('/v1/auth/password/forgot', { email });
    const token = tokenFromLink(
      (await waitForEmail(email, /reset your password/i)).text,
      '/reset-password',
    );
    const reset = await new TestClient(baseUrl).post('/v1/auth/password/reset', {
      token,
      newPassword: 'a brand new long password',
    });
    expect(reset.status).toBe(200);
    expect(
      (
        await new TestClient(baseUrl).post('/v1/auth/password/reset', {
          token,
          newPassword: 'another new password!',
        })
      ).status,
    ).toBe(400);

    expect((await victim.get('/v1/me')).status).toBe(401); // all sessions revoked
    const after = new TestClient(baseUrl);
    expect((await after.post('/v1/auth/login', { email, password: PASSWORD })).status).toBe(401);
    expect(
      (await after.post('/v1/auth/login', { email, password: 'a brand new long password' })).status,
    ).toBe(200);
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it('change password requires the current one and keeps only the current session', async () => {
    const { client, email } = await signedIn();
    const other = new TestClient(baseUrl);
    expect((await other.post('/v1/auth/login', { email, password: PASSWORD })).status).toBe(200);
    const wrong = await client.post('/v1/auth/password/change', {
      currentPassword: 'nope nope nope',
      newPassword: 'changed password 1234',
    });
    expect(wrong.status).toBe(400);
    const ok = await client.post('/v1/auth/password/change', {
      currentPassword: PASSWORD,
      newPassword: 'changed password 1234',
    });
    expect(ok.status).toBe(204);
    expect((await client.get('/v1/me')).status).toBe(200);
    expect((await other.get('/v1/me')).status).toBe(401);
  });

  it('suspended accounts cannot authenticate and lose existing sessions (FR-SEC-005)', async () => {
    const { client, email } = await signedIn();
    await prisma.user.update({ where: { email }, data: { status: 'suspended' } });
    expect((await client.get('/v1/me')).status).toBe(401);
    const login = await new TestClient(baseUrl).post('/v1/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(login.status).toBe(403);
    expect(((await login.json()) as { error: { code: string } }).error.code).toBe(
      'ACCOUNT_NOT_ACTIVE',
    );
  });

  it('enforces the absolute session timeout (FR-SEC-053)', async () => {
    const { client, email } = await signedIn();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await client.get('/v1/me')).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('blocks cross-site state-changing requests (AC6, CSRF)', async () => {
    const { client } = await signedIn();
    const evil = await client.post('/v1/auth/logout', undefined, {
      origin: 'https://evil.example',
    });
    expect(evil.status).toBe(403);
    expect(((await evil.json()) as { error: { code: string } }).error.code).toBe(
      'PERMISSION_DENIED',
    );
    const noOrigin = await fetch(`${baseUrl}/v1/me`, {
      method: 'PATCH',
      headers: { cookie: client.cookieHeader(), 'content-type': 'application/json' },
      body: '{"displayName":"x"}',
    });
    expect(noOrigin.status).toBe(403);
    const sameOrigin = await fetch(`${baseUrl}/v1/me`, {
      method: 'PATCH',
      headers: {
        cookie: client.cookieHeader(),
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: '{"displayName":"Renamed"}',
    });
    expect(sameOrigin.status).toBe(200);
    expect((await client.get('/v1/me')).status).toBe(200); // session survived
  });

  it('rate-limits auth endpoints with 429 + Retry-After (AC7)', async () => {
    const client = new TestClient(baseUrl);
    const email = newEmail();
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 4; i += 1) {
      last = await client.post('/v1/auth/password/forgot', { email });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(((await last?.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('requires a session for /me and validates input', async () => {
    expect((await new TestClient(baseUrl).get('/v1/me')).status).toBe(401);
    const weak = await new TestClient(baseUrl).post('/v1/auth/register', {
      email: newEmail(),
      password: 'short',
      displayName: 'X',
    });
    expect(weak.status).toBe(400);
  });
});
