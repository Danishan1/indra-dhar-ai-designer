'use client';

import {
  type Artifact,
  type ArtifactCategoryKey,
  ArtifactCategoryKeys,
  type ArtifactScope,
} from '@ai-designer/contracts';
import type { DesignComponent } from '@ai-designer/garment-model';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CheckIcon,
  GripVerticalIcon,
  InfoIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { libraryApi, type LibraryFilters } from '@/features/library/api';
import { ArtifactPreview } from '@/features/library/artifact-card';
import { ArtifactDetailDrawer } from '@/features/library/artifact-detail-drawer';
import { CATEGORY_LABELS, SCOPE_LABELS } from '@/features/library/labels';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import {
  ARTIFACT_DRAG_TYPE,
  artifactFit,
  type ArtifactSummary,
  encodeDrag,
  exclusiveCategory,
  type Fit,
  setActiveDrag,
} from '../artifacts/attach';
import { useAttachArtifact } from '../artifacts/use-attach';
import { useArtifactInfos } from '../canvas/scene-context';
import { useEditor } from '../store-context';

function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export const summaryOf = (a: Artifact): ArtifactSummary => ({
  id: a.id,
  name: a.name,
  displayId: a.displayId,
  category: a.category,
  currentRevisionId: a.currentRevisionId,
  compatibleTargetTypes: a.compatibleTargetTypes,
  geometryCapability: a.geometryCapability,
  lifecycleStatus: a.lifecycleStatus,
});

const FIT_LABEL: Record<Fit['status'], string> = {
  compatible: 'Fits',
  review: 'Needs review',
  incompatible: 'Doesn’t fit',
};

/**
 * Library browser inside the editor (FR-EDT-050…055): search and filter the artifacts the person
 * may use, see whether each fits the selected component, attach / replace with one click or by
 * dragging a card onto the drawing. Attaching always pins the current revision (ART-004).
 */
