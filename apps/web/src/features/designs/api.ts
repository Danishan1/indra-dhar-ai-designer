import {
  commitRevisionResponseSchema,
  compareResponseSchema,
  type CreateDesignRequest,
  createDesignRequestSchema,
  designListResponseSchema,
  designSchema,
  operationListResponseSchema,
  submitOperationResponseSchema,
  revisionListResponseSchema,
  workingCopySchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const org = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}`;
const design = (orgId: string, id: string) => `${org(orgId)}/designs/${encodeURIComponent(id)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export const newIdempotencyKey = () => globalThis.crypto.randomUUID();

export const designsApi = {
  list: (orgId: string, projectId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/projects/${encodeURIComponent(projectId)}/designs?limit=100`, {
      schema: designListResponseSchema,
      ...withSignal(signal),
    }),
  create: (orgId: string, projectId: string, body: CreateDesignRequest, idempotencyKey: string) =>
    apiRequest(`${org(orgId)}/projects/${encodeURIComponent(projectId)}/designs`, {
      method: 'POST',
      body: createDesignRequestSchema.parse(body),
      schema: designSchema,
      idempotencyKey,
    }),
  get: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(design(orgId, id), { schema: designSchema, ...withSignal(signal) }),
  workingCopy: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${design(orgId, id)}/working-copy`, {
      schema: workingCopySchema,
      ...withSignal(signal),
    }),
  /** Every change to a draft is a design operation (I14). */
  operate: (
    orgId: string,
    id: string,
    body: { expectedVersion: number; operation: Record<string, unknown> },
  ) =>
    apiRequest(`${design(orgId, id)}/operations`, {
      method: 'POST',
      body,
      schema: submitOperationResponseSchema,
      idempotencyKey: newIdempotencyKey(),
    }),
  operations: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${design(orgId, id)}/operations?limit=20`, {
      schema: operationListResponseSchema,
      ...withSignal(signal),
    }),
  commit: (
    orgId: string,
    id: string,
    body: { expectedVersion: number; summary?: string; allowNoChanges?: boolean },
    idempotencyKey: string,
  ) =>
    apiRequest(`${design(orgId, id)}/revisions`, {
      method: 'POST',
      body,
      schema: commitRevisionResponseSchema,
      idempotencyKey,
    }),
  history: (orgId: string, id: string, signal?: AbortSignal) =>
    apiRequest(`${design(orgId, id)}/revisions?limit=100`, {
      schema: revisionListResponseSchema,
      ...withSignal(signal),
    }),
  compare: (orgId: string, id: string, from: string, to: string, signal?: AbortSignal) =>
    apiRequest(
      `${design(orgId, id)}/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { schema: compareResponseSchema, ...withSignal(signal) },
    ),
  restore: (orgId: string, id: string, body: { revisionId: string; expectedVersion: number }) =>
    apiRequest(`${design(orgId, id)}/restore`, {
      method: 'POST',
      body,
      schema: workingCopySchema,
      idempotencyKey: newIdempotencyKey(),
    }),
  duplicate: (orgId: string, id: string) =>
    apiRequest(`${design(orgId, id)}/duplicate`, {
      method: 'POST',
      body: {},
      schema: designSchema,
      idempotencyKey: newIdempotencyKey(),
    }),
};
