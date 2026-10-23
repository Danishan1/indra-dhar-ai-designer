import {
  checkTenantIsolation,
  createTenant,
  listRoutes,
  type RouteInfo,
  type TenantFixture,
} from '@ai-designer/test-utils';
import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUTHZ_METADATA, type AuthzDeclaration } from '../../src/platform/authz/decorators.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { startTestApp } from '../integration/app-factory.js';

import { clearRateLimits, fixtureDeps } from './fixtures.js';

/** Minimal valid bodies so validation never answers before authorization. */
const BODIES: Record<string, unknown> = {
  'PATCH /v1/orgs/:orgId': { name: 'Hijacked' },
  'POST /v1/orgs/:orgId/invitations': { email: 'x@example.com', role: 'designer' },
  'POST /v1/orgs/:orgId/ownership-transfer': {
    toMembershipId: '00000000-0000-7000-8000-000000000099',
    confirmOrganizationName: 'x',
  },
  'PUT /v1/orgs/:orgId/members/:membershipId/roles': { roles: ['viewer'] },
};

/**
 * Cross-tenant isolation (TR-SEC-010/012, AC-SEC-002, AC2): Org B's most privileged user calls every
 * org-scoped route with Org A's identifiers and must get 404 everywhere — and vice versa.
 * New routes are picked up automatically; map any new path parameter in `paramsFor`.
 */
describe('cross-tenant isolation', () => {
  let app: INestApplication;
  let baseUrl: string;
  let routes: RouteInfo[];
  let a: TenantFixture;
  let b: TenantFixture;

  const paramsFor = (t: TenantFixture) => ({
    orgId: t.orgId,
    membershipId: t.members['designer']?.membershipId ?? '',
    invitationId: t.pendingInvitationId,
  });

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    await clearRateLimits(app.get<Redis>(REDIS));
    const all = listRoutes(app, { metadataKey: AUTHZ_METADATA, prefix: '/v1' });
    routes = all.filter((r) => {
      const kind = (r.metadata as AuthzDeclaration | undefined)?.kind;
      return kind === 'member' || kind === 'permission';
    });
    a = await createTenant(fixtureDeps(baseUrl), 'Tenant A', ['designer']);
    b = await createTenant(fixtureDeps(baseUrl), 'Tenant B', ['designer']);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('covers every org-scoped route', () => {
    expect(routes.length).toBeGreaterThanOrEqual(14);
  });

  it("Org B's owner gets 404 for every Org A resource", async () => {
    const failures = await checkTenantIsolation({
      routes,
      attacker: b.owner.client,
      params: paramsFor(a),
      bodies: BODIES,
    });
    expect(failures).toEqual([]);
  });

  it("Org A's owner gets 404 for every Org B resource", async () => {
    const failures = await checkTenantIsolation({
      routes,
      attacker: a.owner.client,
      params: paramsFor(b),
      bodies: BODIES,
    });
    expect(failures).toEqual([]);
  });

  it("mixing ids (own org, other tenant's member/invitation) is also 404", async () => {
    const failures = await checkTenantIsolation({
      routes: routes.filter((r) => /:membershipId|:invitationId/.test(r.path)),
      attacker: b.owner.client,
      params: { ...paramsFor(a), orgId: b.orgId },
      bodies: BODIES,
    });
    expect(failures).toEqual([]);
  });

  it('client-supplied tenant hints are ignored', async () => {
    const res = await b.owner.client.get(`/v1/orgs/${a.orgId}/members`, {
      'x-organization-id': b.orgId,
    });
    expect(res.status).toBe(404);
    expect((await b.owner.client.get(`/v1/me/permissions?orgId=${a.orgId}`)).status).toBe(404);
  });
});