export function LibraryPanel() {
  const { active } = useOrganization();
  const canUse = useEditor((s) => s.meta.capabilities.canUseArtifacts);
  const components = useEditor((s) => s.display.components);
  const selectedIds = useEditor((s) => s.selection.ids);
  const target: DesignComponent | null =
    selectedIds.length === 1
      ? (components.find((c) => c.componentId === selectedIds[0]) ?? null)
      : null;
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'all' | ArtifactScope>('all');
  const [category, setCategory] = useState<'all' | ArtifactCategoryKey>('all');
  const [fitsOnly, setFitsOnly] = useState(true);
  const [details, setDetails] = useState<string | null>(null);
  const q = useDebounced(text.trim());

  const filters: LibraryFilters = useMemo(
    () => ({
      ...(q ? { q } : {}),
      ...(scope !== 'all' ? { scope } : {}),
      ...(category !== 'all' ? { category } : {}),
      ...(fitsOnly && target ? { compatibleWith: target.componentType } : {}),
    }),
    [q, scope, category, fitsOnly, target],
  );
  const query = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).artifacts({ ...filters, view: 'editor' }),
    queryFn: ({ pageParam, signal }) => libraryApi.list(active.id, filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="editor-library">
      <div className="flex flex-col gap-1.5 border-b p-2">
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search the library"
            placeholder="Search artifacts"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-7 pl-7 text-[13px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <SimpleSelect
            aria-label="Category"
            value={category}
            className="h-7 text-[12px]"
            onValueChange={(v) => setCategory(v as typeof category)}
            options={[
              { value: 'all', label: 'All categories' },
              ...ArtifactCategoryKeys.map((k) => ({ value: k, label: CATEGORY_LABELS[k] })),
            ]}
          />
          <SimpleSelect
            aria-label="Owner"
            value={scope}
            className="h-7 text-[12px]"
            onValueChange={(v) => setScope(v as typeof scope)}
            options={[
              { value: 'all', label: 'All owners' },
              { value: 'platform', label: SCOPE_LABELS.platform },
              { value: 'organization', label: SCOPE_LABELS.organization },
              { value: 'user', label: SCOPE_LABELS.user },
            ]}
          />
        </div>
        {target ? (
          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={fitsOnly}
              onChange={(e) => setFitsOnly(e.target.checked)}
            />
            Only what fits {target.displayName}
          </label>
        ) : (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <InfoIcon className="size-3" aria-hidden />
            Select one component to see what fits it, or drag a card onto the drawing.
          </p>
        )}
        {!canUse ? (
          <p className="text-[11px] text-muted-foreground" data-testid="library-read-only">
            You can browse the library but not add artifacts to this design.
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {query.isPending ? (
          <p className="text-[12px] text-muted-foreground">Loading the library…</p>
        ) : query.isError ? (
          <div className="flex flex-col items-start gap-1 text-[12px]">
            <span>We couldn’t load the library.</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nothing matches. {fitsOnly && target ? 'Turn off “Only what fits” to see more.' : ''}
          </p>
        ) : (
          <ul aria-label="Library artifacts" className="flex flex-col gap-1.5">
            {items.map((a) => (
              <li key={a.id}>
                <LibraryCard
                  artifact={a}
                  target={target}
                  canUse={canUse}
                  onDetails={() => setDetails(a.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {query.hasNextPage ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 w-full text-xs"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </div>
      {details ? (
        <ArtifactDetailDrawer artifactId={details} onClose={() => setDetails(null)} />
      ) : null}
    </div>
  );
}

function FitBadge({ fit }: { fit: Fit }) {
  const Icon =
    fit.status === 'compatible' ? CheckIcon : fit.status === 'review' ? TriangleAlertIcon : XIcon;
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1',
        fit.status === 'incompatible' && 'text-muted-foreground',
        fit.status === 'review' && 'border-status-needs-review/60',
      )}
      title={fit.reason ?? undefined}
      data-fit={fit.status}
    >
      <Icon aria-hidden /> {FIT_LABEL[fit.status]}
    </Badge>
  );
}

function LibraryCard({
  artifact,
  target,
  canUse,
  onDetails,
}: {
  artifact: Artifact;
  target: DesignComponent | null;
  canUse: boolean;
  onDetails: () => void;
}) {
  const attach = useAttachArtifact();
  const { infos } = useArtifactInfos();
  const summary = summaryOf(artifact);
  const fit = target ? artifactFit(summary, target) : null;
  const replaces =
    target && exclusiveCategory(artifact.category)
      ? target.artifactBindings.some(
          (b) => (infos.get(b.artifactRevisionId)?.category ?? b.role) === artifact.category,
        )
      : false;
  const draggable = canUse && artifact.lifecycleStatus === 'active' && !!artifact.currentRevisionId;
  return (
    <div
      className="flex gap-2 rounded-md border p-1.5 text-[12px]"
      data-testid="library-card"
      data-artifact-id={artifact.id}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(ARTIFACT_DRAG_TYPE, encodeDrag(summary));
        e.dataTransfer.setData('text/plain', artifact.name);
        e.dataTransfer.effectAllowed = 'copy';
        setActiveDrag(summary);
      }}
      onDragEnd={() => setActiveDrag(null)}
    >
      {draggable ? (
        <GripVerticalIcon
          className="size-3.5 shrink-0 self-center text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <ArtifactPreview
        url={artifact.previewUrl}
        label={artifact.name}
        className="size-14 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium" title={artifact.name}>
          {artifact.name}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {CATEGORY_LABELS[artifact.category]} · {SCOPE_LABELS[artifact.ownerScope]} ·{' '}
          {artifact.displayId}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {fit ? <FitBadge fit={fit} /> : null}
          {artifact.geometryCapability && artifact.geometryCapability !== 'G2' ? (
            <Badge variant="outline">Image only</Badge>
          ) : null}
        </div>
        {fit?.reason ? (
          <span className="text-[11px] text-muted-foreground">{fit.reason}</span>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {canUse && target ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={fit?.status === 'incompatible'}
              onClick={() => attach(summary, target.componentId)}
            >
              {replaces ? 'Replace' : 'Attach'}
              <span className="sr-only">
                {' '}
                {artifact.name} to {target.displayName}
              </span>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onDetails}>
            Details<span className="sr-only"> of {artifact.name}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
