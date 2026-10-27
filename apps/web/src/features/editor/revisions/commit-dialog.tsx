'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCommitHorizontalIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
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

import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

import { shortLabel } from './history-panel';
import { useRevisionsApi } from './use-revisions';

/** Opens the commit dialog; shown in the header and the history panel. */
export function CommitButton({ size = 'sm' }: { size?: 'sm' | 'default' }) {
  const canCommit = useEditor((s) => s.meta.capabilities.canCommit);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges);
  const pending = useEditor(selectHasUnsavedWork);
  const [open, setOpen] = useState(false);
  if (!canCommit) return null;
  return (
    <>
      <Button
        size={size}
        variant={uncommitted || pending ? 'default' : 'outline'}
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        data-testid="commit-button"
      >
        <GitCommitHorizontalIcon aria-hidden /> Commit…
      </Button>
      {open ? <CommitDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * CommitRevision (FR-PRJ-021…026): saves pending changes, shows what changed since the latest
 * revision (generated from the structural diff) and the validation snapshot, then creates the next
 * immutable revision. One idempotency key per dialog, so a retried click commits once.
 */
function CommitDialog({ onClose }: { onClose: () => void }) {
  const { active } = useOrganization();
  const store = useEditorStore();
  const queryClient = useQueryClient();
  const api = useRevisionsApi();
  const designId = useEditor((s) => s.meta.design.id);
  const head = useEditor((s) => s.meta.headRevision);
  const findings = useEditor((s) => s.findings);
  const [ready, setReady] = useState(false);
  const [description, setDescription] = useState('');
  const [key] = useState(() => globalThis.crypto.randomUUID());
  const [noChanges, setNoChanges] = useState<{ metadataOnly: boolean } | null>(null);

  // Everything typed so far must be saved before we describe or commit it.
  useEffect(() => {
    void store
      .getState()
      .flush()
      .then(() => setReady(true));
  }, [store]);

  const changes = useQuery({
    queryKey: [...queryKeys.org(active.id).compare(designId, head?.id ?? '', 'working'), 'commit'],
    queryFn: ({ signal }) => api.compare(head!.id, 'working', signal),
    enabled: ready && !!head,
    staleTime: 0,
  });

  const commit = useMutation({
    mutationFn: (allowNoChanges: boolean) =>
      api.commit(
        {
          expectedVersion: store.getState().server.version,
          ...(description.trim() ? { summary: description.trim() } : {}),
          allowNoChanges,
        },
        key,
      ),
    onSuccess: async (res) => {
      toast.success(`Committed ${shortLabel(res.revision.displayId)}`, {
        description: 'The working copy now matches this revision.',
      });
      await store.getState().reloadFromServer();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).revisions(designId),
      });
      onClose();
    },
    onError: (e) => {
      const err = toApiError(e);
      if (err.code === 'NO_CHANGES')
        setNoChanges({ metadataOnly: err.details?.metadataOnly === true });
    },
  });

  const unsaved = useEditor(selectHasUnsavedWork);
  const lines = changes.data?.summary ?? [];
  const semantic = changes.data?.entries.filter((e) => e.semantic).length ?? null;
  const warnings = findings.filter((f) => f.outcome === 'warning').length;
  const review = findings.filter((f) => f.outcome === 'requires_manual_review').length;
  const error = commit.error ? toApiError(commit.error) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            commit.mutate(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Commit a new revision</DialogTitle>
            <DialogDescription>
              The working copy is saved automatically; committing records it as an immutable
              revision{head ? ` after ${shortLabel(head.displayId)}` : ''}. Earlier revisions never
              change.
            </DialogDescription>
          </DialogHeader>
          <section aria-label="Changes" className="flex flex-col gap-1 text-[13px]">
            <span className="font-medium">
              Changes{head ? ` since ${shortLabel(head.displayId)}` : ''}
            </span>
            {!ready || changes.isPending ? (
              <span className="text-muted-foreground">
                {!ready ? 'Saving your last changes…' : 'Working out what changed…'}
              </span>
            ) : changes.isError ? (
              <span className="text-muted-foreground">
                The change list is not available; you can still commit.
              </span>
            ) : lines.length ? (
              <ul
                className="max-h-40 list-disc overflow-auto pl-5 text-[12px]"
                data-testid="commit-changes"
              >
                {lines.map((l, i) => (
                  <li key={`${l}-${String(i)}`}>{l}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground" data-testid="commit-changes">
                Nothing about the garment changed
                {semantic === 0 ? ' (only editor or metadata changes)' : ''}.
              </span>
            )}
          </section>
          <FormField
            label="Description (optional)"
            hint="Shown first in the history; the change list above is added automatically."
          >
            <textarea
              value={description}
              maxLength={400}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border bg-transparent px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <p className="text-[12px] text-muted-foreground" data-testid="commit-validation">
            Validation snapshot: {warnings} warnings, {review} to review manually. Full rule checks
            arrive with the validation panel.
          </p>
          {noChanges ? (
            <div role="alert" className="rounded-md border p-2 text-[12px]">
              Nothing about the garment changed since the latest revision.
              {noChanges.metadataOnly ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-2 h-6 text-xs"
                  disabled={commit.isPending}
                  onClick={() => commit.mutate(true)}
                >
                  Commit anyway
                </Button>
              ) : null}
            </div>
          ) : error ? (
            <p role="alert" className="text-[12px] text-destructive">
              {error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || unsaved || commit.isPending}>
              {commit.isPending ? 'Committing…' : 'Commit revision'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
