import { freshTotpCode, TestClient, totpCode } from '@ai-designer/test-utils';
import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { startTestApp } from '../integration/app-factory.js';
import { newEmail, signedInUser, TEST_PASSWORD } from '../integration/helpers/accounts.js';
import { findMessages, waitForEmail } from '../integration/helpers/mailpit.js';

import { clearRateLimits, json } from './fixtures.js';

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

/** I08: MFA, two-phase login, step-up, sessions, org policy, audit search (TR-SEC-002/013/023). */
describe('MFA, step-up, sessions & audit', { timeout: 120_000 }, () => {
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
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (email: string, userAgent?: string) => {
    const client = new TestClient(baseUrl);
    const headers = userAgent ? { 'user-agent': userAgent } : undefined;
    return {
      client,
      res: client.post('/v1/auth/login', { email, password: TEST_PASSWORD }, headers),
    };
  };

  async function orgFor(client: TestClient, name = 'MFA Co') {
    const res = await client.post('/v1/orgs', { name });
    expect(res.status).toBe(201);
    return json<{ id: string; name: string; membership: { id: string } }>(res);
  }

  it('an enrolled user gets no usable session without the second factor (TR-SEC-002)', async () => {
    const user = await signedInUser(baseUrl, newEmail('mfa'));
    const secret = user.totpSecret ?? '';
    const { client, res } = login(user.email);
    expect(await json<{ status: string }>(await res)).toEqual({
      status: 'mfa_required',
      methods: ['totp', 'recovery_code'],
    });
    // The pending session grants nothing.
    expect((await client.get('/v1/me')).status).toBe(401);
    expect((await client.get('/v1/orgs')).status).toBe(401);
    expect((await client.get('/v1/me/sessions')).status).toBe(401);

    const wrong = await client.post('/v1/auth/mfa/verify', { code: '000000' });
    expect(wrong.status).toBe(400);
    expect((await errorOf(wrong)).code).toBe('MFA_CODE_INVALID');

    const code = await freshTotpCode(secret, totpCode(secret)); // the enrolment used this step
    const ok = await client.post('/v1/auth/mfa/verify', { code });
    expect(ok.status).toBe(200);
    expect((await json<{ status: string }>(ok)).status).toBe('authenticated');
    expect((await client.get('/v1/me')).status).toBe(200);

    // The same code cannot be replayed for another sign-in.
    const again = login(user.email);
    await again.res;
    expect((await again.client.post('/v1/auth/mfa/verify', { code })).status).toBe(400);
  });

  it('recovery codes work once and are stored hashed; the TOTP secret is encrypted', async () => {
    const user = await signedInUser(baseUrl, newEmail('recovery'));
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: user.email } })).id;
    const factor = await prisma.mfaFactor.findFirstOrThrow({ where: { userId } });
    expect(factor.secretCiphertext).not.toContain(user.totpSecret ?? '');
    const stored = await prisma.mfaRecoveryCode.findMany({ where: { userId } });
    expect(stored).toHaveLength(10);
    const recovery = user.recoveryCodes[0] ?? '';
    for (const row of stored) expect(row.codeHash).not.toContain(recovery.replace('-', ''));

    const first = login(user.email);
    await first.res;
    expect(
      (await first.client.post('/v1/auth/mfa/verify', { recoveryCode: recovery.toUpperCase() }))
        .status,
    ).toBe(200);
    await waitForEmail(user.email, /recovery code was used/i);

    const second = login(user.email);
    await second.res;
    expect(
      (await second.client.post('/v1/auth/mfa/verify', { recoveryCode: recovery })).status,
    ).toBe(400);
  });

  it('disabling needs the password and a current code; it notifies and signs out other sessions', async () => {
    const user = await signedInUser(baseUrl, newEmail('disable'));
    const secret = user.totpSecret ?? '';
    await waitForEmail(user.email, /two-step verification turned on/i);
    const other = login(user.email);
    await other.res;
    const otherCode = await freshTotpCode(secret, totpCode(secret));
    expect((await other.client.post('/v1/auth/mfa/verify', { code: otherCode })).status).toBe(200);
    expect((await other.client.get('/v1/me')).status).toBe(200);

    const badPassword = await user.client.post('/v1/me/mfa/totp/disable', {
      password: 'wrong password!!',
      code: otherCode,
    });
    expect(badPassword.status).toBe(400);
    const off = await user.client.post('/v1/me/mfa/totp/disable', {
      password: TEST_PASSWORD,
      code: await freshTotpCode(secret, otherCode),
    });
    expect(off.status).toBe(204);
    const mail = await waitForEmail(user.email, /two-step verification turned off/i);
    expect(mail.text).not.toContain(secret);
    expect((await other.client.get('/v1/me')).status).toBe(401);
    const { res } = login(user.email);
    expect((await json<{ status: string }>(await res)).status).toBe('authenticated');
  });

  it('privileged actions need MFA; the org policy can require it for everyone (AC-SEC-005)', async () => {
    const plain = await signedInUser(baseUrl, newEmail('nomfa'), 'No MFA', { mfa: false });
    const org = await orgFor(plain.client, 'Plain Co');
    // Non-sensitive access works…
    expect((await plain.client.get(`/v1/orgs/${org.id}/members`)).status).toBe(200);
    // …sensitive actions do not, even for the owner.
    const audit = await plain.client.get(`/v1/orgs/${org.id}/audit-events`);
    expect(audit.status).toBe(403);
    expect((await errorOf(audit)).code).toBe('MFA_REQUIRED');

    const owner = await signedInUser(baseUrl, newEmail('policy-owner'));
    const strict = await orgFor(owner.client, 'Strict Co');
    const policy = await json<{ config: Record<string, unknown> }>(
      await owner.client.get(`/v1/orgs/${strict.id}/security-policy`),
    );
    const put = await owner.client.put(`/v1/orgs/${strict.id}/security-policy`, {
      ...policy.config,
      requireMfa: true,
    });
    expect(put.status).toBe(200);
    // Invite a user without MFA: org access is blocked until they enrol.
    const email = newEmail('strict-member');
    await owner.client.post(`/v1/orgs/${strict.id}/invitations`, { email, role: 'viewer' });
    const { tokenFromLink } = await import('../integration/helpers/mailpit.js');
    const token = tokenFromLink(
      (await waitForEmail(email, /invitation to join/i)).text,
      '/invitations/accept',
    );
    const member = await signedInUser(baseUrl, email, 'Strict Member', { mfa: false });
    expect((await member.client.post('/v1/invitations/accept', { token })).status).toBe(200);
    const blocked = await member.client.get(
      `/v1/orgs/${strict.id}/members/${strict.membership.id}/effective-permissions`,
    );
    expect(blocked.status).toBe(403);
    expect((await errorOf(blocked)).code).toBe('MFA_REQUIRED');
    const mine = await json<{ requireMfa: boolean }>(
      await member.client.get(`/v1/me/permissions?orgId=${strict.id}`),
    );
    expect(mine.requireMfa).toBe(true);
  });

  it('step-up is required when the last verification is too old, and satisfied after re-auth', async () => {
    const owner = await signedInUser(baseUrl, newEmail('stepup'));
    const secret = owner.totpSecret ?? '';
    const org = await orgFor(owner.client, 'Step Co');
    const email = newEmail('stepup-member');
    await owner.client.post(`/v1/orgs/${org.id}/invitations`, { email, role: 'designer' });
    const { tokenFromLink } = await import('../integration/helpers/mailpit.js');
    const token = tokenFromLink(
      (await waitForEmail(email, /invitation to join/i)).text,
      '/invitations/accept',
    );
    const member = await signedInUser(baseUrl, email, 'Step Member', { mfa: false });
    const accepted = await json<{ organization: { membership: { id: string } } }>(
      await member.client.post('/v1/invitations/accept', { token }),
    );

    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })).id;
    await prisma.session.updateMany({
      where: { userId },
      data: { stepUpAt: new Date(Date.now() - 11 * 60_000) },
    });
    const transfer = () =>
      owner.client.post(`/v1/orgs/${org.id}/ownership-transfer`, {
        toMembershipId: accepted.organization.membership.id,
        confirmOrganizationName: org.name,
      });
    const stale = await transfer();
    expect(stale.status).toBe(403);
    expect(await errorOf(stale)).toMatchObject({
      code: 'STEP_UP_REQUIRED',
      details: { maxAgeMinutes: 10 },
    });
    const step = await owner.client.post('/v1/auth/step-up', {
      code: await freshTotpCode(secret, totpCode(secret)),
    });
    expect(step.status).toBe(200);
    expect((await transfer()).status).toBe(204);
    expect(
      await prisma.auditEvent.count({ where: { eventType: 'identity.step_up', actorId: userId } }),
    ).toBe(1);
  });

  it('users list and revoke their sessions; a revoked session is rejected next request (TR-SEC-013)', async () => {
    const user = await signedInUser(baseUrl, newEmail('sessions'), 'Session User', { mfa: false });
    const second = login(
      user.email,
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15',
    );
    expect((await second.res).status).toBe(200);
    const third = login(user.email);
    await third.res;

    const list = await json<{ items: { id: string; current: boolean; deviceLabel: string }[] }>(
      await user.client.get('/v1/me/sessions'),
    );
    expect(list.items).toHaveLength(3);
    expect(list.items.filter((s) => s.current)).toHaveLength(1);
    expect(list.items.map((s) => s.deviceLabel)).toContain('Safari on macOS');

    const secondId = (
      await json<{ items: { id: string; current: boolean }[] }>(
        await second.client.get('/v1/me/sessions'),
      )
    ).items.find((s) => s.current)?.id;
    const current = list.items.find((s) => s.current)?.id ?? '';
    expect((await user.client.request('DELETE', `/v1/me/sessions/${current}`)).status).toBe(409);
    expect((await user.client.request('DELETE', `/v1/me/sessions/${secondId}`)).status).toBe(204);
    expect((await second.client.get('/v1/me')).status).toBe(401);

    // Another user's session id is simply "not found".
    const stranger = await signedInUser(baseUrl, newEmail('stranger'), 'Stranger', { mfa: false });
    expect((await stranger.client.request('DELETE', `/v1/me/sessions/${current}`)).status).toBe(
      404,
    );

    const revoked = await json<{ revoked: number }>(
      await user.client.post('/v1/me/sessions/revoke-others'),
    );
    expect(revoked.revoked).toBe(1);
    expect((await third.client.get('/v1/me')).status).toBe(401);
    expect((await user.client.get('/v1/me')).status).toBe(200);
  });

  it('a sign-in from a new device sends a security notice without secrets', async () => {
    const user = await signedInUser(baseUrl, newEmail('device'), 'Device User', { mfa: false });
    const before = (await findMessages(user.email)).filter((m) => /new sign-in/i.test(m.Subject));
    expect(before).toHaveLength(0);
    await login(user.email, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0').res;
    const mail = await waitForEmail(user.email, /new sign-in/i);
    expect(mail.text).toContain('Firefox on Windows');
    expect(mail.text).not.toMatch(/127\.0\.0\.1|::1/);
  });

  it('audit search is permissioned, org-scoped, filterable, audited and secret-free (AC4, TR-SEC-023)', async () => {
    const owner = await signedInUser(baseUrl, newEmail('auditor'));
    const org = await orgFor(owner.client, 'Audit Co');
    const otherOwner = await signedInUser(baseUrl, newEmail('other-auditor'));
    const other = await orgFor(otherOwner.client, 'Other Audit Co');
    await owner.client.post(`/v1/orgs/${org.id}/invitations`, {
      email: newEmail('a'),
      role: 'viewer',
    });
    await owner.client.post(`/v1/orgs/${org.id}/invitations`, {
      email: newEmail('a'),
      role: 'viewer',
    });

    const all = await json<{
      items: { eventType: string; actor: { displayName: string | null } }[];
      nextCursor: string | null;
    }>(await owner.client.get(`/v1/orgs/${org.id}/audit-events?limit=2`));
    expect(all.items).toHaveLength(2);
    expect(all.nextCursor).not.toBeNull();
    const next = await json<{ items: unknown[] }>(
      await owner.client.get(`/v1/orgs/${org.id}/audit-events?limit=2&cursor=${all.nextCursor}`),
    );
    expect(next.items.length).toBeGreaterThan(0);

    const filtered = await json<{
      items: { eventType: string; actor: { displayName: string | null } }[];
    }>(
      await owner.client.get(`/v1/orgs/${org.id}/audit-events?eventType=organizations.invitation`),
    );
    expect(filtered.items.length).toBeGreaterThan(0);
    for (const e of filtered.items)
      expect(e.eventType.startsWith('organizations.invitation')).toBe(true);
    expect(filtered.items[0]?.actor.displayName).toBe('Test User');

    // Other tenants' events never appear; other tenants cannot search this org (404).
    const scoped = await prisma.auditEvent.count({ where: { organizationId: other.id } });
    expect(scoped).toBeGreaterThan(0);
    const mine = await json<{ items: { id: string }[] }>(
      await owner.client.get(`/v1/orgs/${org.id}/audit-events?limit=100`),
    );
    const otherIds = new Set(
      (
        await prisma.auditEvent.findMany({
          where: { organizationId: other.id },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    expect(mine.items.filter((i) => otherIds.has(i.id))).toEqual([]);
    expect((await otherOwner.client.get(`/v1/orgs/${org.id}/audit-events`)).status).toBe(404);

    // Searching is audited.
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org.id, eventType: 'audit.searched' },
      }),
    ).toBeGreaterThanOrEqual(1);

    // No secret material anywhere in the audit trail.
    const everything = JSON.stringify(
      await prisma.auditEvent.findMany({ select: { metadata: true } }),
    );
    const sessionTokens = (await prisma.session.findMany({ select: { token: true } })).map(
      (s) => s.token,
    );
    for (const needle of [
      TEST_PASSWORD,
      owner.totpSecret ?? '',
      ...owner.recoveryCodes,
      ...sessionTokens,
    ]) {
      expect(everything).not.toContain(needle);
    }
  });
});
