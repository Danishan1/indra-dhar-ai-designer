'use client';

import {
  type Asset,
  assetSchema,
  type AssetType,
  errorEnvelopeSchema,
  UPLOAD_RULES,
} from '@ai-designer/contracts';
import { useCallback, useRef, useState } from 'react';

import { ApiError, toApiError } from '@/lib/api/errors';

import { assetsApi } from './api';

export type UploadPhase = 'starting' | 'uploading' | 'processing' | 'ready' | 'rejected' | 'failed';

export interface UploadItem {
  key: string;
  fileName: string;
  size: number;
  phase: UploadPhase;
  /** 0–1 while bytes are sent. */
  progress: number;
  asset?: Asset;
  error?: string;
}

const REJECTION_TEXT: Record<string, string> = {
  content_type_mismatch: 'The file content doesn’t match its type.',
  unsupported_content: 'This file type isn’t accepted.',
  size_mismatch: 'The file changed while uploading. Try again.',
  checksum_mismatch: 'The file was damaged while uploading. Try again.',
  malware_detected: 'The file was blocked by the security scan.',
  svg_invalid: 'The SVG couldn’t be read.',
  image_invalid: 'The image is damaged or too large in pixels.',
};

export const rejectionText = (reason: string | null | undefined) =>
  (reason && REJECTION_TEXT[reason]) ?? 'The file was rejected.';

/** Browser-side type check mirroring UPLOAD_RULES (the API decides on the actual bytes). */
export function acceptFor(assetType: AssetType): string {
  return (UPLOAD_RULES[assetType] ?? []).join(',');
}

async function sha256Hex(file: File): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle || file.size > 64 * 1024 * 1024) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** PUT with progress events (fetch has none for request bodies). */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Request-Id', crypto.randomUUID());
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onerror = () =>
      reject(new ApiError('DEPENDENCY_UNAVAILABLE', 'Upload interrupted', 0, null));
    xhr.onload = () => {
      let json: unknown;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = assetSchema.safeParse(json);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError('INTERNAL_ERROR', 'Unexpected response', xhr.status, null));
        return;
      }
      const envelope = errorEnvelopeSchema.safeParse(json);
      reject(
        envelope.success
          ? new ApiError(
              envelope.data.error.code,
              envelope.data.error.message,
              xhr.status,
              envelope.data.error.requestId,
              envelope.data.error.details,
            )
          : new ApiError('INTERNAL_ERROR', `Upload failed (${xhr.status})`, xhr.status, null),
      );
    };
    xhr.send(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload flow (ADR-044): create → PUT bytes with progress → poll until the worker marks the file
 * `ready` or `rejected`. Several files can be in flight; each has its own item.
 */
export function useUpload(
  orgId: string,
  options: { assetType: AssetType; onSettled?: (asset: Asset) => void },
) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const counter = useRef(0);
  const { assetType, onSettled } = options;

  const patch = (key: string, change: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));

  const uploadOne = useCallback(
    async (file: File) => {
      const key = `u${++counter.current}`;
      setItems((list) => [
        { key, fileName: file.name, size: file.size, phase: 'starting', progress: 0 },
        ...list,
      ]);
      try {
        const checksumSha256 = await sha256Hex(file);
        const start = await assetsApi.createUpload(orgId, {
          assetType,
          fileName: file.name.slice(0, 255) || 'upload',
          mediaType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          ...(checksumSha256 ? { checksumSha256 } : {}),
        });
        patch(key, { phase: 'uploading', asset: start.asset });
        const quarantined = await putWithProgress(start.uploadUrl, file, (progress) =>
          patch(key, { progress }),
        );
        patch(key, { phase: 'processing', progress: 1, asset: quarantined });
        let asset = quarantined;
        for (let attempt = 0; attempt < 120 && asset.status === 'quarantined'; attempt++) {
          await sleep(Math.min(500 + attempt * 250, 3000));
          asset = await assetsApi.get(orgId, asset.id);
        }
        if (asset.status === 'ready') patch(key, { phase: 'ready', asset });
        else if (asset.status === 'rejected')
          patch(key, { phase: 'rejected', asset, error: rejectionText(asset.rejectionReason) });
        else patch(key, { phase: 'processing', asset });
        onSettled?.(asset);
      } catch (err) {
        const error = toApiError(err);
        patch(key, { phase: 'failed', error: error.message });
      }
    },
    [orgId, assetType, onSettled],
  );

  const upload = useCallback(
    (files: Iterable<File>) => Promise.all([...files].map((f) => uploadOne(f))),
    [uploadOne],
  );
  const clearFinished = useCallback(
    () =>
      setItems((list) =>
        list.filter(
          (i) => i.phase === 'starting' || i.phase === 'uploading' || i.phase === 'processing',
        ),
      ),
    [],
  );

  return { items, upload, clearFinished };
}
