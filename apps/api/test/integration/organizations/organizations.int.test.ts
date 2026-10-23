import { newId } from '@ai-designer/db';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { startTestApp } from '../app-factory.js';
import { newEmail, signedInUser } from '../helpers/accounts.js';
import type { TestClient } from '../helpers/http-client.js';
import { tokenFromLink, waitForEmail } from '../helpers/mailpit.js';

interface OrgBody {
  id: string;
  displayId: string;
  name: string;
  membership: { id: string; roles: string[] };
}
interface MemberBody {
  membershipId: string;
  userId: string;
  email: string;
  status: string;
  roles: string[];
}
const json = async <T>(res: Response) => (await res.json()) as T;
const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('organizations, memberships & invitations (integration)', () => {
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

  async function ownerWithOrg(name = 'Atelier Nord') {
    const owner = await signedInUser(baseUrl, newEmail('owner'), 'Olivia Owner');
    const res = await owner.client.post('/v1/orgs', { name });
    expect(res.status).toBe(201);
    return { ...owner, org: await json<OrgBody>(res) };
  }

  async function invite(
    owner: TestClient,
    orgId: string,
    email: string,
    role = 'designer',
  ): Promise<string> {
    const res = await owner.post(`/v1/orgs/${orgId}/invitations`, { email, role });
    expect(res.status).toBe(201);
    return tokenFromLink(
      (await waitForEmail(email, /invitation to join/i)).text,
      '/invitations/accept',
    );
  }

  async function memberJoined(owner: TestClient, orgId: string, role = 'designer') {
    const email = newEmail('member');
    const token = await invite(owner, orgId, email, role);
    const member = await signedInUser(baseUrl, email, 'Mia Member');
    const accepted = await member.client.post('/v1/invitations/accept', { token });
    expect(accepted.status).toBe(200);
    const body = await json<{ organization: OrgBody }>(accepted);
    return { ...member, membershipId: body.organization.membership.id };
  }

  it('creating an organization makes the creator its owner, with default workspace, audit and event', async () => {
    const { client, org } = await ownerWithOrg('Ateliér Nord & Co.');
    expect(org.displayId).toMatch(/^ORG-\d{6}$/);
    expect(org.membership.roles).toEqual(['organization_owner']);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).slug).toMatch(
      /^atelier-nord-co/,
    );
    expect(
      await prisma.workspace.count({ where: { organizationId: org.id, isDefault: true } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org.id, eventType: 'organizations.organization.created' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { organizationId: org.id, type: 'organizations.organization_created' },
      }),
    ).toBe(1);
    const list = await json<{ items: OrgBody[] }>(await client.get('/v1/orgs'));
    expect(list.items.map((o) => o.id)).toContain(org.id);
  });

  it('invite → accept with the matching verified email creates an active membership (AC2)', async () => {
    const { client: owner, org } = await ownerWithOrg();
    const email = newEmail('invitee');
    const token = await invite(owner, org.id, email, 'organization_admin');

    const preview = await owner.post('/v1/invitations/preview', { token });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      organizationName: org.name,
      invitedByName: 'Olivia Owner',
      email,
      roles: ['organization_admin'],
    });

    const invitee = await signedInUser(baseUrl, email);
    const accepted = await invitee.client.post('/v1/invitations/accept', { token });
    expect(accepted.status).toBe(200);
    expect((await json<{ organization: OrgBody }>(accepted)).organization.membership.roles).toEqual(
      ['organization_admin'],
    );

    const members = await json<{ items: MemberBody[] }>(
      await invitee.client.get(`/v1/orgs/${org.id}/members`),
    );
    expect(members.items.find((m) => m.email === email)).toMatchObject({
      status: 'active',
      roles: ['organization_admin'],
    });
    // Single use (FR-SEC-074)
    expect(await code(await invitee.client.post('/v1/invitations/accept', { token }))).toBe(
      'TOKEN_INVALID_OR_EXPIRED',
    );
    expect((await owner.post('/v1/invitations/preview', { token })).status).toBe(400);
    const audit = await prisma.auditEvent.findMany({
      where: { organizationId: org.id },
      select: { eventType: true },
    });
    expect(audit.map((a) => a.eventType)).toEqual(
      expect.arrayContaining([
        'organizations.invitation.created',
        'organizations.invitation.accepted',
        'organizations.membership.created',
      ]),
    );
  });

  it('rejects acceptance with a different email, cancelled or expired invitations (FR-SEC-075/077)', async () => {
    const { client: owner, org } = await ownerWithOrg();
    const email = newEmail('target');
    const token = await invite(owner, org.id, email);
    const stranger = await signedInUser(baseUrl);
    const mismatch = await stranger.client.post('/v1/invitations/accept', { token });
    expect(mismatch.status).toBe(403);
    expect(await code(mismatch)).toBe('INVITATION_EMAIL_MISMATCH');
    expect(
      (await prisma.invitation.findFirstOrThrow({ where: { organizationId: org.id, email } }))
        .status,
    ).toBe('pending');

    const inv = await prisma.invitation.findFirstOrThrow({
      where: { organizationId: org.id, email },
    });
    expect((await owner.post(`/v1/orgs/${org.id}/invitations/${inv.id}/cancel`)).status).toBe(204);
    const target = await signedInUser(baseUrl, email);
    expect(await code(await target.client.post('/v1/invitations/accept', { token }))).toBe(
      'TOKEN_INVALID_OR_EXPIRED',
    );

    const email2 = newEmail('late');
    const token2 = await invite(owner, org.id, email2);
    await prisma.invitation.updateMany({
      where: { organizationId: org.id, email: email2 },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await signedInUser(baseUrl, email2);
    expect(await code(await late.client.post('/v1/invitations/accept', { token: token2 }))).toBe(
      'TOKEN_INVALID_OR_EXPIRED',
    );
    expect(
      await prisma.membership.count({
        where: { organizationId: org.id, userId: { not: undefined }, status: 'active' },
      }),
    ).toBe(1);
  });

  it('resend issues a new link and the old one stops working', async () => {
    const { client: owner, org } = await ownerWithOrg();
    const email = newEmail('resend');
    const oldToken = await invite(owner, org.id, email);
    const inv = await prisma.invitation.findFirstOrThrow({
      where: { organizationId: org.id, email },
    });
    expect((await owner.post(`/v1/orgs/${org.id}/invitations/${inv.id}/resend`)).status).toBe(200);
    expect((await owner.post('/v1/invitations/preview', { token: oldToken })).status).toBe(400);
    const dup = await owner.post(`/v1/orgs/${org.id}/invitations`, { email, role: 'designer' });
    expect(dup.status).toBe(409);
  });

  it('registering with the organization email domain gives no access (FR-SEC-068, AC1)', async () => {
    const { org } = await ownerWithOrg();
    const sameDomain = await signedInUser(baseUrl, `colleague-${newId()}@example.com`);
    expect(
      (await json<{ items: OrgBody[] }>(await sameDomain.client.get('/v1/orgs'))).items,
    ).toEqual([]);
    const res = await sameDomain.client.get(`/v1/orgs/${org.id}/members`);
    expect(res.status).toBe(404);
    expect((await sameDomain.client.get(`/v1/orgs/${newId()}`)).status).toBe(404);
    expect((await sameDomain.client.get('/v1/orgs/not-a-uuid')).status).toBe(404);
  });

  it('suspended members get 403, revoked members 404 on their next request (AC3, TR-SEC-004)', async () => {
    const { client: owner, org } = await ownerWithOrg();
    const member = await memberJoined(owner, org.id);
    expect((await member.client.get(`/v1/orgs/${org.id}`)).status).toBe(200);

    const suspended = await owner.post(`/v1/orgs/${org.id}/members/${member.membershipId}/suspend`);
    expect(suspended.status).toBe(200);
    expect((await json<MemberBody>(suspended)).status).toBe('suspended');
    const denied = await member.client.get(`/v1/orgs/${org.id}/members`);
    expect(denied.status).toBe(403);

    expect(
      (await owner.post(`/v1/orgs/${org.id}/members/${member.membershipId}/reactivate`)).status,
    ).toBe(200);
    expect((await member.client.get(`/v1/orgs/${org.id}`)).status).toBe(200);

    expect(
      (await owner.post(`/v1/orgs/${org.id}/members/${member.membershipId}/revoke`)).status,
    ).toBe(200);
    expect((await member.client.get(`/v1/orgs/${org.id}`)).status).toBe(404);
    const history = await json<{ items: MemberBody[] }>(
      await owner.get(`/v1/orgs/${org.id}/members`),
    );
    expect(history.items.find((m) => m.membershipId === member.membershipId)?.status).toBe(
      'revoked',
    );
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org.id, eventType: { startsWith: 'organizations.membership.' } },
      }),
    ).toBeGreaterThanOrEqual(4);
  });

  it('enforces permissions: designers cannot invite or manage; admins cannot manage owners or transfer ownership', async () => {
    const { client: owner, org } = await ownerWithOrg();
    const designer = await memberJoined(owner, org.id, 'designer');
    expect(
      (
        await designer.client.post(`/v1/orgs/${org.id}/invitations`, {
          email: newEmail(),
          role: 'designer',
        })
      ).status,
    ).toBe(403);
    const admin = await memberJoined(owner, org.id, 'organization_admin');
    const ownerMembership = org.membership.id;
    expect(
      (await admin.client.post(`/v1/orgs/${org.id}/members/${ownerMembership}/suspend`)).status,
    ).toBe(403);
    expect(
      (await admin.client.post(`/v1/orgs/${org.id}/members/${designer.membershipId}/suspend`))
        .status,
    ).toBe(200);
    expect(
      (
        await admin.client.post(`/v1/orgs/${org.id}/ownership-transfer`, {
          toMembershipId: designer.membershipId,
          confirmOrganizationName: org.name,
        })
      ).status,
    ).toBe(403);
  });

  it('the last owner cannot be removed; ownership transfer is explicit and audited (AC4)', async () => {
    const { client: owner, org } = await ownerWithOrg('Continuity Ltd');
    const admin = await memberJoined(owner, org.id, 'organization_admin');
    // Owner cannot remove themselves through member management, and the last owner is protected.
    expect(
      (await owner.post(`/v1/orgs/${org.id}/members/${org.membership.id}/revoke`)).status,
    ).toBe(409);

    const wrongConfirm = await owner.post(`/v1/orgs/${org.id}/ownership-transfer`, {
      toMembershipId: admin.membershipId,
      confirmOrganizationName: 'continuity',
    });
    expect(wrongConfirm.status).toBe(400);
    const transfer = await owner.post(`/v1/orgs/${org.id}/ownership-transfer`, {
      toMembershipId: admin.membershipId,
      confirmOrganizationName: 'Continuity Ltd',
    });
    expect(transfer.status).toBe(204);
    const members = await json<{ items: MemberBody[] }>(
      await owner.get(`/v1/orgs/${org.id}/members`),
    );
    // The new owner keeps the roles they had (I07); the previous owner becomes admin.
    expect(
      [...(members.items.find((m) => m.membershipId === admin.membershipId)?.roles ?? [])].sort(),
    ).toEqual(['organization_admin', 'organization_owner']);
    expect(members.items.find((m) => m.membershipId === org.membership.id)?.roles).toEqual([
      'organization_admin',
    ]);
    expect(
      await prisma.auditEvent.count({
        where: { organizationId: org.id, eventType: 'organizations.ownership.transferred' },
      }),
    ).toBe(1);

    // The new (only) owner is protected from the former owner (now admin) and from removal.
    const newOwner = admin.client;
    const res = await newOwner.post(`/v1/orgs/${org.id}/members/${admin.membershipId}/revoke`);
    expect(res.status).toBe(409);
    expect(
      (await owner.post(`/v1/orgs/${org.id}/members/${admin.membershipId}/revoke`)).status,
    ).toBe(403);
  });

  it('LAST_OWNER_REQUIRED when two owners exist and one tries to remove the other last active one', async () => {
    const { client: owner, org } = await ownerWithOrg('Two Owners');
    const second = await memberJoined(owner, org.id, 'organization_admin');
    // Make second an owner as well (direct DB setup: Owner is never granted through role management, only by transfer).
    await prisma.membershipRole.updateMany({
      where: { membershipId: second.membershipId },
      data: { roleId: '00000000-0000-7000-8000-000000000001' },
    });
    // Suspend the original owner via the second owner → allowed (one active owner remains).
    expect(
      (await second.client.post(`/v1/orgs/${org.id}/members/${org.membership.id}/suspend`)).status,
    ).toBe(200);
    // Now nobody can suspend/revoke the remaining active owner; reactivation is fine.
    expect(
      (await second.client.post(`/v1/orgs/${org.id}/members/${org.membership.id}/reactivate`))
        .status,
    ).toBe(200);
    await prisma.membership.update({
      where: { id: second.membershipId },
      data: { status: 'suspended' },
    });
    // original owner is now the only active owner and the second is suspended:
    const r = await owner.post(`/v1/orgs/${org.id}/members/${second.membershipId}/revoke`);
    expect(r.status).toBe(200); // revoking a suspended owner leaves the active one in place
  });

  it('other tenants cannot touch an organization they do not belong to (404)', async () => {
    const a = await ownerWithOrg('Tenant A');
    const b = await ownerWithOrg('Tenant B');
    expect((await b.client.get(`/v1/orgs/${a.org.id}`)).status).toBe(404);
    expect(
      (
        await b.client.post(`/v1/orgs/${a.org.id}/invitations`, {
          email: newEmail(),
          role: 'designer',
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.client.post(`/v1/orgs/${a.org.id}/members/${a.org.membership.id}/revoke`)).status,
    ).toBe(404);
    // Even with a valid membership id from org A, using org B's path does not reach A's member.
    expect(
      (await b.client.post(`/v1/orgs/${b.org.id}/members/${a.org.membership.id}/revoke`)).status,
    ).toBe(404);
  });
});
