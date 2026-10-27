import type {
  Design,
  Project,
  RevisionSummary,
  ValidationRun,
  WorkingCopy,
} from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { KEEP_WORKING_COPY_RUNS } from '../../../src/modules/validation/validation.service.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

describe('design-structure validation (I20, integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;
  let designer: TestClient;
  let viewer: TestClient;
  let orgId: string;
  let project: Project;

  const org = () => `/v1/orgs/${orgId}`;
  const newDesign = async () =>
    json<Design>(
      await designer.post(`${org()}/projects/${project.id}/designs`, { name: 'Checked shirt' }),
    );
  const wcOf = async (d: { id: string }) =>
    json<WorkingCopy>(await designer.get(`${org()}/designs/${d.id}/working-copy`));
  const find = (s: GarmentDesignState, type: string, side?: string) =>
    s.components.find((c) => c.componentType === type && (side === undefined || c.side === side))!;
  const operate = async (d: { id: string }, operation: Record<string, unknown>) => {
    const wc = await wcOf(d);
    const res = await designer.post(`${org()}/designs/${d.id}/operations`, {
      expectedVersion: wc.version,
      operation,
    });
    expect(res.status).toBe(201);
  };
  const run = async (d: { id: string }, body: Record<string, unknown> = {}, client = designer) => {
    const res = await client.post(`${org()}/designs/${d.id}/validation-runs`, body);
    expect(res.status).toBe(201);
    return json<ValidationRun>(res);
  };
  const latest = async (d: { id: string }, qs = '') =>
    (
      await json<{ run: ValidationRun | null }>(
        await designer.get(`${org()}/designs/${d.id}/validation-runs/latest${qs}`),
      )
    ).run;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Validation Atelier', ['designer', 'viewer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Validation', []);
    orgId = t.orgId;
    designer = t.members.designer!.client;
    viewer = t.members.viewer!.client;
    project = await json<Project>(await designer.post(`${org()}/projects`, { name: 'Checks' }));
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the constraint set is recorded at start; a fresh design has no errors (AC3, AC5)', async () => {
    const set = await prisma.constraintSet.findUnique({
      where: { key_version: { key: 'design-structure', version: '1.0.0' } },
    });
    expect(set?.rules).toContain('dependency.cuff_requires_sleeve@1.0.0');
    const d = await newDesign();
    expect(await latest(d)).toBeNull();
    const r = await run(d);
    expect(r).toMatchObject({
      target: 'working_copy',
      targetVersion: 1,
      constraintSet: 'design-structure@1.0.0',
      stale: false,
      counts: { errors: 0, warnings: 0, manualReview: 0 },
    });
    expect(r.scopeNote).toMatch(/not production readiness/);
    expect(r.findings.every((f) => f.severity === 'info')).toBe(true);
    // Same state + same set ⇒ the stored run is returned (repeatable, CST-004).
    expect((await run(d)).id).toBe(r.id);
  });

  it('findings name entity, rule, explanation and resolution; old runs go stale (AC1, AC4)', async () => {
    const d = await newDesign();
    const first = await run(d);
    const s = (await wcOf(d)).state as unknown as GarmentDesignState;
    const sleeve = find(s, 'sleeve', 'left');
    const cuff = find(s, 'cuff', 'left');
    await operate(d, {
      type: 'set_property',
      componentId: sleeve.componentId,
      key: 'construction.sleeve_type',
      value: 'sleeveless',
    });
    const stale = (await latest(d))!;
    expect(stale.id).toBe(first.id);
    expect(stale).toMatchObject({ stale: true, targetVersion: 1, currentVersion: 2 });

    const fresh = await run(d);
    expect(fresh).toMatchObject({ stale: false, targetVersion: 2 });
    expect(fresh.counts.errors).toBe(1);
    const blocking = fresh.findings[0]!;
    expect(blocking).toMatchObject({
      ruleId: 'dependency.cuff_requires_sleeve',
      ruleVersion: '1.0.0',
      severity: 'blocking',
      outcome: 'error',
      entity: { entityType: 'design_component', entityId: cuff.componentId },
    });
    expect(blocking.message).toContain('sleeveless');
    expect(blocking.resolution).toMatch(/Remove/);
    // The cuff's own values no longer apply either (reported, never cleared automatically).
    expect(
      fresh.findings.find((f) => f.ruleId === 'exclusive.conflicting_value')?.entity?.entityId,
    ).toBe(cuff.componentId);

    // Fixing it removes the finding.
    await operate(d, { type: 'remove_component', componentId: cuff.componentId, cascade: false });
    const fixed = await run(d);
    expect(fixed.findings.some((f) => f.ruleId === 'dependency.cuff_requires_sleeve')).toBe(false);
    // Readable by id; other tenants get 404.
    expect(
      (await json<ValidationRun>(await designer.get(`${org()}/validation-runs/${fixed.id}`))).id,
    ).toBe(fixed.id);
    expect(
      (await other.owner.client.get(`/v1/orgs/${other.orgId}/validation-runs/${fixed.id}`)).status,
    ).toBe(404);
    expect(
      (await other.owner.client.post(`/v1/orgs/${other.orgId}/designs/${d.id}/validation-runs`, {}))
        .status,
    ).toBe(404);
  });

  it('commits record the summary with the set version; revision runs repeat exactly (AC3)', async () => {
    const d = await newDesign();
    const s = (await wcOf(d)).state as unknown as GarmentDesignState;
    await operate(d, {
      type: 'set_property',
      componentId: find(s, 'sleeve', 'right').componentId,
      key: 'dimension.sleeve_length',
      value: 120,
      unit: 'cm',
    });
    const wcRun = await run(d);
    expect(wcRun.counts.errors).toBe(1);
    const wc = await wcOf(d);
    const commit = await designer.post(`${org()}/designs/${d.id}/revisions`, {
      expectedVersion: wc.version,
      summary: 'Very long sleeve',
    });
    expect(commit.status).toBe(201);
    const { revision } = await json<{ revision: RevisionSummary }>(commit);
    expect(revision.validationSummary).toMatchObject({
      errors: 1,
      constraintSet: 'design-structure@1.0.0',
    });
    const a = await run(d, { target: 'revision', revisionId: revision.id });
    expect(a).toMatchObject({
      target: 'revision',
      revisionId: revision.id,
      stale: false,
      currentVersion: null,
    });
    expect(a.counts).toEqual(wcRun.counts);
    expect(a.findings.map((f) => f.findingId)).toEqual(wcRun.findings.map((f) => f.findingId));
    expect((await run(d, { target: 'revision', revisionId: revision.id })).id).toBe(a.id);
    expect((await latest(d, `?target=revision&revisionId=${revision.id}`))!.id).toBe(a.id);
    // Viewers can check designs too (design.view).
    expect((await run(d, { target: 'revision', revisionId: revision.id }, viewer)).id).toBe(a.id);
    const bad = await designer.post(`${org()}/designs/${d.id}/validation-runs`, {
      target: 'revision',
    });
    expect(bad.status).toBe(400);
  });

  it(`keeps the newest ${KEEP_WORKING_COPY_RUNS} working-copy runs of a design`, async () => {
    const d = await newDesign();
    const s = (await wcOf(d)).state as unknown as GarmentDesignState;
    const sleeve = find(s, 'sleeve', 'left');
    for (let i = 0; i < KEEP_WORKING_COPY_RUNS + 2; i++) {
      await operate(d, {
        type: 'set_property',
        componentId: sleeve.componentId,
        key: 'dimension.sleeve_length',
        value: 600 + i,
        unit: 'mm',
      });
      await run(d);
    }
    const count = await prisma.validationRun.count({
      where: { designId: d.id, targetType: 'working_copy' },
    });
    expect(count).toBe(KEEP_WORKING_COPY_RUNS);
  });
});
