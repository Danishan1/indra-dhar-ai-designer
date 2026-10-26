import { createHash } from 'node:crypto';

import { EicarTestScanner, processAsset, type ProcessingOutcome } from '@ai-designer/media';
import { type INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AssetReferenceRegistry } from '../../../src/modules/assets/reference-registry.js';
import type { AppConfig } from '../../../src/platform/config/app-config.js';
import { PrismaService } from '../../../src/platform/prisma/prisma.service.js';
import { REDIS } from '../../../src/platform/redis/redis.module.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../../../src/platform/storage/object-storage.js';
import { startTestApp } from '../app-factory.js';
import { newEmail, signedInUser } from '../helpers/accounts.js';
import type { TestClient } from '../helpers/http-client.js';

interface AssetBody {
  id: string;
  status: string;
  mediaType: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  dimensions: { width: number; height: number } | null;
  variants: string[];
  rejectionReason: string | null;
  provenance: { sourceType: string };
}
const json = async <T>(res: Response) => (await res.json()) as T;
const code = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

const png = (width = 640, height = 480) =>
  sharp({ create: { width, height, channels: 3, background: '#3366aa' } })
    .png()
    .toBuffer();

const EVIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <script>alert(1)</script>
  <rect width="10" height="10" fill="red" onclick="alert(2)"/>
  <image href="https://evil.example/x.png"/>
