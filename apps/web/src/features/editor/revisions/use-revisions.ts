'use client';

import type { RevisionSummary } from '@ai-designer/contracts';
import { readAnyVersion, type GarmentDesignState } from '@ai-designer/garment-model';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { useEditor } from '../store-context';

import { revisionsApi } from './api';

export function useRevisionsApi() {
  const { active } = useOrganization();
  const designId = useEditor((s) => s.meta.design.id);
  return useMemo(() => revisionsApi(active.id, designId), [active.id, designId]);
}

/** Revision history, newest first, 20 per page (FR-PRJ-028). */
export function useRevisionHistory() {
  const { active } = useOrganization();
  const designId = useEditor((s) => s.meta.design.id);
  const api = useRevisionsApi();
  const query = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).revisions(designId),
    queryFn: ({ pageParam, signal }) => api.history(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items: RevisionSummary[] = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  return { ...query, items };
}

/**
 * A revision's snapshot (hash-verified by the server on every read, FR-PRJ-023), upgraded to the
 * current schema for display. Revisions never change, so it is cached for good.
 */
export function useRevisionSnapshot(revisionId: string | null) {
  const { active } = useOrganization();
  const api = useRevisionsApi();
  const query = useQuery({
    queryKey: queryKeys.org(active.id).revision(revisionId ?? ''),
    queryFn: ({ signal }) => api.revision(revisionId!, signal),
    enabled: !!revisionId && revisionId !== 'working',
    staleTime: Infinity,
  });
  const state = useMemo<GarmentDesignState | null>(() => {
    if (!query.data) return null;
    try {
      return readAnyVersion(query.data.snapshot).state;
    } catch {
      return null;
    }
  }, [query.data]);
  return { ...query, state };
}
