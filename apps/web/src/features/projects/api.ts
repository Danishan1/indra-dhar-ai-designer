import {
  type CreateProjectRequest,
  createProjectRequestSchema,
  dependentsResponseSchema,
  type LifecycleAction,
  projectGrantListResponseSchema,
  projectGrantSchema,
  type ProjectListQuery,
  projectListResponseSchema,
  projectSchema,
  type ProjectVisibility,
  type UpdateProjectRequest,
} from '@ai-designer/contracts';
import type { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

const base = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}/projects`;
const one = (orgId: string, id: string) => `${base(orgId)}/${encodeURIComponent(id)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export type ProjectFilters = Omit<ProjectListQuery, 'cursor' | 'limit'>;

/** Retry-safe creation: one key per dialog submit attempt (API-004). */
export const newIdempotencyKey = () => globalThis.crypto.randomUUID();

export const projectsApi = {
  list: (orgId: string, filters: ProjectFilters, cursor?: string, signal?: AbortSignal) => {
    const qs = new URLSearchParams({ limit: '24' });
    for (const [key, value] of Object.entries(filters))
      if (typeof value === 'string' && value !== '') qs.set(key, value);
    if (cursor) qs.set('cursor', cursor);
    return apiRequest(`${base(orgId)}?${qs.toString()}`, {
      schema: projectListResponseSchema,
      ...withSignal(signal),
    });
  },
  get: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(one(orgId, id), { schema: projectSchema, ...withSignal(signal) }),
  create: (orgId: string, body: CreateProjectRequest, idempotencyKey: string) =>
    apiRequest(base(orgId), {
      method: 'POST',
      body: createProjectRequestSchema.parse(body),
      schema: projectSchema,
      idempotencyKey,
    }),
  update: (orgId: string, id: string, body: UpdateProjectRequest) =>
    apiRequest(one(orgId, id), { method: 'PATCH', body, schema: projectSchema }),
  transition: (
    orgId: string,
    id: string,
    action: Exclude<LifecycleAction, 'delete'>,
    reason?: string,
  ) =>
    apiRequest(`${one(orgId, id)}/${action}`, {
      method: 'POST',
      body: reason ? { reason } : {},
      schema: projectSchema,
      idempotencyKey: newIdempotencyKey(),
    }),
  dependents: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${one(orgId, id)}/dependents`, {
      schema: dependentsResponseSchema,
      ...withSignal(signal),
    }),
  remove: (orgId: string, id: string, acknowledgeDependents: boolean) =>
    apiRequest(`${one(orgId, id)}?acknowledgeDependents=${acknowledgeDependents}`, {
      method: 'DELETE',
    }),
  duplicate: (orgId: string, id: string) =>
    apiRequest(`${one(orgId, id)}/duplicate`, {
      method: 'POST',
      body: {},
      schema: projectSchema,
      idempotencyKey: newIdempotencyKey(),
    }),
  setVisibility: (
    orgId: string,
    id: string,
    body: { expectedVersion: number; visibility: ProjectVisibility },
  ) => apiRequest(`${one(orgId, id)}/visibility`, { method: 'PUT', body, schema: projectSchema }),
  grants: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${one(orgId, id)}/grants`, {
      schema: projectGrantListResponseSchema,
      ...withSignal(signal),
    }),
  grant: (
    orgId: string,
    id: string,
    body: { userId: string; actions: ('project.view' | 'project.edit')[] },
  ) => apiRequest(`${one(orgId, id)}/grants`, { method: 'POST', body, schema: projectGrantSchema }),
  revokeGrant: (orgId: string, id: string, userId: string) =>
    apiRequest(`${one(orgId, id)}/grants?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
};

export type CreateProjectBody = z.input<typeof createProjectRequestSchema>;
