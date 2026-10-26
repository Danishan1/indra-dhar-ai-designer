import {
  type AcceptedMediaType,
  AssetDerivativeCreatedEvent,
  AssetReadyEvent,
  AssetRejectedEvent,
  AssetUploadedEvent,
  DisplayIdPrefixes,
  MediaTypes,
  type Provenance,
} from '@ai-designer/contracts';
import {
  appendOutboxEvent,
  newId,
  nextDisplayId,
  type PrismaClient,
  SYSTEM_ACTOR,
  type WriteMeta,
} from '@ai-designer/db';

import { sha256Hex } from './checksum.js';
import { ImageRejectedError, inspectImage, makeDerivatives } from './images.js';
import { assetObjectKey } from './keys.js';
import type { Scanner } from './scanner.js';
import { sniffMediaType } from './sniff.js';
import type { ObjectStorage } from './storage.js';
import { sanitizeSvg } from './svg-sanitize.js';

export interface AssetProcessingDeps {
  prisma: PrismaClient;
  storage: ObjectStorage;
  scanner: Scanner;
  buckets: { originals: string; derived: string };
  maxPixels: number;
}

export type ProcessingOutcome =
  | { status: 'ready'; derivatives: string[] }
  | { status: 'rejected'; reason: string }
  | { status: 'skipped'; reason: string };

const meta = (organizationId: string, extra: Partial<WriteMeta> = {}): WriteMeta => ({
  actor: SYSTEM_ACTOR,
  organizationId,
  requestId: null,
  correlationId: null,
  ...extra,
});

/**
 * Processes a quarantined upload (worker job `asset.process`, I09): verifies content type, size and
 * checksum, scans (ADR-029), sanitizes SVG, checks pixel limits, writes WebP derivatives and marks
 * the asset `ready` — or `rejected` (bytes deleted). Idempotent: anything not `quarantined` is
 * skipped; derivative keys are deterministic, so a retry overwrites rather than duplicates.
 * Expensive work happens here, never in an API request (TECH §3.9).
 */
