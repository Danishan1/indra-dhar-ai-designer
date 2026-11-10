import type { SizeChart } from '@ai-designer/contracts';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';

/** Organization size charts (ADR-067): CRUD, validation, permissions and tenant isolation. */
describe('size charts (integration)', () => {
  let app: INestApplication;
  let t: TenantFixture;
  let other: TenantFixture;

  beforeAll(async () => {
    let baseUrl: string;
    ({ app, baseUrl } = await startTestApp());
    await clearRateLimits(app.get<Redis>(REDIS));
    t = await createTenant(fixtureDeps(baseUrl), 'Size Studio', ['designer', 'viewer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Sizes', []);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('designers manage charts, everyone in the organization uses them', async () => {
    const base = `/v1/orgs/${t.orgId}/size-charts`;
    const designer = t.members.designer!.client;
    const viewer = t.members.viewer!.client;
    const chart = {
      name: 'Brand boys',
      audience: 'boys',
      sizes: [
        { label: 'S', body: { height: 1160, bust: 610 } },
        { label: 'M', body: { height: 1280, bust: 660 } },
      ],
    };
    const created = await designer.post(base, chart);
    expect(created.status, await created.clone().text()).toBe(201);
    const c = await json<SizeChart>(created);
    expect(c).toMatchObject({ name: 'Brand boys', audience: 'boys' });
    expect(c.sizes.map((s) => s.label)).toEqual(['S', 'M']);

    // Validation: duplicate name, duplicate labels, unknown measurement.
    expect((await designer.post(base, chart)).status).toBe(409);
    expect(
      (
        await designer.post(base, {
          ...chart,
          name: 'Dupes',
          sizes: [
            { label: 'S', body: {} },
            { label: 'S', body: {} },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await designer.post(base, {
          ...chart,
          name: 'Odd',
          sizes: [{ label: 'S', body: { elbow_swing: 100 } }],
        })
      ).status,
    ).toBe(400);

    // Everyone can list and read; only curators change.
    const list = await json<{ items: SizeChart[] }>(await viewer.get(base));
    expect(list.items.map((x) => x.id)).toEqual([c.id]);
    expect((await viewer.get(`${base}/${c.id}`)).status).toBe(200);
    expect((await viewer.post(base, { ...chart, name: 'Nope' })).status).toBe(403);
    expect((await viewer.put(`${base}/${c.id}`, chart)).status).toBe(403);

    const updated = await designer.put(`${base}/${c.id}`, {
      ...chart,
      sizes: [...chart.sizes, { label: 'L', body: { height: 1400, bust: 700 } }],
    });
    expect(updated.status, await updated.clone().text()).toBe(200);
    expect((await json<SizeChart>(updated)).sizes).toHaveLength(3);

    // Other tenants never see it.
    expect((await other.owner.client.get(`${base}/${c.id}`)).status).toBe(404);
    expect(
      (await other.owner.client.get(`/v1/orgs/${other.orgId}/size-charts/${c.id}`)).status,
    ).toBe(404);

    expect((await viewer.delete(`${base}/${c.id}`)).status).toBe(403);
    expect((await designer.delete(`${base}/${c.id}`)).status).toBe(204);
    expect((await designer.get(`${base}/${c.id}`)).status).toBe(404);
  });
});
