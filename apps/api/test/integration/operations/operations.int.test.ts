import type {
  Artifact,
  Design,
  DesignOperationView,
  Project,
  SubmitOperationResponse,
  WorkingCopy,
} from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

const err = async (res: Response) =>
  (
    (await res.json()) as {
      error: { code: string; message: string; details?: Record<string, unknown> };
    }
  ).error;

describe('design operations (integration)', () => {
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
      await designer.post(`${org()}/projects/${project.id}/designs`, { name: 'Ops shirt' }),
    );
  const wcOf = async (d: { id: string }) =>
    json<WorkingCopy>(await designer.get(`${org()}/designs/${d.id}/working-copy`));
  const stateOf = async (d: { id: string }) =>
    (await wcOf(d)).state as unknown as GarmentDesignState;
  const find = (s: GarmentDesignState, type: string, side?: string) =>
    s.components.find((c) => c.componentType === type && (side === undefined || c.side === side))!;
  const submit = (
    d: { id: string },
    expectedVersion: number,
    operation: Record<string, unknown>,
    headers: Record<string, string> = {},
    client = designer,
    extra: Record<string, unknown> = {},
  ) =>
    client.post(
      `${org()}/designs/${d.id}/operations`,
      { expectedVersion, operation, ...extra },
      headers,
    );

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Ops Atelier', ['designer', 'viewer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Ops', []);
    orgId = t.orgId;
    designer = t.members.designer!.client;
    viewer = t.members.viewer!.client;
    project = await json<Project>(
      await designer.post(`${org()}/projects`, { name: 'Ops project' }),
    );
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records target, versions, strategy and provenance; returns only the changed entities (AC2, AC6)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const sleeve = find(s, 'sleeve', 'left');
    const res = await submit(
      d,
      1,
      {
        type: 'set_property',
        componentId: sleeve.componentId,
        key: 'dimension.sleeve_length',
        value: 60,
        unit: 'cm',
      },
      {},
      designer,
      {
        preservationConstraints: [{ target: 'garment_silhouette' }],
      },
    );
    expect(res.status).toBe(201);
    const body = await json<SubmitOperationResponse>(res);
    expect(body.operation).toMatchObject({
      displayId: expect.stringMatching(/^OPR-\d{6}$/),
      operationType: 'set_property',
      status: 'completed',
      baseRevisionId: d.headRevisionId,
      baseWorkingCopyVersion: 1,
      resultWorkingCopyVersion: 2,
      executionStrategy: 'deterministic_model_update',
      strategyRationale: expect.stringContaining('no AI needed'),
      targetEntities: [{ entityType: 'design_component', entityId: sleeve.componentId }],
      preservationConstraints: [{ target: 'garment_silhouette', requirement: 'preserve' }],
      revertible: true,
      resultRevisionId: null,
    });
    expect(body.workingCopy).toMatchObject({ version: 2, hasUncommittedChanges: true });
    expect(Object.keys(body.patch.components)).toEqual([sleeve.componentId]);
    expect(body.patch.components[sleeve.componentId]).toMatchObject({
      properties: {
        'dimension.sleeve_length': {
          value: 600,
          unit: 'mm',
          status: 'confirmed',
          sourceType: 'user_input',
        },
      },
    });
    const one = await json<DesignOperationView>(
      await viewer.get(`${org()}/operations/${body.operation.id}`),
    );
    expect(one.id).toBe(body.operation.id);
    const history = await json<{ items: DesignOperationView[] }>(
      await viewer.get(`${org()}/designs/${d.id}/operations`),
    );
    expect(history.items.map((o) => o.id)).toEqual([body.operation.id]);
    // Viewers cannot change designs.
    expect(
      (
        await submit(
          d,
          2,
          { type: 'rename_component', componentId: sleeve.componentId, displayName: 'x' },
          {},
          viewer,
        )
      ).status,
    ).toBe(403);
  });

  it('invalid operations leave the working copy untouched and are audited (AC3)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const collar = find(s, 'collar');
    const bad = await submit(d, 1, {
      type: 'set_property',
      componentId: collar.componentId,
      key: 'construction.collar_type',
      value: 'wing',
    });
    expect(bad.status).toBe(422);
    const e = await err(bad);
    expect(e.code).toBe('VALIDATION_BLOCKED');
    expect((e.details?.findings as { ruleId: string }[])[0]?.ruleId).toBe(
      'property.enum_value_not_allowed',
    );
    const deps = await submit(d, 1, {
      type: 'remove_component',
      componentId: find(s, 'sleeve', 'left').componentId,
    });
    expect(((await err(deps)).details?.findings as { ruleId: string }[])[0]?.ruleId).toBe(
      'operation.has_dependents',
    );
    expect((await wcOf(d)).version).toBe(1);
    expect(
      await prisma.auditEvent.count({
        where: {
          organizationId: orgId,
          eventType: 'operations.design_operation_rejected',
          resourceId: d.id,
        },
      }),
    ).toBe(2);
    // Schema problems and server-only operation types are plain validation errors.
    expect((await submit(d, 1, { type: 'set_property', componentId: 'nope' })).status).toBe(400);
    expect((await submit(d, 1, { type: 'replace_state', state: {} })).status).toBe(400);
    expect((await submit(d, 1, { type: 'restore_entities', components: {} })).status).toBe(400);
  });

  it('attaching built-in lace to a sleeve hem pins the exact revision with an approximate placement (AC4, AC5)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const lace = (
      await json<{ items: Artifact[] }>(
        await designer.get(`${org()}/artifacts?scope=platform&q=Scalloped lace`),
      )
    ).items[0]!;
    const sleeve = find(s, 'sleeve', 'left');
    const res = await submit(d, 1, {
      type: 'attach_artifact',
      componentId: sleeve.componentId,
      artifactRevisionId: lace.currentRevisionId,
      placement: { region: 'hem' },
    });
    expect(res.status).toBe(201);
    const body = await json<SubmitOperationResponse>(res);
    expect(body.operation.executionStrategy).toBe('rule_based_composition');
    const after = await stateOf(d);
    expect(find(after, 'sleeve', 'left').artifactBindings[0]).toMatchObject({
      artifactId: lace.id,
      artifactRevisionId: lace.currentRevisionId,
    });
    expect(after.relationships[0]).toMatchObject({
      type: 'decorative_trim_applied_to',
      source: { entityType: 'artifact_revision', entityId: lace.currentRevisionId },
      target: { entityType: 'design_component', entityId: sleeve.componentId },
      placement: { region: 'hem', approximate: true },
      status: 'needs_review',
      provenanceRefs: [body.operation.id],
    });
    expect(body.findings.map((f) => f.ruleId)).toContain('placement.approximate');
    // Not on a collar.
    const collar = await submit(d, 2, {
      type: 'attach_artifact',
      componentId: find(s, 'collar').componentId,
      artifactRevisionId: lace.currentRevisionId,
    });
    expect(((await err(collar)).details?.findings as { ruleId: string }[])[0]?.ruleId).toBe(
      'artifact.target_incompatible',
    );
  });

  it("another organization's artifact cannot be used", async () => {
    const theirs = await json<{ currentRevisionId: string }>(
      await other.owner.client.post(`/v1/orgs/${other.orgId}/artifacts`, {
        category: 'lace',
        name: 'Theirs',
        scope: 'organization',
        definition: { compatibleTargetTypes: ['sleeve'] },
      }),
    );
    const d = await newDesign();
    const s = await stateOf(d);
    const res = await submit(d, 1, {
      type: 'attach_artifact',
      componentId: find(s, 'sleeve', 'left').componentId,
      artifactRevisionId: theirs.currentRevisionId,
    });
    expect(res.status).toBe(422);
    expect(((await err(res)).details?.findings as { ruleId: string }[])[0]?.ruleId).toBe(
      'operation.artifact_unknown',
    );
  });

  it('conflicting writes: exactly one of two submits with the same version wins (AC8)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const id = find(s, 'collar').componentId;
    const [a, b] = await Promise.all([
      submit(d, 1, { type: 'rename_component', componentId: id, displayName: 'A' }),
      submit(d, 1, { type: 'rename_component', componentId: id, displayName: 'B' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(await err(loser)).toMatchObject({
      code: 'CONCURRENT_MODIFICATION',
      details: { currentVersion: 2 },
    });
    expect((await wcOf(d)).version).toBe(2);
  });

  it('retrying with the same Idempotency-Key changes nothing twice (AC7)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const op = {
      type: 'rename_component',
      componentId: find(s, 'collar').componentId,
      displayName: 'Same',
    };
    const key = `op-${Math.random()}`;
    const first = await json<SubmitOperationResponse>(
      await submit(d, 1, op, { 'Idempotency-Key': key }),
    );
    const retry = await submit(d, 1, op, { 'Idempotency-Key': key });
    expect(retry.status).toBe(201);
    expect((await json<SubmitOperationResponse>(retry)).operation.id).toBe(first.operation.id);
    expect((await wcOf(d)).version).toBe(2);
    expect(await prisma.designOperation.count({ where: { designId: d.id } })).toBe(1);
    const other = await submit(
      d,
      1,
      { ...op, displayName: 'Different' },
      { 'Idempotency-Key': key },
    );
    expect((await err(other)).code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('AI-only operations report the limitation instead of running (STR-004)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const res = await submit(
      d,
      1,
      {
        type: 'regenerate_region',
        componentId: find(s, 'collar').componentId,
        instruction: 'rounder',
      },
      {},
      designer,
      {
        executionPolicy: { allowAi: true },
      },
    );
    expect(res.status).toBe(422);
    expect(await err(res)).toMatchObject({
      code: 'UNSUPPORTED_CAPABILITY',
      details: { reason: 'no_engine_available' },
    });
  });

  it('undo and redo through revert_operation; refused when the same entity changed since', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const collar = find(s, 'collar').componentId;
    const renamed = await json<SubmitOperationResponse>(
      await submit(d, 1, { type: 'rename_component', componentId: collar, displayName: 'Band' }),
    );
    const undo = await json<SubmitOperationResponse>(
      await submit(d, 2, { type: 'revert_operation', operationId: renamed.operation.id }),
    );
    expect(undo.operation).toMatchObject({
      operationType: 'revert_operation',
      revertsOperationId: renamed.operation.id,
    });
    expect(find(await stateOf(d), 'collar').displayName).toBe('Collar');
    expect(
      (
        await json<DesignOperationView>(
          await designer.get(`${org()}/operations/${renamed.operation.id}`),
        )
      ).status,
    ).toBe('reverted');
    // Undoing twice is refused.
    expect(
      (
        await err(
          await submit(d, 3, { type: 'revert_operation', operationId: renamed.operation.id }),
        )
      ).code,
    ).toBe('INVALID_STATE_TRANSITION');
    // Redo = revert the revert.
    await submit(d, 3, { type: 'revert_operation', operationId: undo.operation.id });
    expect(find(await stateOf(d), 'collar').displayName).toBe('Band');
    expect(
      (
        await json<DesignOperationView>(
          await designer.get(`${org()}/operations/${renamed.operation.id}`),
        )
      ).status,
    ).toBe('completed');
    // A later change to the same component blocks undoing the earlier one.
    await submit(d, 4, { type: 'set_component_visibility', componentId: collar, visible: false });
    const blocked = await submit(d, 5, {
      type: 'revert_operation',
      operationId: renamed.operation.id,
    });
    expect(await err(blocked)).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'changed_since' },
    });
  });

  it('dry-run validation stores nothing; a commit links the pending operations (OPR-004)', async () => {
    const d = await newDesign();
    const s = await stateOf(d);
    const id = find(s, 'collar').componentId;
    const dry = await viewer.post(`${org()}/designs/${d.id}/operations/validate`, {
      expectedVersion: 1,
      operation: { type: 'rename_component', componentId: id, displayName: 'Preview' },
    });
    expect(await json(dry)).toMatchObject({
      valid: true,
      executionStrategy: 'deterministic_model_update',
      patch: { components: { [id]: { displayName: 'Preview' } } },
    });
    const invalid = await json<{ valid: boolean; findings: { ruleId: string }[] }>(
      await viewer.post(`${org()}/designs/${d.id}/operations/validate`, {
        expectedVersion: 1,
        operation: {
          type: 'set_property',
          componentId: id,
          key: 'construction.collar_type',
          value: 'wing',
        },
      }),
    );
    expect(invalid).toMatchObject({
      valid: false,
      findings: [{ ruleId: 'property.enum_value_not_allowed' }],
    });
    expect((await wcOf(d)).version).toBe(1);
    expect(await prisma.designOperation.count({ where: { designId: d.id } })).toBe(0);

    const a = await json<SubmitOperationResponse>(
      await submit(d, 1, { type: 'rename_component', componentId: id, displayName: 'One' }),
    );
    const b = await json<SubmitOperationResponse>(
      await submit(d, 2, { type: 'set_component_lock', componentId: id, locked: true }),
    );
    const commit = await designer.post(`${org()}/designs/${d.id}/revisions`, {
      expectedVersion: 3,
    });
    expect(commit.status).toBe(201);
    const { revision } = await json<{ revision: { id: string } }>(commit);
    const row = await prisma.designRevision.findUniqueOrThrow({ where: { id: revision.id } });
    expect(row.operationIds.sort()).toEqual([a.operation.id, b.operation.id].sort());
    expect(
      (await json<DesignOperationView>(await designer.get(`${org()}/operations/${a.operation.id}`)))
        .resultRevisionId,
    ).toBe(revision.id);
  });
});
