'use client';

import { type ArtifactCategoryKey, ArtifactCategoryKeys } from '@ai-designer/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LibraryIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { libraryApi, type LibraryFilters } from './api';
import { ArtifactCard } from './artifact-card';
import { ArtifactDetailDrawer } from './artifact-detail-drawer';
import { ArtifactFormDialog } from './artifact-form';
import { CATEGORY_LABELS, human, TARGET_TYPES } from './labels';

const ALL = 'all';

/** Library: browse built-in, organization and private artifacts (FR-050…056). */
export function LibraryPage() {
  const { active, can } = useOrganization();
  const [category, setCategory] = useState<string>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [target, setTarget] = useState<string>(ALL);
  const [text, setText] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const q = useDeferredValue(text.trim());

  const filters: LibraryFilters = {
    ...(category !== ALL ? { category: category as ArtifactCategoryKey } : {}),
    ...(scope !== ALL ? { scope: scope as LibraryFilters['scope'] } : {}),
    ...(target !== ALL ? { compatibleWith: target } : {}),
    ...(q ? { q } : {}),
    ...(showInactive ? { includeInactive: 'true' as const } : {}),
  };
  const artifacts = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).artifacts(filters),
    queryFn: ({ pageParam, signal }) => libraryApi.list(active.id, filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = artifacts.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Library"
        description="Reusable parts, materials, trims and prints. Built-in items can be used and copied; your organization’s and your private items can be changed."
        actions={
          can('artifact.create') ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <PlusIcon /> New artifact
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <div role="tablist" aria-label="Categories" className="flex flex-wrap gap-1">
          {[ALL, ...ArtifactCategoryKeys].map((c) => (
            <Button
              key={c}
              role="tab"
              aria-selected={category === c}
              size="sm"
              variant={category === c ? 'default' : 'ghost'}
              onClick={() => setCategory(c)}
            >
              {c === ALL ? 'All' : CATEGORY_LABELS[c as ArtifactCategoryKey]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <SearchIcon
              className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="pl-8"
              placeholder="Search name, id, tag…"
              aria-label="Search library"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <SimpleSelect
            aria-label="Owner"
            className="w-44"
            value={scope}
            onValueChange={setScope}
            options={[
              { value: ALL, label: 'All owners' },
              { value: 'platform', label: 'Built-in' },
              { value: 'organization', label: 'Organization' },
              { value: 'user', label: 'Mine (private)' },
            ]}
          />
          <SimpleSelect
            aria-label="Compatible with"
            className="w-48"
            value={target}
            onValueChange={setTarget}
            options={[
              { value: ALL, label: 'Any part' },
              ...TARGET_TYPES.map((t) => ({ value: t, label: `For ${human(t)}` })),
            ]}
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show deactivated
          </label>
        </div>
        {artifacts.isPending ? (
          <LoadingState />
        ) : artifacts.isError ? (
          <ErrorState error={artifacts.error} onRetry={() => void artifacts.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<LibraryIcon />}
            title="Nothing found"
            description="Try another category or clear the filters."
          />
        ) : (
          <>
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3"
              aria-label="Artifacts"
            >
              {items.map((a) => (
                <ArtifactCard key={a.id} artifact={a} onOpen={() => setOpenId(a.id)} />
              ))}
            </div>
            {artifacts.hasNextPage ? (
              <Button
                variant="outline"
                size="sm"
                className="self-center"
                disabled={artifacts.isFetchingNextPage}
                onClick={() => void artifacts.fetchNextPage()}
              >
                Load more
              </Button>
            ) : null}
          </>
        )}
      </div>
      <ArtifactDetailDrawer artifactId={openId} onClose={() => setOpenId(null)} />
      <ArtifactFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(a) => setOpenId(a.id)}
      />
    </div>
  );
}
