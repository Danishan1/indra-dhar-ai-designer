'use client';

import { useQuery } from '@tanstack/react-query';
import { LayersIcon, PlusIcon } from 'lucide-react';
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

export const categoryLabel = (c: string | null) =>
  c === 'woven_shirt' ? 'Woven shirt' : c === 'knit_tshirt' ? 'Knit T-shirt' : 'Not chosen yet';

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
    <Button size="sm" onClick={() => setOpen(true)}>
      <PlusIcon /> New design
    </Button>
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
          description="Start from a woven shirt or knit T-shirt template, or a blank design."
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
