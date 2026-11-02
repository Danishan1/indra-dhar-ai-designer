'use client';

import { useQuery } from '@tanstack/react-query';
import { LayersIcon, PlusIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { designsApi } from './api';
import { NewDesignDialog } from './new-design-dialog';

const when = (iso: string) => new Date(iso).toLocaleString();

const CATEGORY_LABELS: Record<string, string> = {
  woven_shirt: 'Woven shirt',
  knit_tshirt: 'Knit T-shirt',
  dress: 'Dress',
  skirt: 'Skirt',
  trousers: 'Trousers',
  jacket: 'Jacket',
  hoodie: 'Hoodie',
};

export const categoryLabel = (c: string | null) => (c && CATEGORY_LABELS[c]) || 'Not chosen yet';

/** Designs of a project (project overview tab). */
export function DesignsTab({ projectId, editable }: { projectId: string; editable: boolean }) {
  const { active, can } = useOrganization();
  const [open, setOpen] = useState(false);
  const designs = useQuery({
    queryKey: queryKeys.org(active.id).projectDesigns(projectId),
    queryFn: ({ signal }) => designsApi.list(active.id, projectId, signal),
  });
  const mayCreate = editable && can('design.create');
  const newButton = mayCreate ? (
    <div className="flex gap-2">
      {can('design.generate') ? (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/projects/${projectId}/ai/new`}>
            <SparklesIcon /> New design with AI
          </Link>
        </Button>
      ) : null}
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon /> New design
      </Button>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      {designs.isPending ? (
        <LoadingState />
      ) : designs.isError ? (
        <ErrorState error={designs.error} onRetry={() => void designs.refetch()} />
      ) : designs.data.items.length === 0 ? (
        <EmptyState
          icon={<LayersIcon />}
          title="No designs yet"
          description="Start from your sketches, photos and fabrics with AI, or from a template."
          action={newButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{newButton}</div>
          <Table aria-label="Designs">
            <TableHeader>
              <TableRow>
                <TableHead>Design</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Latest revision</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Changed</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {designs.data.items.map((d) => (
                <TableRow key={d.id} data-testid="design-row">
                  <TableCell>
                    <Link href={`/designs/${d.id}`} className="font-medium hover:underline">
                      {d.name}
                    </Link>
                    <div className="text-[11px] text-muted-foreground">{d.displayId}</div>
                  </TableCell>
                  <TableCell>{categoryLabel(d.garmentCategory)}</TableCell>
                  <TableCell>
                    R{String(d.headRevisionNumber).padStart(3, '0')}
                    {d.hasUncommittedChanges ? (
                      <span className="ml-2 text-[11px] text-status-needs-review">
                        · unsaved changes
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{d.status === 'DRAFT' ? 'Draft' : d.status}</TableCell>
                  <TableCell>{when(d.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        href={`/projects/${d.projectId}/designs/${d.id}`}
                        aria-label={`Open ${d.name} in the editor`}
                      >
                        Open editor
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <NewDesignDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
