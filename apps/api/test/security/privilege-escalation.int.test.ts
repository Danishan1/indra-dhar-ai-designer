import { BASELINE_ROLES } from '@ai-designer/contracts';
import { newId } from '@ai-designer/db';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../src/modules/authorization/authorization.service.js';
import { ResourceGrantService } from '../../src/modules/authorization/grants.service.js';
import { AccessCache } from '../../src/platform/authz/access-cache.js';
import { MembershipDirectoryRegistry } from '../../src/platform/authz/membership-directory.js';
import { ResourceResolverRegistry } from '../../src/platform/authz/resource-resolvers.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { startTestApp } from '../integration/app-factory.js';
import { newEmail } from '../integration/helpers/accounts.js';

import { clearRateLimits, fixtureDeps, json } from './fixtures.js';

interface MemberBody {
  membershipId: string;
  roles: string[];
}
const errorOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

/** Vertical escalation, delegation, revocation latency, grants and fail-closed (TR-SEC-011, AC3/4/6/7). */
describe('authorization: privilege escalation & role management', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Escalation Co', [
      'organization_admin',
      'designer',
      'viewer',
    ]);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Co', ['designer']);
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  const m = (role: string) => {
    const member = t.members[role];
    if (!member) throw new Error(role);
    return member;
  };
  const rolesUrl = (membershipId: string, orgId = t.orgId) =>
    `/v1/orgs/${orgId}/members/${membershipId}/roles`;

  it('viewers get 403 on member and role management (TR-SEC-011)', async () => {
    const viewer = m('viewer').client;
    expect((await viewer.get(`/v1/orgs/${t.orgId}/members`)).status).toBe(403);
    expect((await viewer.get(`/v1/orgs/${t.orgId}/roles`)).status).toBe(403);
    const invite = await viewer.post(`/v1/orgs/${t.orgId}/invitations`, {
      email: newEmail(),
      role: 'viewer',
    });
    expect(invite.status).toBe(403);
    const put = await viewer.put(rolesUrl(m('designer').membershipId), { roles: ['viewer'] });
    expect(put.status).toBe(403);
    expect((await errorOf(put)).details).toMatchObject({ permission: 'members.manage_roles' });
  });

  it('members cannot raise their own roles', async () => {
    const designer = m('designer');
    const res = await designer.client.put(rolesUrl(designer.membershipId), {
      roles: ['designer', 'organization_admin'],
    });
    expect(res.status).toBe(403);
  });

  it('admins cannot grant Billing admin unless they hold it; owners can (AC-SEC-003)', async () => {
    const admin = m('organization_admin').client;
    const viaInvite = await admin.post(`/v1/orgs/${t.orgId}/invitations`, {
      email: newEmail(),
      role: 'billing_admin',
    });
    expect(viaInvite.status).toBe(403);
    expect((await errorOf(viaInvite)).details).toMatchObject({ reason: 'delegation' });
    const viaRoles = await admin.put(rolesUrl(m('viewer').membershipId), {
      roles: ['viewer', 'billing_admin'],
    });
    expect(viaRoles.status).toBe(403);

    const byOwner = await t.owner.client.put(rolesUrl(m('viewer').membershipId), {
      roles: ['viewer', 'billing_admin'],
    });
    expect(byOwner.status).toBe(200);
    expect((await json<MemberBody>(byOwner)).roles.sort()).toEqual(['billing_admin', 'viewer']);
    // …and the admin can no longer manage that member (holds a role the admin cannot grant).
    expect(
      (await admin.post(`/v1/orgs/${t.orgId}/members/${m('viewer').membershipId}/suspend`)).status,
    ).toBe(403);
    // restore
    expect(
      (await t.owner.client.put(rolesUrl(m('viewer').membershipId), { roles: ['viewer'] })).status,
    ).toBe(200);
  });

  it('ownership is never granted or removed through role management', async () => {
    const res = await t.owner.client.put(rolesUrl(m('designer').membershipId), {
      roles: ['designer', 'organization_owner'],
    });
    expect(res.status).toBe(403);
    expect((await errorOf(res)).details).toMatchObject({ reason: 'ownership_transfer_only' });
    const admin = m('organization_admin').client;
    expect((await admin.put(rolesUrl(t.owner.membershipId), { roles: ['viewer'] })).status).toBe(
      403,
    );
  });

  it('role grants cannot cross tenants (AC-SEC-013)', async () => {
    const foreign = other.members['designer']?.membershipId ?? '';
    const res = await t.owner.client.put(rolesUrl(foreign), { roles: ['viewer'] });
    expect(res.status).toBe(404);
    const roles = await prisma.membershipRole.findMany({ where: { membershipId: foreign } });
    expect(roles.map((r) => r.roleId)).toEqual([BASELINE_ROLES.designer.id]);
  });

  it('a role change takes effect on the next request and is audited (NFR-SEC-007, AC6)', async () => {
    const designer = m('designer');
    expect((await designer.client.get(`/v1/orgs/${t.orgId}/members`)).status).toBe(200); // cached
    const res = await m('organization_admin').client.put(rolesUrl(designer.membershipId), {
      roles: ['viewer'],
    });
    expect(res.status).toBe(200);
    expect((await designer.client.get(`/v1/orgs/${t.orgId}/members`)).status).toBe(403);
    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: t.orgId,
        eventType: 'authorization.role_assignment_changed',
        resourceId: designer.membershipId,
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit?.metadata).toMatchObject({ added: ['viewer'], removed: ['designer'] });
    expect(
      await prisma.outboxEvent.count({
        where: { organizationId: t.orgId, type: 'authorization.role_assignment_changed' },
      }),
    ).toBeGreaterThanOrEqual(1);
    // restore
    await t.owner.client.put(rolesUrl(designer.membershipId), { roles: ['designer'] });
  });

  it('denials of sensitive actions are audited with a reason code', async () => {
    await m('viewer').client.put(rolesUrl(m('designer').membershipId), { roles: ['viewer'] });
    const denied = await prisma.auditEvent.findFirst({
      where: { organizationId: t.orgId, eventType: 'authorization.denied' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(denied).toMatchObject({
      action: 'members.manage_roles',
      outcome: 'denied',
      reasonCode: 'MISSING_PERMISSION',
      policyVersion: 'sec-policy-v1',
    });
  });

  it('effective permissions: self always, others with members.view (AC7, FR-SEC-093)', async () => {
    const viewer = m('viewer');
    const self = await viewer.client.get(
      `/v1/orgs/${t.orgId}/members/${viewer.membershipId}/effective-permissions`,
    );
    expect(self.status).toBe(200);
    const body = await json<{
      roles: string[];
      permissions: { key: string; viaRoles: string[] }[];
    }>(self);
    expect(body.roles).toEqual(['viewer']);
    expect(body.permissions.map((p) => p.key)).toContain('design.view');
    expect(body.permissions.map((p) => p.key)).not.toContain('design.edit');
    expect(
      (
        await viewer.client.get(
          `/v1/orgs/${t.orgId}/members/${m('designer').membershipId}/effective-permissions`,
        )
      ).status,
    ).toBe(403);
    const byAdmin = await m('organization_admin').client.get(
      `/v1/orgs/${t.orgId}/members/${m('designer').membershipId}/effective-permissions`,
    );
    expect(byAdmin.status).toBe(200);
    const mine = await json<{ permissions: string[] }>(
      await viewer.client.get(`/v1/me/permissions?orgId=${t.orgId}`),
    );
    expect(mine.permissions).toEqual(body.permissions.map((p) => p.key));
  });

  it('client-supplied role claims are ignored', async () => {
    const email = newEmail('claims');
    await t.owner.client.post(`/v1/orgs/${t.orgId}/invitations`, {
      email,
      role: 'viewer',
      roles: ['organization_owner'],
      permissions: ['members.manage'],
    });
    const deps = fixtureDeps(baseUrl);
    const token = await deps.invitationToken(email);
    const client = await deps.signUp(email, 'Claimy');
    const accepted = await client.post('/v1/invitations/accept', {
      token,
      role: 'organization_owner',
    });
    expect(accepted.status).toBe(200);
    const mine = await json<{ roles: string[] }>(
      await client.get(`/v1/me/permissions?orgId=${t.orgId}`),
    );
    expect(mine.roles).toEqual(['viewer']);
  });

  it('resource grants: honoured while active; expiry and revocation are rechecked', async () => {
    const resolvers = app.get(ResourceResolverRegistry);
    const docId = newId();
    if (!resolvers.types().includes('test_document')) {
      resolvers.register('test_document', {
        label: 'Document',
        organizationOf: async (id) => (id === docId ? t.orgId : null),
      });
    }
    const pdp = app.get(AuthorizationService);
    const grants = app.get(ResourceGrantService);
    const viewer = m('viewer');
    const userId = (
      await prisma.membership.findUniqueOrThrow({ where: { id: viewer.membershipId } })
    ).userId;
    const ask = () =>
      pdp.authorize({
        principal: { type: 'human', id: userId },
        organizationId: t.orgId,
        permission: 'project.edit',
        resource: { type: 'test_document', id: docId },
      });
    expect((await ask()).reasonCode).toBe('MISSING_PERMISSION');

    const grantId = await grants.create({
      organizationId: t.orgId,
      resourceType: 'test_document',
      resourceId: docId,
      recipientUserId: userId,
      actions: ['project.edit'],
      grantedBy: userId,
    });
    expect(await ask()).toMatchObject({ decision: 'allow', reasonCode: 'ALLOWED_BY_GRANT' });
    await prisma.resourceGrant.update({
      where: { id: grantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await ask()).decision).toBe('deny');
    await prisma.resourceGrant.update({ where: { id: grantId }, data: { expiresAt: null } });
    expect((await ask()).decision).toBe('allow');
    expect(await grants.revoke(t.orgId, grantId, userId)).toBe(true);
    expect((await ask()).decision).toBe('deny');
    // Another tenant's member never benefits from a grant in this tenant.
    expect(
      await prisma.auditEvent.count({
        where: {
          organizationId: t.orgId,
          eventType: { startsWith: 'authorization.resource_grant' },
        },
      }),
    ).toBe(2);
  });

  it('fails closed when the membership source is unavailable (AC4)', async () => {
    const directories = app.get(MembershipDirectoryRegistry);
    const original = directories.get();
    const admin = m('organization_admin');
    const userId = (
      await prisma.membership.findUniqueOrThrow({ where: { id: admin.membershipId } })
    ).userId;
    await app.get(AccessCache).invalidate(t.orgId, userId);
    directories.register({
      findAccess: () => Promise.reject(new Error('database unavailable')),
      findById: () => Promise.reject(new Error('database unavailable')),
    });
    try {
      const res = await admin.client.get(`/v1/orgs/${t.orgId}/members`);
      expect(res.status).toBe(503);
      expect((await errorOf(res)).code).toBe('DEPENDENCY_UNAVAILABLE');
    } finally {
      directories.register(original);
    }
    expect((await admin.client.get(`/v1/orgs/${t.orgId}/members`)).status).toBe(200);
  });
});
