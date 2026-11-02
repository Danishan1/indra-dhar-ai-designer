import { FakeProvider } from '@ai-designer/ai';
import type {
  AiStatus,
  Analysis,
  Design,
  Project,
  TechPack,
  TechPackSummary,
  WorkingCopy,
} from '@ai-designer/contracts';
import { analyzeDesign, fakeResponders } from '@ai-designer/design-ai';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import { EicarTestScanner, processAsset } from '@ai-designer/media';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AppConfig } from '../../../src/platform/config/app-config.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../../src/platform/storage/object-storage.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';
import type { TestClient } from '../helpers/http-client.js';

/**
 * AI studio API (ADR-056). The worker's jobs are covered by the e2e demo flow; here the analysis
 * result is produced in-process with the fake provider (exactly what the worker stores) so the API
 * side — preflight, review → design, library reuse, tech pack requests — is tested on its own.
 */
describe('AI studio: analyzer and tech packs (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let config: AppConfig;
  let prisma: PrismaService;
  let storage: ObjectStorage;
  let redis: Redis;
  let t: TenantFixture;
  let other: TenantFixture;
  let designer: TestClient;
  let viewer: TestClient;
  let orgId: string;
  let project: Project;

  const org = () => `/v1/orgs/${orgId}`;

  const png = (color: string) =>
    sharp({ create: { width: 400, height: 500, channels: 3, background: color } })
      .png()
      .toBuffer();

  async function uploadImage(fileName: string, color: string, assetType = 'source_image') {
    const bytes = await png(color);
    const start = await designer.post(`${org()}/assets/uploads`, {
      assetType,
      fileName,
      mediaType: 'image/png',
      sizeBytes: bytes.length,
    });
    expect(start.status).toBe(201);
    const body = await json<{ asset: { id: string }; uploadUrl: string }>(start);
    await designer.putBytes(body.uploadUrl, bytes);
    await processAsset(
      {
        prisma,
        storage,
        scanner: new EicarTestScanner(),
        buckets: config.storage.buckets,
        maxPixels: 50_000_000,
      },
      body.asset.id,
    );
    return body.asset.id;
  }

  /** What the worker does for `design.analysis` (minus crops), with the fake provider. */
  async function completeAnalysis(a: Analysis, hint: string) {
    const result = await analyzeDesign(
      {
        images: a.inputs.map((i, index) => ({
          index,
          role: i.role,
          fileName: i.fileName,
          image: { mediaType: 'image/png', data: new Uint8Array([1]) },
        })),
        garmentHint: hint,
      },
      { provider: new FakeProvider(fakeResponders), library: [] },
    );
    await prisma.designAnalysis.update({
      where: { id: a.id },
      data: {
        status: 'succeeded',
        stage: null,
        result: JSON.parse(JSON.stringify(result)) as object,
        completedAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    ({ app, baseUrl, config } = await startTestApp());
    prisma = app.get(PrismaService);
    storage = app.get(OBJECT_STORAGE);
    redis = app.get(REDIS);
    await clearRateLimits(redis);
    t = await createTenant(fixtureDeps(baseUrl), 'Studio Atelier', ['designer', 'viewer']);
    other = await createTenant(fixtureDeps(baseUrl), 'Other Studio', []);
    orgId = t.orgId;
    designer = t.members.designer!.client;
    viewer = t.members.viewer!.client;
    project = await json<Project>(await designer.post(`${org()}/projects`, { name: 'SS27 AI' }));
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports providers without secrets', async () => {
    const res = await designer.get(`${org()}/ai/status`);
    expect(res.status).toBe(200);
    const status = await json<AiStatus>(res);
    expect(status.providers.map((p) => p.name).sort()).toEqual(['fake', 'gemini', 'openai']);
    expect(JSON.stringify(status)).not.toMatch(/api[_-]?key/i);
  });

  it('analysis → review → design with fabrics, library entries and provisional patterns', async () => {
    const sketch = await uploadImage('shirt-sketch.png', '#ffffff', 'sketch');
    const fabric = await uploadImage('blue-oxford.png', '#3b5b8c', 'fabric_image');

    // Viewers cannot run AI.
    const denied = await viewer.post(`${org()}/projects/${project.id}/analyses`, {
      inputs: [{ assetId: sketch, role: 'sketch' }],
    });
    expect(denied.status).toBe(403);

    const res = await designer.post(`${org()}/projects/${project.id}/analyses`, {
      inputs: [
        { assetId: sketch, role: 'sketch' },
        { assetId: fabric, role: 'fabric' },
      ],
      garmentHint: 'shirt',
      provider: 'fake',
    });
    expect(res.status).toBe(201);
    const analysis = await json<Analysis>(res);
    expect(analysis).toMatchObject({ status: 'queued', provider: 'fake' });
    expect(analysis.displayId).toMatch(/^ANL-/);
    const job = await prisma.job.findFirst({
      where: { kind: 'design.analysis' },
      orderBy: { createdAt: 'desc' },
    });
    expect(job?.payload).toEqual({ analysisId: analysis.id });

    // Creating a design before it finished is refused.
    const early = await designer.post(`${org()}/analyses/${analysis.id}/design`, {
      name: 'Too early',
    });
    expect(early.status).toBe(409);

    await completeAnalysis(analysis, 'shirt');
    const done = await json<Analysis>(await designer.get(`${org()}/analyses/${analysis.id}`));
    expect(done.status).toBe('succeeded');
    expect(
      (done.result as { decomposition: { garment: { category: string } } }).decomposition.garment
        .category,
    ).toBe('woven_shirt');

    // Cross-tenant: 404.
    expect((await other.owner.client.get(`/v1/orgs/${orgId}/analyses/${analysis.id}`)).status).toBe(
      404,
    );

    const created = await designer.post(`${org()}/analyses/${analysis.id}/design`, {
      name: 'AI oxford shirt',
      decisions: { pocket: 'skip' },
      fabricAssignments: { body: 'fabric_a', collar: 'fabric_a' },
    });
    expect(created.status).toBe(201);
    const out = await json<{
      design: Design;
      libraryEntriesCreated: number;
      fabricsCreated: number;
      notes: string[];
    }>(created);
    expect(out.fabricsCreated).toBeGreaterThanOrEqual(1);
    expect(out.libraryEntriesCreated).toBeGreaterThan(3);
    const wc = await json<WorkingCopy>(
      await designer.get(`${org()}/designs/${out.design.id}/working-copy`),
    );
    const state = wc.state as unknown as GarmentDesignState;
    expect(state.garmentCategory).toBe('woven_shirt');
    expect(state.components.some((c) => c.displayName === 'Chest pocket')).toBe(false);
    expect(state.patternPieces?.length).toBeGreaterThan(5);
    expect(state.sources?.map((s) => s.role)).toEqual(['sketch', 'fabric']);
    const collar = state.components.find((c) => c.componentType === 'collar')!;
    expect(collar.properties['material.fabric_ref']?.status).toBe('confirmed');
    for (const c of state.components)
      for (const pv of Object.values(c.properties))
        if (pv.sourceType === 'ai_interpretation') expect(pv.status).not.toBe('confirmed');

    // The new library entries carry a match signature (so the next analysis can reuse them).
    const cuffs = await prisma.artifact.findMany({
      where: { organizationId: orgId, category: 'cuff', tags: { has: 'ai' } },
      include: { currentRevision: true },
    });
    expect(cuffs).toHaveLength(1);
    expect(
      (cuffs[0]!.currentRevision!.definition as { matchSignature?: unknown }).matchSignature,
    ).toMatchObject({
      componentType: 'cuff',
    });

    // Tech pack: for the committed head revision; queued for the worker.
    const tp = await designer.post(`${org()}/designs/${out.design.id}/techpacks`, {
      provider: 'fake',
    });
    expect(tp.status).toBe(201);
    const summary = await json<TechPackSummary>(tp);
    expect(summary).toMatchObject({
      status: 'queued',
      revisionLabel: 'R001',
      designId: out.design.id,
    });
    expect(summary.displayId).toMatch(/^TPK-/);
    expect(
      (
        await prisma.job.findFirst({
          where: { kind: 'techpack.generate' },
          orderBy: { createdAt: 'desc' },
        })
      )?.payload,
    ).toEqual({ techPackId: summary.id });
    const list = await json<{ items: TechPackSummary[] }>(
      await viewer.get(`${org()}/designs/${out.design.id}/techpacks`),
    );
    expect(list.items.map((i) => i.id)).toEqual([summary.id]);
    const one = await json<TechPack>(await viewer.get(`${org()}/techpacks/${summary.id}`));
    expect(one.document).toBeNull();
    expect((await viewer.post(`${org()}/designs/${out.design.id}/techpacks`, {})).status).toBe(403);
    expect((await other.owner.client.get(`/v1/orgs/${orgId}/techpacks/${summary.id}`)).status).toBe(
      404,
    );
  });

  it('rejects inputs that are not ready images and unconfigured providers', async () => {
    const bad = await designer.post(`${org()}/projects/${project.id}/analyses`, {
      inputs: [{ assetId: '00000000-0000-4000-8000-000000000000', role: 'sketch' }],
    });
    expect(bad.status).toBe(404);
    const status = await json<AiStatus>(await designer.get(`${org()}/ai/status`));
    if (!status.providers.find((p) => p.name === 'openai')?.configured) {
      const sketch = await uploadImage('s.png', '#eeeeee', 'sketch');
      const res = await designer.post(`${org()}/projects/${project.id}/analyses`, {
        inputs: [{ assetId: sketch, role: 'sketch' }],
        provider: 'openai',
      });
      expect(res.status).toBe(422);
    }
  });
});
