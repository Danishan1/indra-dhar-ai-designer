import { type Project } from '@ai-designer/contracts';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ProjectLifecycleRegistry } from '../../../src/modules/projects/dependents-registry.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

describe('projects: lifecycle, access and listing (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let redis: Redis;
  let t: TenantFixture;
  let owner: TestClient;
  let designer: TestClient;
  let lead: TestClient;
  let viewer: TestClient;
  let orgId: string;
  let designerUserId: string;
  let ownerUserId: string;

  const base = () => `/v1/orgs/${orgId}/projects`;
  const make = async (client: TestClient, body: Record<string, unknown> = {}) => {
    const res = await client.post(base(), { name: `Project ${Math.random()}`, ...body });
    expect(res.status).toBe(201);
    return json<Project>(res);
  };
  const act = (client: TestClient, id: string, action: string, reason?: string) =>
    client.post(`${base()}/${id}/${action}`, reason ? { reason } : {});

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Project Atelier', [
      'designer',
      'design_lead',
      'viewer',
    ]);
    orgId = t.orgId;
    owner = t.owner.client;
    designer = t.members.designer!.client;
    lead = t.members.design_lead!.client;
    viewer = t.members.viewer!.client;
    ownerUserId = (await json<{ id: string }>(await owner.get('/v1/me'))).id;
    designerUserId = (await json<{ id: string }>(await designer.get('/v1/me'))).id;
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an ACTIVE project with a stable display id and an attributable creator (AC1)', async () => {
    const p = await make(designer, {
      name: '  Spring Shirt ',
      productCategory: 'Shirts',
      tags: ['denim', 'denim'],
    });
    expect(p).toMatchObject({
      name: 'Spring Shirt',
      status: 'ACTIVE',
      visibility: 'organization',
      version: 1,
      createdBy: designerUserId,
      tags: ['denim'],
      defaultDesignId: null,
    });
    expect(p.displayId).toMatch(/^PRJ-\d{6}$/);
    const again = await json<Project>(await viewer.get(`${base()}/${p.id}`));
    expect(again.id).toBe(p.id);
    // Viewers can read but not create or edit.
    expect((await viewer.post(base(), { name: 'x' })).status).toBe(403);
    expect(
      (await viewer.patch(`${base()}/${p.id}`, { expectedVersion: 1, name: 'y' })).status,
    ).toBe(403);
    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId: orgId, eventType: 'projects.project_created', resourceId: p.id },
    });
    expect(audit?.actorId).toBe(designerUserId);
  });

  it('retrying with the same Idempotency-Key creates one project', async () => {
    const key = `it-${Math.random()}`;
    const name = `Idem ${key}`;
    const first = await designer.post(base(), { name }, { 'Idempotency-Key': key });
    const second = await designer.post(base(), { name }, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await json<Project>(first)).id).toBe((await json<Project>(second)).id);
    const list = await json<{ items: Project[] }>(await owner.get(`${base()}?q=${key}`));
    expect(list.items).toHaveLength(1);
  });

  it('metadata updates need the current version; stale versions get 409 (AC1, API-003)', async () => {
    const p = await make(designer, { name: 'Versioned' });
    const ok = await designer.patch(`${base()}/${p.id}`, {
      expectedVersion: 1,
      season: 'SS27',
      brand: 'Nord',
    });
    expect(ok.status).toBe(200);
    expect(await json<Project>(ok)).toMatchObject({ version: 2, season: 'SS27', brand: 'Nord' });

    const stale = await designer.patch(`${base()}/${p.id}`, { expectedVersion: 1, season: 'AW27' });
    expect(stale.status).toBe(409);
    expect(await code(stale)).toBe('CONCURRENT_MODIFICATION');

    // No-op edits do not bump the version.
    const noop = await json<Project>(
      await designer.patch(`${base()}/${p.id}`, { expectedVersion: 2, season: 'SS27' }),
    );
    expect(noop.version).toBe(2);

    // Clearing a value with an empty string; history in the audit trail (FR-PRJ-009).
    const cleared = await json<Project>(
      await designer.patch(`${base()}/${p.id}`, { expectedVersion: 2, brand: '' }),
    );
    expect(cleared).toMatchObject({ brand: null, version: 3 });
    const events = await prisma.auditEvent.findMany({
      where: { resourceId: p.id, eventType: 'projects.project_metadata_updated' },
    });
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events[0]?.metadata)).toContain('SS27');
  });

  it('follows the lifecycle table and audits every transition (AC2, AC5)', async () => {
    const p = await make(designer, { name: 'Lifecycle' });

    // Invalid: resume an ACTIVE project, restore a non-archived one, reopen a non-completed one.
    for (const [client, action] of [
      [designer, 'resume'],
      [lead, 'restore'],
      [lead, 'reopen'],
    ] as const) {
      const res = await act(client, p.id, action, 'because');
      expect(res.status, action).toBe(409);
      expect(await code(res)).toBe('INVALID_STATE_TRANSITION');
    }

    expect(
      await json<Project>(await act(designer, p.id, 'hold', 'waiting for fabric')),
    ).toMatchObject({
      status: 'ON_HOLD',
      statusReason: 'waiting for fabric',
    });
    // Metadata is editable on hold; resume clears the reason.
    expect(
      (await designer.patch(`${base()}/${p.id}`, { expectedVersion: 2, season: 'AW27' })).status,
    ).toBe(200);
    expect(await json<Project>(await act(designer, p.id, 'resume'))).toMatchObject({
      status: 'ACTIVE',
      statusReason: null,
    });

    const done = await json<Project>(await act(designer, p.id, 'complete'));
    expect(done.status).toBe('COMPLETED');
    expect(done.completedAt).not.toBeNull();
    // Completed projects are read-only until reopened.
    const edit = await designer.patch(`${base()}/${p.id}`, {
      expectedVersion: done.version,
      name: 'Nope',
    });
    expect(edit.status).toBe(409);

    // Reopen: needs project.archive (designers do not have it) and a reason.
    expect((await act(designer, p.id, 'reopen', 'oops')).status).toBe(403);
    const noReason = await act(lead, p.id, 'reopen');
    expect(noReason.status).toBe(400);
    const reopened = await json<Project>(
      await act(lead, p.id, 'reopen', 'Customer changed the colourway'),
    );
    expect(reopened).toMatchObject({
      status: 'ACTIVE',
      completedAt: null,
      statusReason: 'Customer changed the colourway',
    });

    const audit = await prisma.auditEvent.findMany({
      where: { resourceId: p.id, eventType: { startsWith: 'projects.project_' } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit.map((a) => a.eventType)).toEqual([
      'projects.project_created',
      'projects.project_placed_on_hold',
      'projects.project_metadata_updated',
      'projects.project_resumed',
      'projects.project_completed',
      'projects.project_reopened',
    ]);
    expect(audit.every((a) => a.actorId !== null)).toBe(true);
    const events = await prisma.outboxEvent.count({
      where: {
        type: { startsWith: 'projects.project_' },
        payload: { path: ['projectId'], equals: p.id },
      },
    });
    expect(events).toBe(6);
  });

  it('archived projects stay readable, leave active work, can be found and restored (AC3)', async () => {
    const p = await make(designer, { name: 'To archive' });
    expect((await act(designer, p.id, 'archive')).status).toBe(403);
    const archived = await json<Project>(await act(lead, p.id, 'archive', 'Season over'));
    expect(archived).toMatchObject({ status: 'ARCHIVED', statusReason: 'Season over' });
    expect(archived.archivedAt).not.toBeNull();

    // Retrievable by authorized users; hidden from the default list; found by status.
    expect((await viewer.get(`${base()}/${p.id}`)).status).toBe(200);
    const active = await json<{ items: Project[] }>(await viewer.get(`${base()}?limit=100`));
    expect(active.items.map((i) => i.id)).not.toContain(p.id);
    const onlyArchived = await json<{ items: Project[] }>(
      await viewer.get(`${base()}?status=ARCHIVED&limit=100`),
    );
    expect(onlyArchived.items.map((i) => i.id)).toContain(p.id);
    expect(
      (await designer.patch(`${base()}/${p.id}`, { expectedVersion: archived.version, name: 'x' }))
        .status,
    ).toBe(409);

    expect(await json<Project>(await act(lead, p.id, 'restore'))).toMatchObject({
      status: 'ACTIVE',
      archivedAt: null,
    });
  });

  it('completion can be blocked by registered checks (hook for I28)', async () => {
    const p = await make(designer, { name: 'Blocked' });
    const registry = app.get(ProjectLifecycleRegistry);
    registry.registerCompletionCheck('test', async (x) =>
      x.id === p.id ? 'A review is still open' : null,
    );
    try {
      const res = await act(designer, p.id, 'complete');
      expect(res.status).toBe(422);
      const body = (await res.json()) as {
        error: { code: string; details: { blockers: string[] } };
      };
      expect(body.error.code).toBe('VALIDATION_BLOCKED');
      expect(body.error.details.blockers).toEqual(['A review is still open']);
    } finally {
      registry.unregisterCompletionCheck('test');
    }
    expect((await act(designer, p.id, 'complete')).status).toBe(200);
  });

  it('deletes logically after the dependency warning (AC3)', async () => {
    const p = await make(designer, { name: 'Doomed' });
    expect((await designer.delete(`${base()}/${p.id}`)).status).toBe(403);

    const registry = app.get(ProjectLifecycleRegistry);
    registry.registerDependents('design', {
      label: 'Designs',
      count: async (x) => (x.id === p.id ? 3 : 0),
    });
    try {
      const warn = await json<{ items: { label: string; count: number }[]; total: number }>(
        await owner.get(`${base()}/${p.id}/dependents`),
      );
      expect(warn).toEqual({ items: [{ type: 'design', label: 'Designs', count: 3 }], total: 3 });
      const refused = await owner.delete(`${base()}/${p.id}`);
      expect(refused.status).toBe(409);
      expect(await code(refused)).toBe('CONFLICT');
      expect((await owner.get(`${base()}/${p.id}`)).status).toBe(200);
      expect((await owner.delete(`${base()}/${p.id}?acknowledgeDependents=true`)).status).toBe(204);
    } finally {
      registry.unregisterDependents('design');
    }

    expect((await owner.get(`${base()}/${p.id}`)).status).toBe(404);
    const all = await json<{ items: Project[] }>(await owner.get(`${base()}?limit=100`));
    expect(all.items.map((i) => i.id)).not.toContain(p.id);
    // The row and its history are kept (logical deletion).
    const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ status: 'DELETED' });
    expect(row.deletedAt).not.toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: { resourceId: p.id, eventType: 'projects.project_deleted' },
    });
    expect(audit?.actorId).toBe(ownerUserId);
  });

  it('restricted projects are invisible without a grant and follow their grants (AC6)', async () => {
    const p = await make(owner, { name: 'Secret collection' });
    // Only people who manage access can restrict.
    expect((await designer.post(base(), { name: 'x', visibility: 'restricted' })).status).toBe(403);
    const restricted = await json<Project>(
      await owner.put(`${base()}/${p.id}/visibility`, {
        expectedVersion: p.version,
        visibility: 'restricted',
      }),
    );
    expect(restricted.visibility).toBe('restricted');

    // Not found for members without a grant — on every route and in the list.
    for (const client of [designer, lead, viewer]) {
      expect((await client.get(`${base()}/${p.id}`)).status).toBe(404);
      expect(
        (await client.patch(`${base()}/${p.id}`, { expectedVersion: 2, name: 'z' })).status,
      ).toBe(404);
      const list = await json<{ items: Project[] }>(await client.get(`${base()}?limit=100`));
      expect(list.items.map((i) => i.id)).not.toContain(p.id);
    }
    const ownerList = await json<{ items: Project[] }>(await owner.get(`${base()}?limit=100`));
    expect(ownerList.items.map((i) => i.id)).toContain(p.id);

    // Grants: only for active members; managing them needs project.manage_access.
    expect(
      (
        await designer.post(`${base()}/${p.id}/grants`, {
          userId: designerUserId,
          actions: ['project.view'],
        })
      ).status,
    ).toBe(404);
    const stranger = await owner.post(`${base()}/${p.id}/grants`, {
      userId: '0197b0a0-0000-7000-8000-000000000000',
      actions: ['project.view'],
    });
    expect(stranger.status).toBe(400);

    const granted = await owner.post(`${base()}/${p.id}/grants`, {
      userId: designerUserId,
      actions: ['project.view'],
    });
    expect(granted.status).toBe(201);
    expect(await json<{ userId: string; displayName: string }>(granted)).toMatchObject({
      userId: designerUserId,
      displayName: expect.stringContaining('designer'),
    });

    // View-only grant: can read and is listed, cannot edit (403, not 404).
    expect((await designer.get(`${base()}/${p.id}`)).status).toBe(200);
    const listed = await json<{ items: Project[] }>(await designer.get(`${base()}?limit=100`));
    expect(listed.items.map((i) => i.id)).toContain(p.id);
    expect(
      (await designer.patch(`${base()}/${p.id}`, { expectedVersion: 2, name: 'z' })).status,
    ).toBe(403);

    // Upgrading replaces the earlier grant.
    await owner.post(`${base()}/${p.id}/grants`, {
      userId: designerUserId,
      actions: ['project.view', 'project.edit'],
    });
    const grants = await json<{ items: { actions: string[] }[] }>(
      await owner.get(`${base()}/${p.id}/grants`),
    );
    expect(grants.items).toHaveLength(1);
    expect(
      (await designer.patch(`${base()}/${p.id}`, { expectedVersion: 2, name: 'Renamed' })).status,
    ).toBe(200);

    // Revoked: gone again, immediately.
    expect((await owner.delete(`${base()}/${p.id}/grants?userId=${designerUserId}`)).status).toBe(
      204,
    );
    expect((await designer.get(`${base()}/${p.id}`)).status).toBe(404);
    expect((await owner.delete(`${base()}/${p.id}/grants?userId=${designerUserId}`)).status).toBe(
      404,
    );

    // Back to organization visibility.
    const current = await json<Project>(await owner.get(`${base()}/${p.id}`));
    await owner.put(`${base()}/${p.id}/visibility`, {
      expectedVersion: current.version,
      visibility: 'organization',
    });
    expect((await viewer.get(`${base()}/${p.id}`)).status).toBe(200);
  });

  it('filters, searches, sorts and paginates (AC4)', async () => {
    const tag = `Zq${Math.random().toString(36).slice(2, 8)}`;
    const make5 = [
      {
        name: `${tag} Alpha`,
        productCategory: 'Shirts',
        season: 'SS27',
        brand: 'Nord',
        styleNumber: 'ST-100',
      },
      {
        name: `${tag} Bravo`,
        productCategory: 'Shirts',
        season: 'AW27',
        brand: 'Nord',
        styleNumber: 'ST-200',
      },
      { name: `${tag} Charlie`, productCategory: 'Trousers', season: 'SS27', brand: 'Sud' },
      { name: `${tag} Delta`, productCategory: 'Trousers', season: 'AW27', brand: 'Sud' },
      { name: `${tag} Echo`, productCategory: 'Coats', season: 'AW27', brand: 'Nord' },
    ];
    for (const body of make5) await make(designer, body);
    const hold = (await json<{ items: Project[] }>(await owner.get(`${base()}?q=${tag}%20Delta`)))
      .items[0]!;
    await act(designer, hold.id, 'hold');

    const names = async (qs: string) =>
      (
        await json<{ items: Project[] }>(await owner.get(`${base()}?q=${tag}&limit=100&${qs}`))
      ).items.map((i) => i.name.replace(`${tag} `, ''));
    expect((await names('sort=name_asc')).sort()).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
      'Echo',
    ]);
    expect(await names('sort=name_asc&category=shirts')).toEqual(['Alpha', 'Bravo']);
    expect(await names('season=SS27&sort=name_asc')).toEqual(['Alpha', 'Charlie']);
    expect(await names('brand=Sud&sort=name_asc')).toEqual(['Charlie', 'Delta']);
    expect(await names('status=ON_HOLD')).toEqual(['Delta']);
    const byStyle = await json<{ items: Project[] }>(await owner.get(`${base()}?q=ST-200`));
    expect(byStyle.items.map((i) => i.styleNumber)).toEqual(['ST-200']);

    for (const sort of ['updated_desc', 'created_desc', 'name_asc']) {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const res: { items: Project[]; nextCursor: string | null } = await json(
          await owner.get(
            `${base()}?q=${tag}&limit=2&sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          ),
        );
        seen.push(...res.items.map((i) => i.id));
        cursor = res.nextCursor;
        if (!cursor) break;
      }
      expect(seen, sort).toHaveLength(5);
      expect(new Set(seen).size, sort).toBe(5);
    }
  });

  it('duplicates metadata only: new id, copy marker, no style number, never copied approvals (FR-PRJ-007)', async () => {
    const p = await make(designer, {
      name: 'Original',
      productCategory: 'Shirts',
      styleNumber: 'ST-1',
      tags: ['a'],
    });
    await act(designer, p.id, 'complete');
    const copy = await designer.post(`${base()}/${p.id}/duplicate`, {});
    expect(copy.status).toBe(201);
    const c = await json<Project>(copy);
    expect(c).toMatchObject({
      name: 'Copy of Original',
      status: 'ACTIVE',
      productCategory: 'Shirts',
      styleNumber: null,
      tags: ['a'],
      duplicatedFromId: p.id,
      version: 1,
    });
    expect(c.id).not.toBe(p.id);
    expect(c.displayId).not.toBe(p.displayId);
    expect((await json<Project>(await designer.get(`${base()}/${p.id}`))).status).toBe('COMPLETED');
  });
});
