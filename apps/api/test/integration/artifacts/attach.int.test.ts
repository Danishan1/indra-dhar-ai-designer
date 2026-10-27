import type {
  Artifact,
  ArtifactDetail,
  ArtifactRenderInfo,
  Design,
  Project,
  WorkingCopy,
} from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

const err = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

const LACE = {
  compatibleTargetTypes: ['sleeve', 'hem', 'cuff'],
  allowedPlacementRegions: ['hem', 'opening', 'edge'],
  preferredPlacementRegions: ['hem'],
  repeatable: true,
  placementModes: ['follow_boundary'],
  shapeParams: { kind: 'border', params: { pattern: 'scallop', widthMm: 20 } },
};

describe('attaching artifacts to designs (I18, integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;
  let designer: TestClient;
  let owner: TestClient;
  let orgId: string;
  let design: Design;

  const org = () => `/v1/orgs/${orgId}`;
  const wc = async () =>
    json<WorkingCopy>(await designer.get(`${org()}/designs/${design.id}/working-copy`));
  const stateOf = async () => (await wc()).state as unknown as GarmentDesignState;
  const comp = async (type: string, side?: string) =>
    (await stateOf()).components.find(
      (c) => c.componentType === type && (side === undefined || c.side === side),
    )!;
  const operate = async (operation: Record<string, unknown>, client = designer) => {
    const { version } = await wc();
    return client.post(`${org()}/designs/${design.id}/operations`, {
      expectedVersion: version,
      operation,
    });
  };
  const platform = async (q: string) =>
    (
      await json<{ items: Artifact[] }>(
        await designer.get(`${org()}/artifacts?limit=10&scope=platform&q=${encodeURIComponent(q)}`),
      )
    ).items[0]!;
  const renderInfo = async (ids: string[]) =>
    (
      await json<{ items: ArtifactRenderInfo[] }>(
        await designer.get(`${org()}/artifacts/render-info?ids=${ids.join(',')}`),
      )
    ).items;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Attach Atelier', ['designer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Attach', []);
    orgId = t.orgId;
    owner = t.owner.client;
    designer = t.members.designer!.client;
    const project = await json<Project>(
      await designer.post(`${org()}/projects`, { name: 'Attach' }),
    );
    design = await json<Design>(
      await designer.post(`${org()}/projects/${project.id}/designs`, { name: 'Lace shirt' }),
    );
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('attaching lace pins the exact revision with a placement (AC3)', async () => {
    const lace = await platform('Scalloped lace border');
    const sleeve = await comp('sleeve', 'left');
    const res = await operate({
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: lace.currentRevisionId,
      placement: { region: 'hem', scale: 1.2 },
    });
    expect(res.status).toBe(201);
    const state = await stateOf();
    const left = state.components.find((c) => c.componentId === sleeve.componentId)!;
    expect(left.artifactBindings[0]).toMatchObject({
      artifactId: lace.id,
      artifactRevisionId: lace.currentRevisionId,
    });
    const rel = state.relationships.find((r) => r.target.entityId === sleeve.componentId)!;
    expect(rel).toMatchObject({
      type: 'decorative_trim_applied_to',
      source: { entityType: 'artifact_revision', entityId: lace.currentRevisionId },
      placement: { region: 'hem', scale: 1.2 },
    });
    const [info] = await renderInfo([lace.currentRevisionId!]);
    expect(info).toMatchObject({ category: 'lace', lifecycleStatus: 'active', revisionNumber: 1 });
    expect(info!.displayId).toMatch(/-R001$/);
  });

  it('a newer artifact revision never changes the design until it is replaced explicitly (AC4)', async () => {
    const created = await json<ArtifactDetail>(
      await owner.post(`${org()}/artifacts`, {
        category: 'lace',
        name: 'House lace',
        scope: 'organization',
        definition: LACE,
      }),
    );
    const r1 = created.currentRevisionId!;
    const sleeve = await comp('sleeve', 'right');
    expect(
      (
        await operate({
          type: 'attach_artifact',
          componentId: sleeve.componentId,
          artifactRevisionId: r1,
          placement: { region: 'hem' },
        })
      ).status,
    ).toBe(201);
    const v2 = await json<ArtifactDetail>(
      await owner.post(`${org()}/artifacts/${created.id}/revisions`, {
        expectedCurrentRevisionId: r1,
        definition: { ...LACE, shapeParams: { kind: 'border', params: { widthMm: 30 } } },
        changeNote: 'Wider',
      }),
    );
    const r2 = v2.currentRevisionId!;
    expect(r2).not.toBe(r1);
    let right = await comp('sleeve', 'right');
    expect(right.artifactBindings[0]?.artifactRevisionId).toBe(r1);
    const [info] = await renderInfo([r1]);
    expect(info).toMatchObject({
      revisionNumber: 1,
      currentRevisionNumber: 2,
      currentRevisionId: r2,
    });
    // Explicit migration.
    const res = await operate({
      type: 'replace_artifact',
      componentId: sleeve.componentId,
      bindingId: right.artifactBindings[0]!.bindingId,
      artifactRevisionId: r2,
    });
    expect(res.status).toBe(201);
    right = await comp('sleeve', 'right');
    expect(right.artifactBindings[0]?.artifactRevisionId).toBe(r2);
    const rel = (await stateOf()).relationships.find(
      (r) => r.target.entityId === sleeve.componentId,
    );
    expect(rel?.source.entityId).toBe(r2);
  });

  it("another organization's private artifact cannot be used; using one grants no edit rights (AC6)", async () => {
    const foreign = await json<ArtifactDetail>(
      await other.owner.client.post(`/v1/orgs/${other.orgId}/artifacts`, {
        category: 'lace',
        name: 'Secret lace',
        definition: LACE,
      }),
    );
    const sleeve = await comp('sleeve', 'left');
    const res = await operate({
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: foreign.currentRevisionId,
    });
    expect(res.status).toBe(422);
    expect(JSON.stringify((await err(res)).details)).toContain('operation.artifact_unknown');
    expect(await renderInfo([foreign.currentRevisionId!])).toEqual([]);
    // The built-in lace the designer uses stays read-only for them.
    const lace = await platform('Scalloped lace border');
    const patch = await designer.patch(`${org()}/artifacts/${lace.id}`, {
      expectedVersion: lace.version,
      name: 'Mine now',
    });
    expect([403, 404]).toContain(patch.status);
  });

  it('fabrics set the fabric reference and propose their colour; values stay per component (AC5)', async () => {
    const navy = await platform('Navy twill');
    const left = await comp('sleeve', 'left');
    const res = await operate({
      type: 'attach_artifact',
      componentId: left.componentId,
      artifactRevisionId: navy.currentRevisionId,
    });
    expect(res.status).toBe(201);
    const after = await comp('sleeve', 'left');
    expect(after.properties['material.fabric_ref']).toMatchObject({
      value: { entityType: 'artifact_revision', entityId: navy.currentRevisionId },
      status: 'confirmed',
    });
    expect(after.properties['appearance.color']).toMatchObject({
      value: '#1e3a8a',
      status: 'proposed',
      sourceType: 'artifact_revision',
    });
    // The other sleeve is unaffected.
    expect((await comp('sleeve', 'right')).properties['material.fabric_ref']?.status).toBe(
      'missing',
    );
  });

  it('saves a component as a new artifact with a preview from the flat (FR-EDT-057)', async () => {
    const collar = await comp('collar');
    const res = await designer.post(`${org()}/artifacts/from-component`, {
      designId: design.id,
      componentId: collar.componentId,
      name: 'Our spread collar',
    });
    expect(res.status).toBe(201);
    const saved = await json<ArtifactDetail>(res);
    expect(saved).toMatchObject({
      category: 'collar',
      ownerScope: 'user',
      compatibleTargetTypes: ['collar'],
    });
    expect(saved.previewUrl).toContain('/preview');
    const svg = await designer.get(
      `${org()}/artifact-revisions/${saved.currentRevisionId}/preview`,
    );
    expect(svg.status).toBe(200);
    expect(await svg.text()).toContain(collar.componentId);
    const rev = saved.revisions[0]!;
    expect(
      (rev.properties.visual as Record<string, { value: unknown }>)['construction.collar_type']
        ?.value,
    ).toBe('spread');
    // A hem is not an artifact category; another tenant's design is not found.
    const hem = await comp('hem');
    const bad = await designer.post(`${org()}/artifacts/from-component`, {
      designId: design.id,
      componentId: hem.componentId,
      name: 'Hem',
    });
    expect(bad.status).toBe(400);
    const stranger = await other.owner.client.post(
      `/v1/orgs/${other.orgId}/artifacts/from-component`,
      {
        designId: design.id,
        componentId: collar.componentId,
        name: 'Stolen',
      },
    );
    expect(stranger.status).toBe(404);
  });
});
