import {
  type Asset,
  assetListResponseSchema,
  assetSchema,
  assetUrlResponseSchema,
  type AssetVariant,
  type CreateUploadRequest,
  createUploadResponseSchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const base = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}/assets`;

export interface AssetListFilters {
  type?: string;
  status?: string;
}

export const assetsApi = {
  list: (orgId: string, filters: AssetListFilters, cursor?: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ limit: '48' });
    if (filters.type) qs.set('type', filters.type);
    if (filters.status) qs.set('status', filters.status);
    if (cursor) qs.set('cursor', cursor);
    return apiRequest(`${base(orgId)}?${qs.toString()}`, {
      schema: assetListResponseSchema,
      ...withSignal(signal),
    });
  },
  get: (orgId: string, assetId: string, signal?: AbortSignal) =>
    apiRequest(`${base(orgId)}/${encodeURIComponent(assetId)}`, {
      schema: assetSchema,
      ...withSignal(signal),
    }),
  createUpload: (orgId: string, body: CreateUploadRequest) =>
    apiRequest(`${base(orgId)}/uploads`, {
      method: 'POST',
      body,
      schema: createUploadResponseSchema,
    }),
  signedUrl: (orgId: string, assetId: string, variant: AssetVariant = 'original') =>
    apiRequest(`${base(orgId)}/${encodeURIComponent(assetId)}/url?variant=${variant}`, {
      schema: assetUrlResponseSchema,
    }),
  remove: (orgId: string, assetId: string) =>
    apiRequest(`${base(orgId)}/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
};

/**
 * Same-origin URL that streams a ready variant through the API (authorized on every request,
 * private cache for 5 minutes). Used for thumbnails in `<img>`; downloads use signed URLs.
 */
export function assetContentUrl(orgId: string, assetId: string, variant: AssetVariant): string {
  return `${base(orgId)}/${encodeURIComponent(assetId)}/content?variant=${variant}`;
}

export type { Asset };
