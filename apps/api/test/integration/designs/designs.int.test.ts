import { ErrorHttpStatus } from '@ai-designer/contracts';
import type {
  CompareResponse,
  Design,
  EditorState,
  Project,
  Revision,
  RevisionSummary,
  WorkingCopy,
} from '@ai-designer/contracts';
import { userValue, type GarmentDesignState } from '@ai-designer/garment-model';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuthorizationService } from '../../../src/modules/authorization/authorization.service.js';
import { OperationsService } from '../../../src/modules/operations/operations.service.js';
import { AppError } from '../../../src/platform/errors/app-error.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

const WHEN = '2026-10-26T10:00:00.000Z';
const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;

type Commit = { revision: RevisionSummary; workingCopyVersion: number };

function edit(state: Record<string, unknown>, mutate: (s: GarmentDesignState) => void) {
  const copy = structuredClone(state) as unknown as GarmentDesignState;
  mutate(copy);
  return copy as unknown as Record<string, unknown>;
}
const sleeve = (s: GarmentDesignState, side = 'left') =>
  s.components.find((c) => c.componentType === 'sleeve' && c.side === side)!;

describe('designs: working copies and immutable revisions (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;
  let owner: TestClient;
  let designer: TestClient;
  let viewer: TestClient;
  let orgId: string;
  let designerUserId: string;
  let project: Project;

  const org = () => `/v1/orgs/${orgId}`;
  const newProject = async (client = designer, name = `P ${Math.random()}`) =>
    json<Project>(await client.post(`${org()}/projects`, { name }));
  const newDesign = async (
    body: Record<string, unknown> = {},
    client = designer,
    projectId = project.id,
  ) => {
    const res = await client.post(`${org()}/projects/${projectId}/designs`, {
      name: 'Oxford shirt',
      ...body,
    });
    expect(res.status).toBe(201);
    return json<Design>(res);
  };
  const wcOf = async (d: { id: string }, client = designer) =>
    json<WorkingCopy>(await client.get(`${org()}/designs/${d.id}/working-copy`));
  /**
   * Full-state replacement now exists only as an internal operation (I14); tests use it to set up
   * arbitrary states. Returns a Response like the HTTP API would.
   */
  const save = async (
    d: { id: string },
    version: number,
    state: Record<string, unknown>,
    client = designer,
  ): Promise<Response> => {
    const userId = (await json<{ id: string }>(await client.get('/v1/me'))).id;
    const ctx = await app.get(AuthorizationService).contextFor(orgId, userId);
    try {
      await app
        .get(OperationsService)
        .applyInternal(ctx!, d.id, version, { type: 'replace_state', state });
      return new Response(JSON.stringify(await wcOf(d, client)), { status: 200 });
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      return new Response(
        JSON.stringify({ error: { code: e.code, message: e.message, details: e.details } }),
        {
          status: ErrorHttpStatus[e.code],
        },
      );
    }
  };
  const operate = (
    d: { id: string },
    version: number,
    operation: Record<string, unknown>,
    client = designer,
  ) => client.post(`${org()}/designs/${d.id}/operations`, { expectedVersion: version, operation });
  const commit = (
    d: { id: string },
    version: number,
    body: Record<string, unknown> = {},
    headers: Record<string, string> = {},
    client = designer,
  ) =>
    client.post(
      `${org()}/designs/${d.id}/revisions`,
      { expectedVersion: version, ...body },
      headers,
    );
  const history = async (d: { id: string }) =>
    (
      await json<{ items: RevisionSummary[] }>(
        await designer.get(`${org()}/designs/${d.id}/revisions?limit=100`),
      )
    ).items;
  const setLength = (mm: number) => (s: GarmentDesignState) => {
    sleeve(s).properties['dimension.sleeve_length'] = userValue(
      mm,
      { confirmedBy: designerUserId, confirmedAt: WHEN },
      'mm',
    );
  };
  /** Save + commit one change; returns the commit result. */
  const change = async (d: Design, mm: number, summary?: string): Promise<Commit> => {
    const wc = await wcOf(d);
    const saved = await json<WorkingCopy>(await save(d, wc.version, edit(wc.state, setLength(mm))));
    const res = await commit(d, saved.version, summary ? { summary } : {});
    expect(res.status).toBe(201);
    return json<Commit>(res);
  };

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Design Atelier', ['designer', 'viewer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Atelier', []);
    orgId = t.orgId;
    owner = t.owner.client;
    designer = t.members.designer!.client;
    viewer = t.members.viewer!.client;
    designerUserId = (await json<{ id: string }>(await designer.get('/v1/me'))).id;
    project = await newProject();
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a design from a template with R001, a working copy and the project default', async () => {
    const p = await newProject();
    const d = await newDesign({ template: 'woven_shirt' }, designer, p.id);
    expect(d).toMatchObject({
      displayId: expect.stringMatching(/^DSN-\d{6}$/),
      projectId: p.id,
      garmentType: 'shirt',
      garmentCategory: 'woven_shirt',
      status: 'DRAFT',
      headRevisionNumber: 1,
      approvedRevisionId: null,
      workingCopyVersion: 1,
      hasUncommittedChanges: false,
    });
    const revs = await history(d);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({
      displayId: `${d.displayId}-R001`,
      parentRevisionIds: [],
      changeSummary: 'Created from the Woven shirt template',
      schemaVersion: '1.0.0',
      contentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    const wc = await wcOf(d);
    expect(wc).toMatchObject({ version: 1, baseRevisionId: d.headRevisionId, migratedFrom: null });
    expect((wc.state as { components: unknown[] }).components.length).toBeGreaterThan(5);
    const proj = await json<Project>(await designer.get(`${org()}/projects/${p.id}`));
    expect(proj.defaultDesignId).toBe(d.id);
    // A second design does not take over the default.
    await newDesign({ template: 'blank' }, designer, p.id);
    expect(
      (await json<Project>(await designer.get(`${org()}/projects/${p.id}`))).defaultDesignId,
    ).toBe(d.id);
    // Viewers can read but not create.
    expect((await viewer.get(`${org()}/designs/${d.id}`)).status).toBe(200);
    expect((await viewer.post(`${org()}/projects/${p.id}/designs`, { name: 'x' })).status).toBe(
      403,
    );
  });

  it('a blank design starts empty; the dependents registry counts designs', async () => {
    const p = await newProject();
    const d = await newDesign({ template: 'blank', name: 'Idea' }, designer, p.id);
    expect(d).toMatchObject({ garmentType: 'unspecified', garmentCategory: null });
    expect((await wcOf(d)).state).toMatchObject({ components: [] });
    const deps = await json<{ items: { type: string; count: number }[] }>(
      await designer.get(`${org()}/projects/${p.id}/dependents`),
    );
    expect(deps.items).toContainEqual(expect.objectContaining({ type: 'designs', count: 1 }));
  });

  it('autosave never creates revisions; commit creates one with lineage and pinned refs (AC1, AC3)', async () => {
    const d = await newDesign();
    const wc = await wcOf(d);
    const state = edit(wc.state, (s) => {
      setLength(580)(s);
      sleeve(s, 'right').artifactBindings = [
        {
          bindingId: 'bnd_aaaaaaaaaaaa',
          artifactId: 'art-lace',
          artifactRevisionId: 'rev-lace-2',
          role: null,
        },
      ];
      sleeve(s, 'right').assetRefs = [{ assetId: 'asset-photo-1', role: 'reference' }];
    });
    let version = wc.version;
    for (let i = 0; i < 3; i++) {
      const saved = await json<WorkingCopy>(
        await save(
          d,
          version,
          edit(state, (s) => {
            s.metadata = { n: i };
          }),
        ),
      );
      version = saved.version;
      expect(saved.hasUncommittedChanges).toBe(true);
    }
    expect(await history(d)).toHaveLength(1);
    // An operation that changes nothing is refused and does not bump the version.
    const same = await save(
      d,
      version,
      edit(state, (s) => {
        s.metadata = { n: 2 };
      }),
    );
    expect(same.status).toBe(409);
    expect((await wcOf(d)).version).toBe(version);

    const res = await commit(d, version, { summary: 'Longer sleeves' });
    expect(res.status).toBe(201);
    const { revision, workingCopyVersion } = await json<Commit>(res);
    expect(revision).toMatchObject({
      revisionNumber: 2,
      displayId: `${d.displayId}-R002`,
      parentRevisionIds: [d.headRevisionId],
      artifactRevisionRefs: ['rev-lace-2'],
      sourceAssetRefs: ['asset-photo-1'],
      createdBy: designerUserId,
      createdByName: expect.any(String),
      reviewStatus: null,
    });
    expect(revision.changeSummary.startsWith('Longer sleeves\n')).toBe(true);
    expect(revision.changeSummary).toContain('• Left sleeve: Sleeve length set to 580 mm');
    expect(revision.changeSummary).toContain('Right sleeve: uses artifact revision rev-lace-2');
    const after = await wcOf(d);
    expect(after).toMatchObject({
      version: workingCopyVersion,
      baseRevisionId: revision.id,
      hasUncommittedChanges: false,
    });
    const design = await json<Design>(await designer.get(`${org()}/designs/${d.id}`));
    expect(design).toMatchObject({ headRevisionId: revision.id, headRevisionNumber: 2 });

    const full = await json<Revision>(await designer.get(`${org()}/revisions/${revision.id}`));
    expect(full.integrity).toBe('verified');
    expect(full.snapshot).toMatchObject({ schemaVersion: '1.0.0', garmentCategory: 'woven_shirt' });
    expect(full.changeDiffSummary).toMatchObject({
      counts: { propertiesChanged: expect.any(Number) },
    });

    const outbox = await prisma.outboxEvent.findMany({
      where: { organizationId: orgId, type: { startsWith: 'designs.' } },
    });
    expect(outbox.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'designs.design_created',
        'designs.working_copy_updated',
        'designs.revision_committed',
      ]),
    );
    const audits = await prisma.auditEvent.count({
      where: { organizationId: orgId, eventType: 'designs.revision_committed', resourceId: d.id },
    });
    expect(audits).toBe(1);
  });

  it('rejects commits with no semantic changes unless asked (NO_CHANGES)', async () => {
    const d = await newDesign();
    const wc = await wcOf(d);
    const res = await commit(d, wc.version);
    expect(res.status).toBe(409);
    expect((await code(res)).code).toBe('NO_CHANGES');
    // Metadata only is still "no changes".
    const saved = await json<WorkingCopy>(
      await save(
        d,
        wc.version,
        edit(wc.state, (s) => {
          s.metadata = { note: 'x' };
        }),
      ),
    );
    expect(saved.hasUncommittedChanges).toBe(false);
    expect((await commit(d, saved.version)).status).toBe(409);
    const forced = await commit(d, saved.version, { allowNoChanges: true });
    expect(forced.status).toBe(201);
  });

  it('blocks structurally invalid states and returns warnings for valid ones', async () => {
    const d = await newDesign();
    const wc = await wcOf(d);
    const bad = await save(
      d,
      wc.version,
      edit(wc.state, (s) => {
        sleeve(s).properties['dimension.sleeve_length'] = {
          ...userValue(580, { confirmedBy: 'u', confirmedAt: WHEN }),
          unit: null,
        };
      }),
    );
    expect(bad.status).toBe(422);
    const err = await code(bad);
    expect(err.code).toBe('VALIDATION_BLOCKED');
    expect((err.details?.findings as { ruleId: string }[]).map((f) => f.ruleId)).toContain(
      'property.unit_missing',
    );
    const garbage = await save(d, wc.version, { schemaVersion: '9.0.0' });
    expect(garbage.status).toBe(422);
    const warned = await json<WorkingCopy>(
      await save(
        d,
        wc.version,
        edit(wc.state, (s) => {
          sleeve(s).side = 'none';
        }),
      ),
    );
    expect(warned.findings.map((f) => f.ruleId)).toContain('component.side_missing');
  });

  it('detects conflicting writes and never silently overwrites (AC4)', async () => {
    const d = await newDesign();
    const wc = await wcOf(d);
    const [a, b] = await Promise.all([
      save(d, wc.version, edit(wc.state, setLength(500))),
      save(d, wc.version, edit(wc.state, setLength(600))),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const err = await code(loser);
    expect(err).toMatchObject({ code: 'CONCURRENT_MODIFICATION', details: { currentVersion: 2 } });
    // A stale commit fails too.
    expect((await commit(d, wc.version)).status).toBe(409);
  });

  it('the same Idempotency-Key commits once (AC-013)', async () => {
    const d = await newDesign();
    const wc = await wcOf(d);
    const saved = await json<WorkingCopy>(
      await save(d, wc.version, edit(wc.state, setLength(610))),
    );
    const key = `commit-${Math.random()}`;
    const first = await commit(d, saved.version, {}, { 'Idempotency-Key': key });
    const second = await commit(d, saved.version, {}, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await json<Commit>(second)).revision.id).toBe((await json<Commit>(first)).revision.id);
    expect(await history(d)).toHaveLength(2);
  });

  it('revisions are immutable in the database and tampering is detected (AC2)', async () => {
    const d = await newDesign();
    const id = d.headRevisionId!;
    await expect(
      prisma.$executeRaw`UPDATE design_revisions SET change_summary = 'x' WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`UPDATE design_revisions SET snapshot = '{}'::jsonb WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/immutable/);
    await expect(
      prisma.$executeRaw`DELETE FROM design_revisions WHERE id = ${id}::uuid`,
    ).rejects.toThrow(/immutable/);

    // Simulate tampering behind the trigger's back.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE design_revisions DISABLE TRIGGER design_revisions_immutable',
      );
      await tx.$executeRaw`UPDATE design_revisions SET snapshot = jsonb_set(snapshot, '{garmentType}', '"dress"') WHERE id = ${id}::uuid`;
      await tx.$executeRawUnsafe(
        'ALTER TABLE design_revisions ENABLE TRIGGER design_revisions_immutable',
      );
    });
    const res = await designer.get(`${org()}/revisions/${id}`);
    expect(res.status).toBe(500);
    expect((await code(res)).code).toBe('INTEGRITY_CHECK_FAILED');
    // Restore and compare refuse the tampered revision too.
    const wc = await wcOf(d);
    expect(
      (
        await designer.post(`${org()}/designs/${d.id}/restore`, {
          revisionId: id,
          expectedVersion: wc.version,
        })
      ).status,
    ).toBe(500);
  });

  it('restore keeps history; commit after restore records the lineage (AC5, AC-004)', async () => {
    const d = await newDesign();
    const r1 = d.headRevisionId!;
    const c2 = await change(d, 520);
    const c3 = await change(d, 540);
    const wc = await wcOf(d);
    const restored = await designer.post(`${org()}/designs/${d.id}/restore`, {
      revisionId: r1,
      expectedVersion: wc.version,
    });
    expect(restored.status).toBe(200);
    const rwc = await json<WorkingCopy>(restored);
    expect(rwc).toMatchObject({
      baseRevisionId: r1,
      restoredFromRevisionId: r1,
      hasUncommittedChanges: true,
    });
    expect(
      sleeve(rwc.state as unknown as GarmentDesignState).properties['dimension.sleeve_length']!
        .status,
    ).toBe('missing');
    expect(await history(d)).toHaveLength(3);

    const res = await commit(d, rwc.version, { summary: 'Back to the original' });
    expect(res.status).toBe(201);
    const { revision: r4 } = await json<Commit>(res);
    expect(r4).toMatchObject({
      revisionNumber: 4,
      parentRevisionIds: [c3.revision.id],
      restoredFromRevisionId: r1,
    });
    const all = await history(d);
    expect(all.map((r) => r.revisionNumber)).toEqual([4, 3, 2, 1]);
    expect(all.find((r) => r.id === c2.revision.id)).toBeDefined();
    // The working copy no longer carries the restore marker.
    expect((await wcOf(d)).restoredFromRevisionId).toBeNull();
    // Restoring a revision of another design is "not found".
    const otherDesign = await newDesign();
    const v = (await wcOf(d)).version;
    const foreign = await designer.post(`${org()}/designs/${d.id}/restore`, {
      revisionId: otherDesign.headRevisionId,
      expectedVersion: v,
    });
    expect(foreign.status).toBe(404);
    expect((await code(foreign)).code).toBe('REVISION_NOT_FOUND');
  });

  it('compares revisions and the working copy structurally (AC6)', async () => {
    const d = await newDesign();
    const r1 = d.headRevisionId!;
    const c2 = await change(d, 560);
    const res = await designer.get(
      `${org()}/designs/${d.id}/compare?from=${r1}&to=${c2.revision.id}`,
    );
    expect(res.status).toBe(200);
    const cmp = await json<CompareResponse>(res);
    expect(cmp.from).toMatchObject({ kind: 'revision', label: `${d.displayId}-R001` });
    expect(cmp.summary).toContain('Left sleeve: Sleeve length set to 560 mm');
    expect(cmp.diff).toMatchObject({
      hasSemanticChanges: true,
      components: { changed: [expect.objectContaining({ properties: expect.any(Array) })] },
    });
    // vs working copy
    const wc = await wcOf(d);
    await save(
      d,
      wc.version,
      edit(wc.state, (s) => {
        s.components = s.components.filter((c) => c.componentType !== 'pocket');
      }),
    );
    const vsWorking = await json<CompareResponse>(
      await designer.get(`${org()}/designs/${d.id}/compare?from=${c2.revision.id}&to=working`),
    );
    expect(vsWorking.to).toMatchObject({ kind: 'working', id: null });
    expect(vsWorking.summary).toEqual(['Removed Chest pocket']);
    expect((await designer.get(`${org()}/designs/${d.id}/compare?from=${r1}&to=nope`)).status).toBe(
      400,
    );
  });

  it('duplicates the latest revision without approvals, also into another project (AC7)', async () => {
    const d = await newDesign();
    await change(d, 590);
    await prisma.$executeRaw`UPDATE designs SET status = 'APPROVED', approved_revision_id = head_revision_id WHERE id = ${d.id}::uuid`;
    const target = await newProject();
    const res = await designer.post(`${org()}/designs/${d.id}/duplicate`, {
      targetProjectId: target.id,
    });
    expect(res.status).toBe(201);
    const copy = await json<Design>(res);
    expect(copy).toMatchObject({
      projectId: target.id,
      name: 'Copy of Oxford shirt',
      status: 'DRAFT',
      approvedRevisionId: null,
      headRevisionNumber: 1,
      duplicatedFromDesignId: d.id,
    });
    const [rev] = await history(copy);
    expect(rev!.changeSummary).toBe(`Duplicated from ${d.displayId}-R002`);
    const state = (await wcOf(copy)).state as unknown as GarmentDesignState;
    expect(sleeve(state).properties['dimension.sleeve_length']!.value).toBe(590);
    expect(state.provenance).toMatchObject({ createdFrom: 'duplicate' });
    const origIds = ((await wcOf(d)).state as unknown as GarmentDesignState).components.map(
      (c) => c.componentId,
    );
    expect(state.components.some((c) => origIds.includes(c.componentId))).toBe(false);
    // Viewers cannot duplicate; unknown target projects are not found.
    expect((await viewer.post(`${org()}/designs/${d.id}/duplicate`, {})).status).toBe(403);
    const missing = await designer.post(`${org()}/designs/${d.id}/duplicate`, {
      targetProjectId: '0197b0a0-0000-7000-8000-000000000000',
    });
    expect(missing.status).toBe(404);
  });

  it('project duplication copies designs (latest revision, no approvals)', async () => {
    const p = await newProject();
    const d = await newDesign({ name: 'Tee', template: 'knit_tshirt' }, designer, p.id);
    await change(d, 200);
    const copyRes = await designer.post(`${org()}/projects/${p.id}/duplicate`, {});
    expect(copyRes.status).toBe(201);
    const copy = await json<Project>(copyRes);
    const designs = await json<{ items: Design[] }>(
      await designer.get(`${org()}/projects/${copy.id}/designs`),
    );
    expect(designs.items).toHaveLength(1);
    expect(designs.items[0]).toMatchObject({
      name: 'Tee',
      approvedRevisionId: null,
      duplicatedFromDesignId: d.id,
    });
    expect(copy.defaultDesignId).toBe(designs.items[0]!.id);
  });

  it('editor-state opens a design in one request with capability flags (I15)', async () => {
    const d = await newDesign();
    const res = await designer.get(`${org()}/designs/${d.id}/editor-state`);
    expect(res.status).toBe(200);
    const es = await json<EditorState>(res);
    expect(es.design.id).toBe(d.id);
    expect(es.project).toMatchObject({ id: project.id, editable: true });
    expect(es.workingCopy.version).toBe(d.workingCopyVersion);
    expect(es.headRevision?.id).toBe(d.headRevisionId);
    expect(es.headRevision?.revisionNumber).toBe(1);
    expect(es.approvedRevision).toBeNull();
    expect(es.capabilities).toMatchObject({ canEdit: true, canCommit: true, canRestore: true });
    expect(es.readOnlyReason).toBeNull();
    expect(es.userId).toBe(designerUserId);
    // Viewers open the same design read-only.
    const asViewer = await json<EditorState>(
      await viewer.get(`${org()}/designs/${d.id}/editor-state`),
    );
    expect(asViewer.capabilities).toEqual({
      canEdit: false,
      canCommit: false,
      canRestore: false,
      canGenerate: false,
    });
    expect(asViewer.readOnlyReason).toBe('permission');
    // Other tenants: not found.
    expect(
      (await other.owner.client.get(`/v1/orgs/${other.orgId}/designs/${d.id}/editor-state`)).status,
    ).toBe(404);
  });

  it('designs of archived projects are read-only', async () => {
    const p = await newProject(owner);
    const d = await newDesign({}, owner, p.id);
    expect([200, 201]).toContain(
      (await owner.post(`${org()}/projects/${p.id}/archive`, {})).status,
    );
    const wc = await wcOf(d, owner);
    const res = await operate(
      d,
      wc.version,
      {
        type: 'rename_component',
        componentId: sleeve(wc.state as unknown as GarmentDesignState).componentId,
        displayName: 'x',
      },
      owner,
    );
    expect(res.status).toBe(409);
    expect((await code(res)).code).toBe('INVALID_STATE_TRANSITION');
    expect((await owner.get(`${org()}/designs/${d.id}`)).status).toBe(200);
    const es = await json<EditorState>(await owner.get(`${org()}/designs/${d.id}/editor-state`));
    expect(es.project.editable).toBe(false);
    expect(es.capabilities.canEdit).toBe(false);
    expect(es.readOnlyReason).toBe('project_status');
    expect((await owner.post(`${org()}/projects/${p.id}/designs`, { name: 'x' })).status).toBe(409);
  });

  it('designs inherit restricted project access (ADR-047)', async () => {
    const p = await newProject(owner);
    const d = await newDesign({}, owner, p.id);
    await owner.put(`${org()}/projects/${p.id}/visibility`, {
      expectedVersion: 1,
      visibility: 'restricted',
    });
    // No grant: everything is "not found".
    expect((await designer.get(`${org()}/designs/${d.id}`)).status).toBe(404);
    expect((await designer.get(`${org()}/revisions/${d.headRevisionId}`)).status).toBe(404);
    expect((await designer.get(`${org()}/projects/${p.id}/designs`)).status).toBe(404);
    // View grant: read yes, edit no.
    await owner.post(`${org()}/projects/${p.id}/grants`, {
      userId: designerUserId,
      actions: ['project.view'],
    });
    expect((await designer.get(`${org()}/designs/${d.id}`)).status).toBe(200);
    expect((await designer.get(`${org()}/revisions/${d.headRevisionId}`)).status).toBe(200);
    const wc = await wcOf(d);
    const rename = {
      type: 'rename_component',
      componentId: sleeve(wc.state as unknown as GarmentDesignState).componentId,
      displayName: 'Granted',
    };
    expect((await operate(d, wc.version, rename)).status).toBe(403);
    const readOnly = await json<EditorState>(
      await designer.get(`${org()}/designs/${d.id}/editor-state`),
    );
    expect(readOnly.capabilities.canEdit).toBe(false);
    // Edit grant: edits and commits work.
    await owner.post(`${org()}/projects/${p.id}/grants`, {
      userId: designerUserId,
      actions: ['project.view', 'project.edit'],
    });
    expect(
      (await json<EditorState>(await designer.get(`${org()}/designs/${d.id}/editor-state`)))
        .capabilities.canEdit,
    ).toBe(true);
    const saved = await operate(d, wc.version, rename);
    expect(saved.status).toBe(201);
    const { workingCopy } = await json<{ workingCopy: { version: number } }>(saved);
    expect((await commit(d, workingCopy.version)).status).toBe(201);
  });

  it('other tenants get 404 for designs and revisions', async () => {
    const d = await newDesign();
    const stranger = other.owner.client;
    expect((await stranger.get(`/v1/orgs/${other.orgId}/designs/${d.id}`)).status).toBe(404);
    expect(
      (await stranger.get(`/v1/orgs/${other.orgId}/revisions/${d.headRevisionId}`)).status,
    ).toBe(404);
    expect((await stranger.get(`/v1/orgs/${orgId}/designs/${d.id}`)).status).toBe(404);
  });
});
