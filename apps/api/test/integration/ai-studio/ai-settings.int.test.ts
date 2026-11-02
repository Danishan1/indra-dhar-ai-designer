import type { AiSettings, AiStatus, TestModelResponse } from '@ai-designer/contracts';
import { createTenant, type TenantFixture } from '@ai-designer/test-utils';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import { clearRateLimits, fixtureDeps, json } from '../../security/fixtures.js';
import { startTestApp } from '../app-factory.js';

const LISTING = {
  models: [
    {
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      supportedGenerationMethods: ['generateContent'],
    },
    {
      name: 'models/gemini-2.5-flash-image',
      displayName: 'Nano Banana',
      supportedGenerationMethods: ['generateContent'],
    },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ],
};

/**
 * AI provider keys, model discovery and per-operation preferences (ADR-057). The provider's model
 * listing is answered by a stub — no real AI call is made.
 */
describe('AI settings: keys, discovery, preferences (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let t: TenantFixture;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp());
    prisma = app.get(PrismaService);
    await clearRateLimits(app.get<Redis>(REDIS));
    t = await createTenant(fixtureDeps(baseUrl), 'AI Settings Atelier', [
      'designer',
      'credential_admin',
    ]);
  }, 120_000);

  beforeEach(async () => {
    await clearRateLimits(app.get<Redis>(REDIS));
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        const key = new Headers(init?.headers).get('x-goog-api-key');
        if (key !== 'AIza-good-key-123456')
          return new Response(
            JSON.stringify({
              error: {
                code: 400,
                message: 'API key not valid. Please pass a valid API key.',
                details: [{ reason: 'API_KEY_INVALID' }],
              },
            }),
            { status: 400 },
          );
        return new Response(JSON.stringify(LISTING));
      }
      return realFetch(input, init);
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  const org = () => `/v1/orgs/${t.orgId}`;

  it('validates a key by discovery, stores it encrypted and never returns it', async () => {
    const owner = t.members.credential_admin!.client;
    const bad = await owner.put(`${org()}/ai/providers/key`, {
      provider: 'gemini',
      apiKey: 'AIza-wrong-key-000',
    });
    expect(bad.status, await bad.clone().text()).toBe(400);
    expect(await bad.text()).toContain('rejected');

    const res = await owner.put(`${org()}/ai/providers/key`, {
      provider: 'gemini',
      apiKey: 'AIza-good-key-123456',
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('AIza-good-key-123456');
    const s = JSON.parse(body) as AiSettings;
    const gemini = s.providers.find((p) => p.provider === 'gemini')!;
    expect(gemini).toMatchObject({ source: 'organization', status: 'connected', keyHint: '…3456' });
    expect(gemini.models.find((m) => m.id === 'text-embedding-004')!.capabilities).toEqual([]);
    const recon = s.operations.find((o) => o.operation === 'garment_reconstruction')!;
    expect(recon.compatible).toEqual([{ provider: 'gemini', model: 'gemini-2.5-flash' }]);
    const images = s.operations.find((o) => o.operation === 'image_generation')!;
    expect(images.effective[0]).toEqual({ provider: 'gemini', model: 'gemini-2.5-flash-image' });

    const row = await prisma.aiProviderConnection.findFirst({ where: { organizationId: t.orgId } });
    expect(row!.encryptedKey).not.toContain('AIza');

    const status = await json<AiStatus>(await t.owner.client.get(`${org()}/ai/status`));
    expect(status.providers.find((p) => p.name === 'gemini')).toMatchObject({
      configured: true,
      models: { text: 'gemini-2.5-flash', image: 'gemini-2.5-flash-image' },
    });
  });

  it('only accepts compatible model choices; designers can read but not manage', async () => {
    const owner = t.members.credential_admin!.client;
    const wrong = await owner.put(`${org()}/ai/settings`, {
      preferences: { image_generation: { provider: 'gemini', model: 'gemini-2.5-flash' } },
      crossProviderFallback: true,
    });
    expect(wrong.status).toBe(400);
    const ok = await owner.put(`${org()}/ai/settings`, {
      preferences: {
        garment_reconstruction: { provider: 'gemini', model: 'gemini-2.5-flash' },
        image_generation: 'auto',
      },
      crossProviderFallback: false,
    });
    expect(ok.status).toBe(200);
    expect((await json<AiSettings>(ok)).crossProviderFallback).toBe(false);

    // Owners do not hold credentials by default (separation of duties) — like designers, they read.
    expect(
      (await json<AiSettings>(await t.owner.client.get(`${org()}/ai/settings`))).canManage,
    ).toBe(false);
    const designer = t.members.designer!.client;
    const read = await json<AiSettings>(await designer.get(`${org()}/ai/settings`));
    expect(read.canManage).toBe(false);
    expect(
      (
        await designer.put(`${org()}/ai/providers/key`, {
          provider: 'gemini',
          apiKey: 'AIza-good-key-123456',
        })
      ).status,
    ).toBe(403);
  });

  it('tests a model: listed, capable and a live structured answer (demo provider)', async () => {
    const r = await json<TestModelResponse>(
      await t.members.credential_admin!.client.post(`${org()}/ai/models/test`, {
        provider: 'fake',
        operation: 'garment_reconstruction',
        model: 'fake-text',
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual([
      'Listed for this key',
      'Has the required capabilities',
      'Live request',
    ]);
    const no = await json<TestModelResponse>(
      await t.members.credential_admin!.client.post(`${org()}/ai/models/test`, {
        provider: 'gemini',
        operation: 'image_generation',
        model: 'gemini-2.5-flash',
      }),
    );
    expect(no.ok).toBe(false);
    expect(no.checks[1]).toMatchObject({ ok: false });
  });
});
