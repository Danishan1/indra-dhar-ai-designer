import type {
  Artifact,
  ArtifactDetail,
  Design,
  Project,
  WorkingCopy,
} from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlatformLibraryService } from '../../../src/modules/artifacts/platform-library.service.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

const err = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

const LACE_DEFINITION = {
  compatibleTargetTypes: ['sleeve', 'hem'],
  allowedPlacementRegions: ['hem', 'opening'],
  preferredPlacementRegions: ['hem'],
  repeatable: true,
  placementModes: ['follow_boundary'],
  shapeParams: { kind: 'border', params: { pattern: 'scallop', widthMm: 30 } },
};

describe('artifact registry (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;
  let designer: TestClient;
  let lead: TestClient;
  let viewer: TestClient;
  let orgId: string;

  const org = () => `/v1/orgs/${orgId}`;
  const create = async (client: TestClient, body: Record<string, unknown> = {}) => {
    const res = await client.post(`${org()}/artifacts`, {
      category: 'lace',
      name: 'Scalloped border',
      definition: LACE_DEFINITION,
      properties: { physical: { 'material.composition': { value: null, status: 'missing' } } },
      ...body,
    });
    expect(res.status).toBe(201);
    return json<ArtifactDetail>(res);
  };
  const list = async (client: TestClient, qs = '') =>
    (await json<{ items: Artifact[] }>(await client.get(`${org()}/artifacts?limit=100${qs}`)))
      .items;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Library Atelier', [
      'designer',
      'design_lead',
      'viewer',
    ]);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Library', []);
    orgId = t.orgId;
    designer = t.members.designer!.client;
    lead = t.members.design_lead!.client;
    viewer = t.members.viewer!.client;
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the built-in library is seeded idempotently and browsable (AC7)', async () => {
    const before = await prisma.artifactRevision.count({ where: { organizationId: null } });
    expect(await app.get(PlatformLibraryService).sync()).toEqual({
      created: 0,
      revised: 0,
      updated: 0,
      deprecated: 0,
    });
    expect(await prisma.artifactRevision.count({ where: { organizationId: null } })).toBe(before);

    const builtIn = await list(viewer, '&scope=platform');
    expect(builtIn.length).toBeGreaterThanOrEqual(30);
    expect(new Set(builtIn.map((a) => a.category)).size).toBeGreaterThanOrEqual(10);
    const collar = builtIn.find((a) => a.name === 'Point collar')!;
    expect(collar).toMatchObject({
      ownerScope: 'platform',
      displayId: expect.stringMatching(/^COL-\d{4}$/),
      geometryCapability: 'G2',
      validationStatus: 'design_asset_validated',
      compatibleTargetTypes: ['collar'],
      previewUrl: expect.stringContaining('/preview'),
    });
    const preview = await viewer.get(collar.previewUrl!);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toContain('image/svg+xml');
    expect(preview.headers.get('content-security-policy')).toContain('sandbox');
    expect(await preview.text()).toMatch(/^<svg/);
    // Filters
    const forSleeves = await list(viewer, '&compatibleWith=sleeve');
    expect(forSleeves.every((a) => a.compatibleTargetTypes.includes('sleeve'))).toBe(true);
    expect((await list(viewer, '&category=button')).every((a) => a.category === 'button')).toBe(
      true,
    );
    expect((await list(viewer, '&q=oxford')).map((a) => a.name)).toContain('Blue oxford');
  });

  it('platform artifacts can be used and copied but never changed (FR-SEC-116)', async () => {
    const builtIn = (await list(designer, '&scope=platform&category=fabric'))[0]!;
    const path = `${org()}/artifacts/${builtIn.id}`;
    expect((await designer.get(path)).status).toBe(200);
    expect((await designer.patch(path, { expectedVersion: 1, name: 'Mine' })).status).toBe(403);
    expect(
      (
        await designer.post(`${path}/revisions`, {
          expectedCurrentRevisionId: builtIn.currentRevisionId,
          definition: LACE_DEFINITION,
        })
      ).status,
    ).toBe(403);
    expect((await designer.post(`${path}/deactivate`, {})).status).toBe(403);
    expect((await designer.delete(path)).status).toBe(403);
    const copy = await designer.post(`${path}/duplicate`, {});
    expect(copy.status).toBe(201);
    const c = await json<ArtifactDetail>(copy);
    expect(c).toMatchObject({
      ownerScope: 'user',
      name: `${builtIn.name} (copy)`,
      derivedFromArtifactRevisionId: builtIn.currentRevisionId,
    });
    expect(c.displayId).toMatch(/^FAB-\d{4}$/);
    expect(c.revisions[0]?.changeNote).toMatch(/^Copied from FAB-\d{4}-R001$/);
  });

  it('scopes: private artifacts are invisible to others; publishing needs artifact.publish (AC3)', async () => {
    const mine = await create(designer, { name: 'My private lace' });
    expect(mine).toMatchObject({
      ownerScope: 'user',
      currentRevisionNumber: 1,
      validationStatus: 'design_asset_validated',
    });
    expect(mine.displayId).toMatch(/^LAC-\d{4}$/);
    expect(mine.revisions[0]?.displayId).toBe(`${mine.displayId}-R001`);
    expect((await lead.get(`${org()}/artifacts/${mine.id}`)).status).toBe(404);
    expect((await list(lead)).map((a) => a.id)).not.toContain(mine.id);
    // Designers cannot share to the organization library directly or by publishing.
    expect(
      (
        await designer.post(`${org()}/artifacts`, {
          category: 'lace',
          name: 'x',
          scope: 'organization',
          definition: LACE_DEFINITION,
        })
      ).status,
    ).toBe(403);
    expect((await designer.post(`${org()}/artifacts/${mine.id}/publish`, {})).status).toBe(403);
    // A lead publishes their own private artifact; then everyone in the org sees it.
    const leads = await create(lead, { name: 'Lead lace' });
    const published = await json<ArtifactDetail>(
      await lead.post(`${org()}/artifacts/${leads.id}/publish`, {}),
    );
    expect(published).toMatchObject({
      ownerScope: 'organization',
      ownerUserId: null,
      publishedAt: expect.any(String),
    });
    expect((await designer.get(`${org()}/artifacts/${leads.id}`)).status).toBe(200);
    // Viewers browse but cannot create or use.
    expect(
      (
        await viewer.post(`${org()}/artifacts`, {
          category: 'lace',
          name: 'x',
          definition: LACE_DEFINITION,
        })
      ).status,
    ).toBe(403);
  });

  it('revisions are immutable, linked to their parent, and validated (AC1, AC4)', async () => {
    const a = await create(designer);
    const r1 = a.currentRevisionId!;
    const bad = await designer.post(`${org()}/artifacts/${a.id}/revisions`, {
      expectedCurrentRevisionId: r1,
      definition: { compatibleTargetTypes: ['spaceship'] },
    });
    expect(bad.status).toBe(422);
    expect(((await err(bad)).details?.findings as { ruleId: string }[])[0]?.ruleId).toBe(
      'artifact.target_type_unknown',
    );
    const same = await designer.post(`${org()}/artifacts/${a.id}/revisions`, {
      expectedCurrentRevisionId: r1,
      definition: LACE_DEFINITION,
    });
    expect((await err(same)).code).toBe('NO_CHANGES');
    const res = await designer.post(`${org()}/artifacts/${a.id}/revisions`, {
      expectedCurrentRevisionId: r1,
      definition: { ...LACE_DEFINITION, repeatable: false },
      changeNote: 'Not repeatable',
    });
    expect(res.status).toBe(201);
    const a2 = await json<ArtifactDetail>(res);
    expect(a2.revisions.map((r) => r.revisionNumber)).toEqual([2, 1]);
    expect(a2.revisions[0]).toMatchObject({ parentRevisionId: r1, changeNote: 'Not repeatable' });
    // Physical properties carried over and still missing → never production-validated.
    expect(a2.revisions[0]?.properties.physical).toHaveProperty('material.composition');
    expect(a2.validationStatus).toBe('design_asset_validated');
    // Stale base revision
    const stale = await designer.post(`${org()}/artifacts/${a.id}/revisions`, {
      expectedCurrentRevisionId: r1,
      definition: LACE_DEFINITION,
    });
    expect(stale.status).toBe(409);
    await expect(
      prisma.$executeRaw`UPDATE artifact_revisions SET change_note = 'x' WHERE id = ${r1}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM artifact_revisions WHERE id = ${r1}::uuid`,
    ).rejects.toThrow(/immutable/);
  });

  it('revising an artifact never changes design revisions that pinned it; where-used and delete respect references (AC2, AC6)', async () => {
    const a = await create(designer, { name: 'Pinned lace' });
    const r1 = a.currentRevisionId!;
    // A design pins R001 on its left sleeve.
    const project = await json<Project>(
      await designer.post(`${org()}/projects`, { name: 'Lace project' }),
    );
    const design = await json<Design>(
      await designer.post(`${org()}/projects/${project.id}/designs`, { name: 'Lace shirt' }),
    );
    const wc = await json<WorkingCopy>(
      await designer.get(`${org()}/designs/${design.id}/working-copy`),
    );
    const state = structuredClone(wc.state) as unknown as GarmentDesignState;
    state.components.find(
      (c) => c.componentType === 'sleeve' && c.side === 'left',
    )!.artifactBindings = [
      { bindingId: 'bnd_aaaaaaaaaaaa', artifactId: a.id, artifactRevisionId: r1, role: 'trim' },
    ];
    const saved = await json<WorkingCopy>(
      await designer.put(`${org()}/designs/${design.id}/working-copy`, {
        expectedVersion: wc.version,
        state,
      }),
    );
    // A draft reference already blocks deletion.
    expect((await designer.get(`${org()}/artifacts/${a.id}/where-used`)).status).toBe(200);
    expect(
      (
        await json<{ draftCount: number }>(
          await designer.get(`${org()}/artifacts/${a.id}/where-used`),
        )
      ).draftCount,
    ).toBe(1);
    const committed = await designer.post(`${org()}/designs/${design.id}/revisions`, {
      expectedVersion: saved.version,
    });
    expect(committed.status).toBe(201);
    const { revision } = await json<{
      revision: { id: string; contentHash: string; artifactRevisionRefs: string[] };
    }>(committed);
    expect(revision.artifactRevisionRefs).toEqual([r1]);

    await designer.post(`${org()}/artifacts/${a.id}/revisions`, {
      expectedCurrentRevisionId: r1,
      definition: { ...LACE_DEFINITION, repeatable: false },
    });
    const after = await json<{
      contentHash: string;
      artifactRevisionRefs: string[];
      snapshot: GarmentDesignState;
    }>(await designer.get(`${org()}/revisions/${revision.id}`));
    expect(after.contentHash).toBe(revision.contentHash);
    expect(after.artifactRevisionRefs).toEqual([r1]);
    // R001 is still resolvable exactly.
    expect((await designer.get(`${org()}/artifact-revisions/${r1}`)).status).toBe(200);

    const used = await json<{ items: { designId: string; artifactRevisionIds: string[] }[] }>(
      await designer.get(`${org()}/artifacts/${a.id}/where-used`),
    );
    expect(used.items).toEqual([
      expect.objectContaining({ designId: design.id, artifactRevisionIds: [r1] }),
    ]);
    const del = await designer.delete(`${org()}/artifacts/${a.id}`);
    expect(del.status).toBe(409);
    expect((await err(del)).details).toMatchObject({ reason: 'has_references' });
  });

  it('deactivation hides from browsing but keeps revisions resolvable; unused artifacts can be deleted (AC6)', async () => {
    const a = await create(designer, { name: 'Soon gone' });
    const path = `${org()}/artifacts/${a.id}`;
    expect(
      (await json<ArtifactDetail>(await designer.post(`${path}/deactivate`, {}))).lifecycleStatus,
    ).toBe('deactivated');
    expect((await list(designer)).map((x) => x.id)).not.toContain(a.id);
    expect((await list(designer, '&includeInactive=true')).map((x) => x.id)).toContain(a.id);
    expect((await designer.get(`${org()}/artifact-revisions/${a.currentRevisionId}`)).status).toBe(
      200,
    );
    const blocked = await designer.post(`${path}/revisions`, {
      expectedCurrentRevisionId: a.currentRevisionId,
      definition: LACE_DEFINITION,
    });
    expect((await err(blocked)).code).toBe('INVALID_STATE_TRANSITION');
    expect(
      (await json<ArtifactDetail>(await designer.post(`${path}/reactivate`, {}))).lifecycleStatus,
    ).toBe('active');
    expect((await designer.delete(path)).status).toBe(204);
    expect((await designer.get(path)).status).toBe(404);
    // Shared (organization) artifacts need artifact.delete.
    const shared = await create(lead, { name: 'Shared lace', scope: 'organization' });
    expect((await designer.delete(`${org()}/artifacts/${shared.id}`)).status).toBe(403);
    expect((await lead.delete(`${org()}/artifacts/${shared.id}`)).status).toBe(204);
  });

  it('compatibility is machine-readable (AC5)', async () => {
    const lace = (await list(designer, '&q=Scalloped lace border&scope=platform'))[0]!;
    const check = (body: Record<string, unknown>) =>
      designer.post(`${org()}/artifacts/compatibility-check`, {
        artifactRevisionId: lace.currentRevisionId,
        ...body,
      });
    expect(await json(await check({ componentType: 'sleeve', region: 'hem' }))).toEqual({
      compatible: true,
      findings: [],
    });
    const collar = await json<{ compatible: boolean; findings: { ruleId: string }[] }>(
      await check({ componentType: 'collar' }),
    );
    expect(collar.compatible).toBe(false);
    expect(collar.findings[0]?.ruleId).toBe('artifact.target_incompatible');
    expect(
      (
        await viewer.post(`${org()}/artifacts/compatibility-check`, {
          artifactRevisionId: lace.currentRevisionId,
          componentType: 'sleeve',
        })
      ).status,
    ).toBe(403);
  });

  it('other organizations cannot see or change organization artifacts (AC-11, FR-SEC-115)', async () => {
    const shared = await create(lead, { name: 'Org only', scope: 'organization' });
    const stranger = other.owner.client;
    expect((await stranger.get(`/v1/orgs/${other.orgId}/artifacts/${shared.id}`)).status).toBe(404);
    expect(
      (await stranger.get(`/v1/orgs/${other.orgId}/artifact-revisions/${shared.currentRevisionId}`))
        .status,
    ).toBe(404);
    expect(
      (await stranger.post(`/v1/orgs/${other.orgId}/artifacts/${shared.id}/duplicate`, {})).status,
    ).toBe(404);
    const theirs = await json<{ items: Artifact[] }>(
      await stranger.get(`/v1/orgs/${other.orgId}/artifacts?limit=100&scope=organization`),
    );
    expect(theirs.items.map((a) => a.id)).not.toContain(shared.id);
    const check = await stranger.post(`/v1/orgs/${other.orgId}/artifacts/compatibility-check`, {
      artifactRevisionId: shared.currentRevisionId,
      componentType: 'sleeve',
    });
    expect(check.status).toBe(404);
  });
});
