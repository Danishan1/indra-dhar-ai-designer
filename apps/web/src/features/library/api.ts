import {
  artifactDetailSchema,
  type ArtifactListQuery,
  artifactListResponseSchema,
  compatibilityCheckResponseSchema,
  type CreateArtifactRequest,
  type CreateArtifactRevisionRequest,
  whereUsedResponseSchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const base = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}/artifacts`;
const one = (orgId: string, id: string) => `${base(orgId)}/${encodeURIComponent(id)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});
const key = () => globalThis.crypto.randomUUID();

export type LibraryFilters = Omit<ArtifactListQuery, 'cursor' | 'limit'>;

export const libraryApi = {
  list: (orgId: string, filters: LibraryFilters, cursor?: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ limit: '48' });
    for (const [k, v] of Object.entries(filters))
      if (v !== undefined && v !== '') qs.set(k, String(v));
    if (cursor) qs.set('cursor', cursor);
    return apiRequest(`${base(orgId)}?${qs.toString()}`, {
      schema: artifactListResponseSchema,
      ...withSignal(signal),
    });
  },
  get: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(one(orgId, id), { schema: artifactDetailSchema, ...withSignal(signal) }),
  create: (orgId: string, body: CreateArtifactRequest, idempotencyKey: string) =>
    apiRequest(base(orgId), { method: 'POST', body, schema: artifactDetailSchema, idempotencyKey }),
  revise: (orgId: string, id: string, body: CreateArtifactRevisionRequest) =>
    apiRequest(`${one(orgId, id)}/revisions`, {
      method: 'POST',
      body,
      schema: artifactDetailSchema,
      idempotencyKey: key(),
    }),
  setActive: (orgId: string, id: string, active: boolean) =>
    apiRequest(`${one(orgId, id)}/${active ? 'reactivate' : 'deactivate'}`, {
      method: 'POST',
      body: {},
      schema: artifactDetailSchema,
    }),
  publish: (orgId: string, id: string) =>
    apiRequest(`${one(orgId, id)}/publish`, {
      method: 'POST',
      body: {},
      schema: artifactDetailSchema,
    }),
  duplicate: (orgId: string, id: string, scope: 'user' | 'organization') =>
    apiRequest(`${one(orgId, id)}/duplicate`, {
      method: 'POST',
      body: { scope },
      schema: artifactDetailSchema,
      idempotencyKey: key(),
    }),
  remove: (orgId: string, id: string) => apiRequest(one(orgId, id), { method: 'DELETE' }),
  whereUsed: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${one(orgId, id)}/where-used`, {
      schema: whereUsedResponseSchema,
      ...withSignal(signal),
    }),
  compatibility: (
    orgId: string,
    body: { artifactRevisionId: string; componentType: string; region?: string },
  ) =>
    apiRequest(`${base(orgId)}/compatibility-check`, {
      method: 'POST',
      body,
      schema: compatibilityCheckResponseSchema,
    }),
};

export const newIdempotencyKey = key;
