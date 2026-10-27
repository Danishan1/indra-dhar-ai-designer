'use client';

import type { RevisionSummary } from '@ai-designer/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOrganization } from '@/features/organizations/organization-provider';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { useEditor, useEditorStore } from '../store-context';

import { shortLabel } from './history-panel';
import { useRevisionsApi } from './use-revisions';

/**
 * RestoreRevisionToWorkingCopy (FR-PRJ-033/034): the revision's content becomes the working copy;
 * no revision is changed or removed. Committing afterwards creates a new revision after the latest
 * one that records where it was restored from.
 */
export function RestoreDialog({
  revision,
  onClose,
}: {
  revision: RevisionSummary | null;
  onClose: () => void;
}) {
  const { active } = useOrganization();
  const store = useEditorStore();
  const queryClient = useQueryClient();
  const api = useRevisionsApi();
  const head = useEditor((s) => s.meta.headRevision);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges);
  const [key, setKey] = useState(() => globalThis.crypto.randomUUID());
  const restore = useMutation({
    mutationFn: async (r: RevisionSummary) => {
      await store.getState().flush();
      return api.restore(
        { revisionId: r.id, expectedVersion: store.getState().server.version },
        key,
      );
    },
    onSuccess: async (_wc, r) => {
      await store.getState().reloadFromServer();
      store.getState().closeInspect();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).revisions(store.getState().meta.design.id),
      });
      toast.success(`${shortLabel(r.displayId)} restored into the working copy`, {
        description: 'Commit to record it as a new revision.',
      });
      setKey(globalThis.crypto.randomUUID());
      onClose();
    },
  });
  const label = revision ? shortLabel(revision.displayId) : '';
  return (
    <Dialog open={!!revision} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore {label} to the working copy?</DialogTitle>
          <DialogDescription>
            The working copy will contain {label} exactly as it was committed. History stays as it
            is — no revision is changed or deleted. Commit afterwards to record it as a new revision
            {head ? ` after ${shortLabel(head.displayId)}` : ''}.
          </DialogDescription>
        </DialogHeader>
        {uncommitted ? (
          <p
            role="alert"
            className="rounded-md border p-2 text-[12px]"
            data-testid="restore-warning"
          >
            The working copy has changes that are not committed. They will be replaced — commit them
            first if you want to keep them.
          </p>
        ) : null}
        {restore.error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {toApiError(restore.error).message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={restore.isPending || !revision}
            onClick={() => revision && restore.mutate(revision)}
          >
            {restore.isPending ? 'Restoring…' : `Restore ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
