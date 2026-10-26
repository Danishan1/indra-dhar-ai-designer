'use client';

import type { Design, RevisionSummary, WorkingCopy } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { CompareView } from './compare-view';

const when = (iso: string) => new Date(iso).toLocaleString();

/** Revision history with compare and restore (temporary until the editor panels in I19). */
export function DesignHistory({
  design,
  workingCopy,
  readOnly,
}: {
  design: Design;
  workingCopy: WorkingCopy;
  readOnly: boolean;
}) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const keys = queryKeys.org(active.id);
  const [comparing, setComparing] = useState<{ from: string; to: string } | null>(null);
  const [restoring, setRestoring] = useState<RevisionSummary | null>(null);
  const history = useQuery({
    queryKey: keys.revisions(design.id),
    queryFn: ({ signal }) => designsApi.history(active.id, design.id, signal),
  });
  const restore = useMutation({
    mutationFn: (r: RevisionSummary) =>
      designsApi.restore(active.id, design.id, {
        revisionId: r.id,
        expectedVersion: workingCopy.version,
      }),
    onSuccess: async (wc, r) => {
      setRestoring(null);
      queryClient.setQueryData(keys.workingCopy(design.id), wc);
      toast.success(`${r.displayId} is now the draft — save it as a revision to keep it`);
      await queryClient.invalidateQueries({ queryKey: keys.design(design.id) });
    },
  });

  if (history.isPending) return <LoadingState />;
  if (history.isError)
    return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  const items = history.data.items;

  return (
    <section aria-label="History" className="flex flex-col gap-3">
      {comparing ? (
        <CompareView designId={design.id} {...comparing} onClose={() => setComparing(null)} />
      ) : null}
      <Table aria-label="Revisions">
        <TableHeader>
          <TableRow>
            <TableHead>Revision</TableHead>
            <TableHead>What changed</TableHead>
            <TableHead>By</TableHead>
            <TableHead>Checks</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r, i) => {
            const previous = items[i + 1];
            const restoredFrom = items.find((x) => x.id === r.restoredFromRevisionId);
            return (
              <TableRow key={r.id} data-testid="revision-row">
                <TableCell className="align-top">
                  <div className="font-medium">{r.displayId}</div>
                  <div className="text-[11px] text-muted-foreground">{when(r.createdAt)}</div>
                  {r.id === design.headRevisionId ? (
                    <div className="text-[11px] text-primary">Latest</div>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-pre-wrap align-top text-[12px]">
                  {r.changeSummary}
                  {restoredFrom ? (
                    <div className="text-muted-foreground">
                      Restored from {restoredFrom.displayId}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">{r.createdByName ?? '—'}</TableCell>
                <TableCell className="align-top text-[12px]">
                  {r.validationSummary.errors +
                    r.validationSummary.warnings +
                    r.validationSummary.manualReview ===
                  0
                    ? 'No findings'
                    : `${r.validationSummary.warnings} warnings · ${r.validationSummary.manualReview} to review`}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-wrap justify-end gap-1">
                    {previous ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setComparing({ from: previous.id, to: r.id })}
                      >
                        Compare with previous
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setComparing({ from: r.id, to: 'working' })}
                    >
                      Compare with draft
                    </Button>
                    {!readOnly && can('design.restore') && r.id !== workingCopy.baseRevisionId ? (
                      <Button size="sm" variant="outline" onClick={() => setRestoring(r)}>
                        Restore
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Dialog open={restoring !== null} onOpenChange={(open) => !open && setRestoring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore {restoring?.displayId}?</DialogTitle>
            <DialogDescription>
              The draft is replaced by this revision. History is kept: no revision is changed or
              deleted, and saving afterwards creates a new revision that records the restore.
              {workingCopy.hasUncommittedChanges
                ? ' Changes in the current draft that were not saved as a revision will be lost.'
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRestoring(null)}>
              Cancel
            </Button>
            <Button
              disabled={restore.isPending}
              onClick={() => restoring && restore.mutate(restoring)}
            >
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
