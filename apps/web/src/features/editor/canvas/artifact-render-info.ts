'use client';

import { artifactRenderInfoResponseSchema } from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import type { RenderOptions } from '@ai-designer/garment-render';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/query/keys';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Artifact revisions a design draws with: trim/artwork relationship sources and fabric references. */
export function renderedArtifactIds(state: GarmentDesignState): string[] {
  const ids = new Set<string>();
  for (const r of state.relationships)
    if (r.source.entityType === 'artifact_revision') ids.add(r.source.entityId);
  for (const c of state.components) {
    const v = c.properties['material.fabric_ref']?.value as
      { entityType?: string; entityId?: string; revisionId?: string | null } | null | undefined;
    if (!v) continue;
    const id = v.entityType === 'artifact_revision' ? v.entityId : v.revisionId;
    if (id) ids.add(id);
  }
  return [...ids].filter((id) => UUID.test(id)).sort();
}

/** Resolvers for the renderer, backed by `GET …/artifacts/render-info` (cached per id set). */
export function useArtifactResolvers(orgId: string, state: GarmentDesignState): RenderOptions {
  const ids = renderedArtifactIds(state);
  const key = ids.join(',');
  const query = useQuery({
    queryKey: queryKeys.org(orgId).artifactRenderInfo(ids),
    queryFn: ({ signal }) =>
      apiRequest(`/v1/orgs/${encodeURIComponent(orgId)}/artifacts/render-info?ids=${key}`, {
        schema: artifactRenderInfoResponseSchema,
        signal,
      }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
  const data = query.data;
  return useMemo(() => {
    // Until loaded, draw generically (no "unknown artifact" warnings while fetching).
    if (!data) return {};
    const byId = new Map((data?.items ?? []).map((i) => [i.artifactRevisionId, i]));
    return {
      artifact: (id) => {
        const i = byId.get(id);
        return i ? { name: i.name, category: i.category, shapeParams: i.shapeParams } : null;
      },
      fabric: (ref) => {
        const i = byId.get(
          ref.entityType === 'artifact_revision' ? ref.entityId : (ref.revisionId ?? ''),
        );
        if (!i?.previewUrl) return null;
        const repeat = i.shapeParams?.params.repeatMm;
        return {
          href: i.previewUrl,
          sizeMm: typeof repeat === 'number' && repeat > 0 ? repeat : 120,
        };
      },
    } satisfies RenderOptions;
  }, [data]);
}