export async function processAsset(
  deps: AssetProcessingDeps,
  assetId: string,
): Promise<ProcessingOutcome> {
  const asset = await deps.prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return { status: 'skipped', reason: 'not_found' };
  if (asset.status !== 'quarantined' || asset.deletedAt)
    return { status: 'skipped', reason: `status_${asset.status}` };

  const reject = async (reason: string, detail?: Record<string, unknown>) => {
    await deps.prisma.$transaction(async (tx) => {
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status: 'rejected',
          rejectionReason: reason,
          metadata: { ...(asset.metadata as object), rejection: { reason, ...detail } },
        },
      });
      await appendOutboxEvent(
        tx,
        AssetRejectedEvent,
        { organizationId: asset.organizationId, assetId: asset.id, reason },
        meta(asset.organizationId),
      );
    });
    // Rejected bytes are not kept (possible malware / bomb); the row stays for the record.
    await deps.storage.deleteObject(asset.bucket, asset.storageKey).catch(() => undefined);
    return { status: 'rejected' as const, reason };
  };

  let bytes = await deps.storage.getObject(asset.bucket, asset.storageKey);
  const sniffed = sniffMediaType(bytes);
  if (!sniffed || sniffed !== asset.mediaType) return reject('content_type_mismatch');
  if (asset.declaredSize !== null && BigInt(bytes.length) !== asset.declaredSize)
    return reject('size_mismatch', { declared: Number(asset.declaredSize), actual: bytes.length });
  const uploadedChecksum = sha256Hex(bytes);
  if (asset.declaredChecksum && asset.declaredChecksum !== uploadedChecksum)
    return reject('checksum_mismatch');

  const scan = await deps.scanner.scan(bytes);
  if (scan.verdict === 'infected')
    return reject('malware_detected', { engine: scan.engine, signature: scan.signature });
  if (scan.verdict === 'error') throw new Error(`scanner error (${scan.engine})`); // retry

  const extra: Record<string, unknown> = { scan: { engine: scan.engine, verdict: scan.verdict } };
  if (sniffed === MediaTypes.svg) {
    let sanitized;
    try {
      sanitized = sanitizeSvg(bytes.toString('utf8'));
    } catch {
      return reject('svg_invalid');
    }
    extra['svgSanitized'] = { removed: sanitized.removed, uploadedSha256: uploadedChecksum };
    if (sanitized.removed > 0) {
      bytes = Buffer.from(sanitized.svg, 'utf8');
      // Only the sanitized document is ever stored and served (FR-RV-035).
      await deps.storage.putObject({
        bucket: asset.bucket,
        key: asset.storageKey,
        body: bytes,
        contentType: sniffed,
      });
    }
  }

  let dimensions: { width: number; height: number } | null = null;
  let derivatives: Awaited<ReturnType<typeof makeDerivatives>> = [];
  if (sniffed !== MediaTypes.pdf) {
    try {
      const info = await inspectImage(bytes, deps.maxPixels);
      dimensions = { width: info.width, height: info.height };
      extra['image'] = {
        format: info.format,
        colorSpace: info.colorSpace,
        hasAlpha: info.hasAlpha,
      };
      derivatives = await makeDerivatives(bytes, sniffed, deps.maxPixels);
    } catch (err) {
      if (err instanceof ImageRejectedError)
        return reject('image_invalid', { message: err.message });
      throw err;
    }
  }

  // Bytes first (deterministic keys), then all rows + events in one transaction.
  const stored: (Awaited<ReturnType<typeof makeDerivatives>>[number] & {
    key: string;
    checksum: string;
  })[] = [];
  for (const d of derivatives) {
    const key = assetObjectKey(asset.organizationId, asset.id, d.variant, asset.createdAt);
    await deps.storage.putObject({
      bucket: deps.buckets.derived,
      key,
      body: d.buffer,
      contentType: d.mediaType,
      checksumSha256: sha256Hex(d.buffer),
    });
    stored.push({ ...d, key, checksum: sha256Hex(d.buffer) });
  }
  const derivedIds: string[] = [];
  await deps.prisma.$transaction(async (tx) => {
    const now = new Date();
    for (const d of stored) {
      const id = newId();
      derivedIds.push(id);
      await tx.asset.create({
        data: {
          id,
          organizationId: asset.organizationId,
          displayId: await nextDisplayId(tx, asset.organizationId, DisplayIdPrefixes.asset),
          assetType: asset.assetType,
          status: 'ready',
          bucket: deps.buckets.derived,
          storageKey: d.key,
          mediaType: d.mediaType,
          sizeBytes: BigInt(d.buffer.length),
          checksumSha256: d.checksum,
          dimensions: { width: d.width, height: d.height },
          provenance: { sourceType: 'derived', sourceEntityId: asset.id } satisfies Provenance,
          isDerived: true,
          parentAssetId: asset.id,
          variant: d.variant,
          classification: asset.classification,
          projectId: asset.projectId,
          readyAt: now,
        },
      });
      await appendOutboxEvent(
        tx,
        AssetDerivativeCreatedEvent,
        {
          organizationId: asset.organizationId,
          assetId: asset.id,
          derivedAssetId: id,
          variant: d.variant,
        },
        meta(asset.organizationId),
      );
    }
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: 'ready',
        readyAt: now,
        sizeBytes: BigInt(bytes.length),
        checksumSha256: sha256Hex(bytes),
        ...(dimensions ? { dimensions } : {}),
        metadata: { ...(asset.metadata as object), ...extra } as object,
      },
    });
    await appendOutboxEvent(
      tx,
      AssetReadyEvent,
      { organizationId: asset.organizationId, assetId: asset.id },
      meta(asset.organizationId),
    );
  });
  return { status: 'ready', derivatives: derivedIds };
}

/**
 * Stores bytes produced by the platform (AI outputs, renders, exports — I22+) as a quarantined
 * asset with provenance; process it with `processAsset` (or the `asset.process` job) like an upload.
 */
export async function storeGeneratedAsset(
  deps: Pick<AssetProcessingDeps, 'prisma' | 'storage' | 'buckets'>,
  input: {
    organizationId: string;
    assetType: string;
    buffer: Buffer;
    provenance: Provenance;
    projectId?: string | null;
    fileName?: string | null;
    createdBy?: string | null;
  },
): Promise<{ assetId: string; mediaType: AcceptedMediaType }> {
  const mediaType = sniffMediaType(input.buffer);
  if (!mediaType) throw new Error('generated content has an unsupported type');
  const id = newId();
  const createdAt = new Date();
  const key = assetObjectKey(input.organizationId, id, 'original', createdAt);
  await deps.storage.putObject({
    bucket: deps.buckets.originals,
    key,
    body: input.buffer,
    contentType: mediaType,
  });
  await deps.prisma.$transaction(async (tx) => {
    await tx.asset.create({
      data: {
        id,
        organizationId: input.organizationId,
        displayId: await nextDisplayId(tx, input.organizationId, DisplayIdPrefixes.asset),
        assetType: input.assetType,
        status: 'quarantined',
        bucket: deps.buckets.originals,
        storageKey: key,
        mediaType,
        declaredSize: BigInt(input.buffer.length),
        declaredChecksum: sha256Hex(input.buffer),
        provenance: input.provenance,
        fileName: input.fileName ?? null,
        projectId: input.projectId ?? null,
        createdBy: input.createdBy ?? null,
        createdAt,
      },
    });
    await appendOutboxEvent(
      tx,
      AssetUploadedEvent,
      { organizationId: input.organizationId, assetId: id },
      meta(input.organizationId),
    );
  });
  return { assetId: id, mediaType };
}
