import {
  commitRevisionResponseSchema,
  compareResponseSchema,
  revisionListResponseSchema,
  revisionSchema,
  workingCopySchema,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const org = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}`;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** Revision history, snapshots, comparison, commit and restore for one design (I12 APIs, I19 UI). */
export function revisionsApi(orgId: string, designId: string) {
  const design = `${org(orgId)}/designs/${encodeURIComponent(designId)}`;
  return {
    history: (cursor?: string, signal?: AbortSignal) =>
      apiRequest(
        `${design}/revisions?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        {
          schema: revisionListResponseSchema,
          ...withSignal(signal),
        },
      ),
    /** The snapshot, re-hashed by the server on every read (FR-PRJ-023). */
    revision: (revisionId: string, signal?: AbortSignal) =>
      apiRequest(`${org(orgId)}/revisions/${encodeURIComponent(revisionId)}`, {
        schema: revisionSchema,
        ...withSignal(signal),
      }),
    compare: (from: string, to: string, signal?: AbortSignal) =>
      apiRequest(
        `${design}/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { schema: compareResponseSchema, ...withSignal(signal) },
      ),
    commit: (
      body: { expectedVersion: number; summary?: string; allowNoChanges?: boolean },
      idempotencyKey: string,
    ) =>
      apiRequest(`${design}/revisions`, {
        method: 'POST',
        body,
        schema: commitRevisionResponseSchema,
        idempotencyKey,
      }),
    restore: (body: { revisionId: string; expectedVersion: number }, idempotencyKey: string) =>
      apiRequest(`${design}/restore`, {
        method: 'POST',
        body,
        schema: workingCopySchema,
        idempotencyKey,
      }),
  };
}

export const revisionLabel = (n: number) => `R${String(n).padStart(3, '0')}`;
