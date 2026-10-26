'use client';

import type { Project } from '@ai-designer/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FolderKanbanIcon, LayoutGridIcon, ListIcon, PlusIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/features/organizations/organization-provider';
import { PreferenceKeys, readPreference, writePreference } from '@/lib/local-preferences';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { type ProjectFilters, projectsApi } from './api';
import { CreateProjectDialog } from './create-dialog';
import { ProjectStatusBadge } from './status-badge';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active work' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
];
const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'created_desc', label: 'Newest' },
  { value: 'name_asc', label: 'Name (A–Z)' },
];

const when = (iso: string) => new Date(iso).toLocaleDateString();
const facts = (p: Project) =>
  [p.productCategory, p.season, p.brand].filter(Boolean).join(' · ') || 'No details yet';

function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Projects dashboard: grid/list, search, filters, status (archived hidden by default). */
export function ProjectsDashboard() {
  const { active, can } = useOrganization();
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('updated_desc');
  const [category, setCategory] = useState('');
  const [season, setSeason] = useState('');
  const [brand, setBrand] = useState('');

  useEffect(() => {
    if (readPreference(PreferenceKeys.projectsView) === 'list') setView('list');
  }, []);
  const chooseView = (next: 'grid' | 'list') => {
    setView(next);
    writePreference(PreferenceKeys.projectsView, next);
  };

  const q = useDebounced(text.trim());
  const dCategory = useDebounced(category.trim());
  const dSeason = useDebounced(season.trim());
  const dBrand = useDebounced(brand.trim());
  const filters: ProjectFilters = {
    sort: sort as ProjectFilters['sort'],
    ...(status !== 'active' ? { status: status as ProjectFilters['status'] } : {}),
    ...(q ? { q } : {}),
    ...(dCategory ? { category: dCategory } : {}),
    ...(dSeason ? { season: dSeason } : {}),
    ...(dBrand ? { brand: dBrand } : {}),
  };
  const filtered = Boolean(q || dCategory || dSeason || dBrand || status !== 'active');

  const projects = useInfiniteQuery({
    queryKey: queryKeys.org(active.id).projects(filters as Record<string, unknown>),
    queryFn: ({ pageParam, signal }) =>
      projectsApi.list(active.id, filters, pageParam ?? undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = projects.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Projects"
        description={`Design projects in ${active.name}.`}
        actions={
          can('project.create') ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PlusIcon /> New project
            </Button>
          ) : null
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end gap-2" role="search">
          <div className="relative min-w-56 flex-1">
            <SearchIcon
              className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="pl-8"
              placeholder="Search name, style number, brand…"
              aria-label="Search projects"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <SimpleSelect
            aria-label="Status"
            className="w-40"
            value={status}
            onValueChange={setStatus}
            options={STATUS_OPTIONS}
          />
          <Input
            className="w-32"
            placeholder="Category"
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <Input
            className="w-28"
            placeholder="Season"
            aria-label="Filter by season"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          />
          <Input
            className="w-32"
            placeholder="Brand"
            aria-label="Filter by brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
          <SimpleSelect
            aria-label="Sort by"
            className="w-44"
            value={sort}
            onValueChange={setSort}
            options={SORT_OPTIONS}
          />
          <div className="flex rounded-md border" role="group" aria-label="Layout">
            <Button
              size="icon"
              variant={view === 'grid' ? 'secondary' : 'ghost'}
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => chooseView('grid')}
            >
              <LayoutGridIcon />
            </Button>
            <Button
              size="icon"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => chooseView('list')}
            >
              <ListIcon />
            </Button>
          </div>
        </div>

        {projects.isPending ? (
          <LoadingState />
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={<SearchIcon />}
              title="No projects match"
              description="Try a different search or clear the filters."
            />
          ) : (
            <EmptyState
              icon={<FolderKanbanIcon />}
              title="No projects yet"
              description="Create a project for each style you design and develop."
              action={
                can('project.create') ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <PlusIcon /> New project
                  </Button>
                ) : undefined
              }
            />
          )
        ) : view === 'grid' ? (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3"
            aria-label="Projects"
          >
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className={cn(
                    'flex h-full flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  )}
                  data-testid="project-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium" title={p.name}>
                      {p.name}
                    </span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <span className="text-xs text-muted-foreground">{p.displayId}</span>
                  <span className="text-[13px] text-muted-foreground">{facts(p)}</span>
                  <span className="mt-auto text-xs text-muted-foreground">
                    Updated {when(p.updatedAt)}
                    {p.visibility === 'restricted' ? ' · Restricted' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Table aria-label="Projects">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id} data-testid="project-row">
                  <TableCell className="font-medium">
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.displayId}</TableCell>
                  <TableCell>
                    <ProjectStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{facts(p)}</TableCell>
                  <TableCell className="text-muted-foreground">{when(p.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {projects.hasNextPage ? (
          <Button
            variant="outline"
            size="sm"
            className="self-center"
            disabled={projects.isFetchingNextPage}
            onClick={() => void projects.fetchNextPage()}
          >
            Load more
          </Button>
        ) : null}
      </div>
      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