</svg>`;

describe('assets: upload, processing, delivery (integration)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let config: AppConfig;
  let prisma: PrismaService;
  let storage: ObjectStorage;
  let redis: Redis;
  let owner: TestClient;
  let orgId: string;
  let other: TestClient;
  let otherOrgId: string;

  const process = (assetId: string, maxPixels = 50_000_000): Promise<ProcessingOutcome> =>
    processAsset(
      {
        prisma,
        storage,
        scanner: new EicarTestScanner(),
        buckets: {
          originals: config.storage.buckets.originals,
          derived: config.storage.buckets.derived,
        },
        maxPixels,
      },
      assetId,
    );

  async function createOrg(client: TestClient, name: string): Promise<string> {
    const res = await client.post('/v1/orgs', { name });
    expect(res.status).toBe(201);
    return (await json<{ id: string }>(res)).id;
  }

  async function upload(
    bytes: Buffer,
    opts: { mediaType?: string; assetType?: string; fileName?: string; checksum?: string } = {},
  ): Promise<{ id: string; put: Response }> {
    const start = await owner.post(`/v1/orgs/${orgId}/assets/uploads`, {
      assetType: opts.assetType ?? 'source_image',
      fileName: opts.fileName ?? 'front.png',
      mediaType: opts.mediaType ?? 'image/png',
      sizeBytes: bytes.length,
      ...(opts.checksum ? { checksumSha256: opts.checksum } : {}),
    });
    expect(start.status).toBe(201);
    const body = await json<{ asset: AssetBody; uploadUrl: string; maxBytes: number }>(start);
    expect(body.asset.status).toBe('pending_upload');
    const put = await owner.putBytes(body.uploadUrl, bytes);
    return { id: body.asset.id, put };
  }

  async function asset(id: string, client = owner, org = orgId) {
    return client.get(`/v1/orgs/${org}/assets/${id}`);
  }

  beforeAll(async () => {
    let cfg: AppConfig;
    ({ app, baseUrl, config: cfg } = await startTestApp());
    config = cfg;
    prisma = app.get(PrismaService);
    storage = app.get(OBJECT_STORAGE);
    redis = app.get(REDIS);
    owner = (await signedInUser(baseUrl, newEmail('assets'), 'Ada Assets')).client;
    orgId = await createOrg(owner, 'Asset Atelier');
    other = (await signedInUser(baseUrl, newEmail('assets-b'), 'Bea Other')).client;
    otherOrgId = await createOrg(other, 'Other House');
  });

  beforeEach(async () => {
    const keys = await redis.keys('aid:rl:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    await app.close();
  });

  it('upload → quarantine → processing → ready with thumbnail and preview', async () => {
    const bytes = await png(1600, 1200);
    const sha = createHash('sha256').update(bytes).digest('hex');
    const { id, put } = await upload(bytes, { checksum: sha });
    expect(put.status).toBe(200);
    const quarantined = await json<AssetBody>(put);
    expect(quarantined).toMatchObject({ status: 'quarantined', mediaType: 'image/png' });

    // Not servable before processing.
    expect((await owner.get(`/v1/orgs/${orgId}/assets/${id}/url`)).status).toBe(409);

    const job = await prisma.job.findFirst({
      where: { kind: 'asset.process', payload: { equals: { assetId: id } } },
    });
    expect(job).toMatchObject({ status: 'queued', maxAttempts: 3 });

    const outcome = await process(id);
    expect(outcome.status).toBe('ready');
    expect(outcome.status === 'ready' && outcome.derivatives).toHaveLength(2);
    expect(await process(id)).toMatchObject({ status: 'skipped' }); // idempotent

    const ready = await json<AssetBody>(await asset(id));
    expect(ready).toMatchObject({
      status: 'ready',
      checksumSha256: sha,
      sizeBytes: bytes.length,
      dimensions: { width: 1600, height: 1200 },
      provenance: { sourceType: 'user_upload' },
    });
    expect(ready.variants.sort()).toEqual(['original', 'preview_1024', 'thumb_256']);

    const thumb = await owner.get(`/v1/orgs/${orgId}/assets/${id}/content?variant=thumb_256`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    expect(thumb.headers.get('x-content-type-options')).toBe('nosniff');
    expect(thumb.headers.get('content-security-policy')).toContain('sandbox');
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(256);

    // Listing shows originals only.
    const list = await json<{ items: AssetBody[] }>(await owner.get(`/v1/orgs/${orgId}/assets`));
    expect(list.items.map((a) => a.id)).toContain(id);
    expect(list.items.every((a) => a.variants.includes('original'))).toBe(true);

    const audit = await prisma.auditEvent.findFirst({
      where: { organizationId: orgId, eventType: 'assets.asset.uploaded', resourceId: id },
    });
    expect(audit).not.toBeNull();
  });

  it('signed URLs expire within 5 minutes and work; the bucket itself is private', async () => {
    const { id } = await upload(await png());
    await process(id);
    const res = await owner.get(`/v1/orgs/${orgId}/assets/${id}/url?variant=preview_1024`);
    expect(res.status).toBe(200);
    const { url, expiresAt } = await json<{ url: string; expiresAt: string }>(res);
    const ttl = new Date(expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300_000);
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
    const signed = await fetch(url);
    expect(signed.status).toBe(200);
    expect(signed.headers.get('content-type')).toBe('image/webp');

    const row = await prisma.asset.findUniqueOrThrow({ where: { id } });
    expect(row.storageKey.startsWith(`org/${orgId}/`)).toBe(true);
    const unsigned = await fetch(`${config.storage.endpoint}/${row.bucket}/${row.storageKey}`);
    expect(unsigned.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects disguised content at upload time', async () => {
    const { id, put } = await upload(Buffer.from('MZ\x90\x00 this is an exe pretending to be png'));
    expect(put.status).toBe(400);
    expect(await code(put)).toBe('VALIDATION_FAILED');
    expect((await json<AssetBody>(await asset(id))).status).toBe('rejected');

    // A JPEG announced as SVG for a mask (png only) is refused at create time.
    const bad = await owner.post(`/v1/orgs/${orgId}/assets/uploads`, {
      assetType: 'mask',
      fileName: 'm.svg',
      mediaType: 'image/svg+xml',
      sizeBytes: 100,
    });
    expect(bad.status).toBe(400);
  });

  it('refuses oversize files: announced and actual', async () => {
    const big = await owner.post(`/v1/orgs/${orgId}/assets/uploads`, {
      assetType: 'source_image',
      fileName: 'huge.png',
      mediaType: 'image/png',
      sizeBytes: 200 * 1024 * 1024,
    });
    expect(big.status).toBe(413);
    expect(await code(big)).toBe('PAYLOAD_TOO_LARGE');

    const bytes = await png();
    const start = await owner.post(`/v1/orgs/${orgId}/assets/uploads`, {
      assetType: 'source_image',
      fileName: 'liar.png',
      mediaType: 'image/png',
      sizeBytes: 100,
    });
    const { uploadUrl } = await json<{ uploadUrl: string }>(start);
    const put = await owner.putBytes(uploadUrl, bytes);
    expect(put.status).toBe(413);
  });

  it('processing rejects pixel bombs, checksum mismatches and infected files (bytes removed)', async () => {
    const bomb = await upload(await png(2000, 1000));
    expect(await process(bomb.id, 1_000_000)).toMatchObject({ status: 'rejected' });

    const mismatch = await upload(await png(), { checksum: 'a'.repeat(64) });
    expect(await process(mismatch.id)).toEqual({ status: 'rejected', reason: 'checksum_mismatch' });

    const infected = await upload(
      Buffer.concat([
        await png(),
        Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
      ]),
    );
    expect(await process(infected.id)).toMatchObject({ status: 'rejected' });

    for (const id of [bomb.id, mismatch.id, infected.id]) {
      const body = await json<AssetBody>(await asset(id));
      expect(body.status).toBe('rejected');
      expect(body.rejectionReason).toBeTruthy();
      const row = await prisma.asset.findUniqueOrThrow({ where: { id } });
      await expect(storage.headObject(row.bucket, row.storageKey)).resolves.toBeNull();
      expect((await owner.get(`/v1/orgs/${orgId}/assets/${id}/content`)).status).toBe(409);
    }
    const infectedRow = await prisma.asset.findUniqueOrThrow({ where: { id: infected.id } });
    expect(infectedRow.rejectionReason).toBe('malware_detected');
  });

  it('sanitizes SVG uploads before they become usable', async () => {
    const svg = Buffer.from(EVIL_SVG);
    const { id, put } = await upload(svg, {
      assetType: 'artwork',
      mediaType: 'image/svg+xml',
      fileName: 'logo.svg',
    });
    expect(put.status).toBe(200);
    expect(await process(id)).toMatchObject({ status: 'ready' });
    const res = await owner.get(`/v1/orgs/${orgId}/assets/${id}/content`);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    const text = await res.text();
    expect(text).toContain('<rect');
    expect(text).not.toMatch(/script|onclick|evil\.example/);
    const thumb = await owner.get(`/v1/orgs/${orgId}/assets/${id}/content?variant=thumb_256`);
    expect(thumb.headers.get('content-type')).toBe('image/webp');
  });

  it('another organization cannot see, download or delete the asset (404)', async () => {
    const { id } = await upload(await png());
    await process(id);
    for (const path of [
      `/v1/orgs/${otherOrgId}/assets/${id}`,
      `/v1/orgs/${otherOrgId}/assets/${id}/url`,
      `/v1/orgs/${otherOrgId}/assets/${id}/content`,
    ]) {
      expect((await other.get(path)).status).toBe(404);
    }
    expect((await other.delete(`/v1/orgs/${otherOrgId}/assets/${id}`)).status).toBe(404);
    expect((await other.get(`/v1/orgs/${orgId}/assets/${id}`)).status).toBe(404);
    const list = await json<{ items: AssetBody[] }>(
      await other.get(`/v1/orgs/${otherOrgId}/assets`),
    );
    expect(list.items.map((a) => a.id)).not.toContain(id);
  });

  it('delete is refused while referenced, then soft-deletes the asset and its variants', async () => {
    const { id } = await upload(await png());
    await process(id);
    const refs = app.get(AssetReferenceRegistry);
    refs.register('test', async (a) => (a.id === id ? 'revision DR-1 r1' : null));
    try {
      const refused = await owner.delete(`/v1/orgs/${orgId}/assets/${id}`);
      expect(refused.status).toBe(409);
      expect(await code(refused)).toBe('CONFLICT');
    } finally {
      refs.unregister('test');
    }
    expect((await owner.delete(`/v1/orgs/${orgId}/assets/${id}`)).status).toBe(204);
    expect((await asset(id)).status).toBe(404);
    const rows = await prisma.asset.findMany({ where: { OR: [{ id }, { parentAssetId: id }] } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.deletedAt).not.toBeNull();
      expect(r.retentionUntil!.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    }
  });
});
