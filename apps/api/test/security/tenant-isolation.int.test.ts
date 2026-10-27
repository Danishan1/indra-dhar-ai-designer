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
  'PATCH /v1/orgs/:orgId/projects/:projectId': { expectedVersion: 1, name: 'Hijacked' },
  'PUT /v1/orgs/:orgId/projects/:projectId/visibility': {
    expectedVersion: 1,
    visibility: 'restricted',
  },
  'POST /v1/orgs/:orgId/projects/:projectId/grants': {
    userId: '0197b0a0-0000-7000-8000-000000000000',
    actions: ['project.view'],
  },
  'POST /v1/orgs/:orgId/projects': { name: 'Isolation probe' },
  'POST /v1/orgs/:orgId/projects/:projectId/designs': { name: 'Probe design' },
  'POST /v1/orgs/:orgId/designs/:designId/operations': {
    expectedVersion: 1,
    operation: { type: 'rename_component', componentId: 'cmp_000000000001', displayName: 'x' },
  },
  'POST /v1/orgs/:orgId/designs/:designId/operations/validate': {
    expectedVersion: 1,
    operation: { type: 'rename_component', componentId: 'cmp_000000000001', displayName: 'x' },
  },
  'POST /v1/orgs/:orgId/designs/:designId/revisions': { expectedVersion: 1 },
  'POST /v1/orgs/:orgId/designs/:designId/restore': {
    revisionId: '0197b0a0-0000-7000-8000-000000000000',
    expectedVersion: 1,
  },
  'POST /v1/orgs/:orgId/designs/:designId/duplicate': {},
  'POST /v1/orgs/:orgId/artifacts': {
    category: 'lace',
    name: 'Probe',
    definition: { compatibleTargetTypes: ['sleeve'] },
  },
  'PATCH /v1/orgs/:orgId/artifacts/:artifactId': { expectedVersion: 1, name: 'Hijacked' },
  'POST /v1/orgs/:orgId/artifacts/:artifactId/revisions': {
    expectedCurrentRevisionId: '0197b0a0-0000-7000-8000-000000000000',
    definition: { compatibleTargetTypes: ['sleeve'] },
  },
  'POST /v1/orgs/:orgId/artifacts/:artifactId/duplicate': {},
  'POST /v1/orgs/:orgId/artifacts/compatibility-check': {
    artifactRevisionId: '0197b0a0-0000-7000-8000-000000000000',
    componentType: 'sleeve',
  },
  'POST /v1/orgs/:orgId/assets/uploads': {
    assetType: 'source_image',
    fileName: 'x.png',
    mediaType: 'image/png',
    sizeBytes: 10,
  },
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
  const assetIds = new Map<string, string>();
  const projectIds = new Map<string, string>();
  const designs = new Map<string, { id: string; headRevisionId: string }>();
  const artifacts = new Map<string, { id: string; currentRevisionId: string }>();
  const operationIds = new Map<string, string>();
  const runIds = new Map<string, string>();

  const paramsFor = (t: TenantFixture) => ({
    orgId: t.orgId,
    membershipId: t.members['designer']?.membershipId ?? '',
    invitationId: t.pendingInvitationId,
    assetId: assetIds.get(t.orgId) ?? '',
    projectId: projectIds.get(t.orgId) ?? '',
    designId: designs.get(t.orgId)?.id ?? '',
    revisionId: designs.get(t.orgId)?.headRevisionId ?? '',
    artifactId: artifacts.get(t.orgId)?.id ?? '',
    artifactRevisionId: artifacts.get(t.orgId)?.currentRevisionId ?? '',
    operationId: operationIds.get(t.orgId) ?? '',
    runId: runIds.get(t.orgId) ?? '',
  });

  async function startArtifact(t: TenantFixture): Promise<void> {
    const res = await t.owner.client.post(`/v1/orgs/${t.orgId}/artifacts`, {
      ...(BODIES['POST /v1/orgs/:orgId/artifacts'] as object),
      scope: 'organization',
    });
    expect(res.status).toBe(201);
    artifacts.set(t.orgId, (await res.json()) as { id: string; currentRevisionId: string });
  }

  async function startProject(t: TenantFixture): Promise<void> {
    const res = await t.owner.client.post(`/v1/orgs/${t.orgId}/projects`, { name: 'Probe' });
    expect(res.status).toBe(201);
    const projectId = ((await res.json()) as { id: string }).id;
    projectIds.set(t.orgId, projectId);
    const d = await t.owner.client.post(`/v1/orgs/${t.orgId}/projects/${projectId}/designs`, {
      name: 'Probe design',
    });
    expect(d.status).toBe(201);
    const design = (await d.json()) as { id: string; headRevisionId: string };
    designs.set(t.orgId, design);
    const wc = (await (
      await t.owner.client.get(`/v1/orgs/${t.orgId}/designs/${design.id}/working-copy`)
    ).json()) as { version: number; state: { components: { componentId: string }[] } };
    const op = await t.owner.client.post(`/v1/orgs/${t.orgId}/designs/${design.id}/operations`, {
      expectedVersion: wc.version,
      operation: {
        type: 'rename_component',
        componentId: wc.state.components[0]!.componentId,
        displayName: 'Probe body',
      },
    });
    expect(op.status).toBe(201);
    operationIds.set(t.orgId, ((await op.json()) as { operation: { id: string } }).operation.id);
    const run = await t.owner.client.post(
      `/v1/orgs/${t.orgId}/designs/${design.id}/validation-runs`,
      {},
    );
    expect(run.status).toBe(201);
    runIds.set(t.orgId, ((await run.json()) as { id: string }).id);
  }

  async function startUpload(t: TenantFixture): Promise<void> {
    const res = await t.owner.client.post(
      `/v1/orgs/${t.orgId}/assets/uploads`,
      BODIES['POST /v1/orgs/:orgId/assets/uploads'],
    );
    expect(res.status).toBe(201);
    assetIds.set(t.orgId, ((await res.json()) as { asset: { id: string } }).asset.id);
  }

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
    await startUpload(a);
    await startProject(a);
    await startProject(b);
    await startUpload(b);
    await startArtifact(a);
    await startArtifact(b);
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

  it("mixing ids (own org, other tenant's member/invitation/asset/project/design/revision) is also 404", async () => {
    const failures = await checkTenantIsolation({
      routes: routes.filter((r) =>
        /:membershipId|:invitationId|:assetId|:projectId|:designId|:revisionId|:artifactId|:artifactRevisionId|:operationId|:runId/.test(
          r.path,
        ),
      ),
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
