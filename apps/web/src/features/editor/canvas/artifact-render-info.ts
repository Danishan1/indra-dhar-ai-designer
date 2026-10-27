'use client';

import { type ArtifactRenderInfo, artifactRenderInfoResponseSchema } from '@ai-designer/contracts';
import type { GarmentDesignState } from '@ai-designer/garment-model';
import type { RenderOptions } from '@ai-designer/garment-render';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/query/keys';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Artifact revisions a design uses: bindings (I18), trim/artwork relationship sources and fabric
 * references.
 */
export function renderedArtifactIds(state: GarmentDesignState): string[] {
  const ids = new Set<string>();
  for (const r of state.relationships)
    if (r.source.entityType === 'artifact_revision') ids.add(r.source.entityId);
  for (const c of state.components) {
    for (const b of c.artifactBindings) ids.add(b.artifactRevisionId);
    const v = c.properties['material.fabric_ref']?.value as
      { entityType?: string; entityId?: string; revisionId?: string | null } | null | undefined;
    if (!v) continue;
    const id = v.entityType === 'artifact_revision' ? v.entityId : v.revisionId;
    if (id) ids.add(id);
  }
  return [...ids].filter((id) => UUID.test(id)).sort();
}

export type ArtifactInfoMap = ReadonlyMap<string, ArtifactRenderInfo>;

export interface ArtifactRenderData {
  /** Render info per artifact revision id (empty until loaded; hidden/unknown ids are absent). */
  infos: ArtifactInfoMap;
  /** True once the render info for the current id set has been answered. */
  loaded: boolean;
  resolvers: RenderOptions;
}

/** Render info + renderer resolvers, backed by `GET …/artifacts/render-info` (cached per id set). */
export function useArtifactRenderData(
  orgId: string,
  state: GarmentDesignState,
): ArtifactRenderData {
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
    const byId: Map<string, ArtifactRenderInfo> = new Map(
      (data?.items ?? []).map((i) => [i.artifactRevisionId, i]),
    );
    // Until loaded, draw generically (no "unknown artifact" warnings while fetching).
    if (!data) return { infos: byId, loaded: key === '', resolvers: {} };
    const resolvers: RenderOptions = {
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
    };
    return { infos: byId, loaded: true, resolvers };
  }, [data, key]);
}
