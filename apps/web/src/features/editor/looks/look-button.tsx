'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShirtIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { studioApi } from '@/features/studio/api';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { usePatternRightTab } from '../patterns/pattern-right-panel';
import { useRevisionsApi } from '../revisions/use-revisions';
import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

const rev = (n: number | undefined) => (n ? `R${String(n).padStart(3, '0')}` : '—');

/**
 * "Preview look" (ADR-064): the garment as it would look sewn from the patterns on screen, drawn by
 * the image model from the front, back, left and right. A look always belongs to a committed
 * revision, so uncommitted pattern changes are committed first (one step) — that is what lets the
 * designer come back to the patterns of any earlier look.
 */
export function LookButton() {
  const { can } = useOrganization();
  const [open, setOpen] = useState(false);
  const patternFirst = useEditor((s) => !!s.display.patternSpec);
  if (!patternFirst || !can('design.generate')) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        data-testid="look-button"
      >
        <ShirtIcon aria-hidden /> Preview look
      </Button>
      {open ? <LookDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LookDialog({ onClose }: { onClose: () => void }) {
  const { active } = useOrganization();
  const store = useEditorStore();
  const queryClient = useQueryClient();
  const designId = useEditor((s) => s.meta.design.id);
  const head = useEditor((s) => s.meta.headRevision);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges || selectHasUnsavedWork(s));
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const revisions = useRevisionsApi();
  const setTab = usePatternRightTab((s) => s.setTab);
  const [style, setStyle] = useState<'sketch' | 'realistic'>('sketch');
  const [note, setNote] = useState('');
  const [provider, setProvider] = useState('');
  const [commitKey] = useState(() => globalThis.crypto.randomUUID());
  const key = useRef(newIdempotencyKey());
  const willCommit = uncommitted && canEdit;

  const status = useQuery({
    queryKey: queryKeys.org(active.id).aiStatus(),
    queryFn: ({ signal }) => studioApi.aiStatus(active.id, signal),
  });
  const chosen = provider || status.data?.defaultProvider || '';
  const configured = (status.data?.providers ?? []).filter((p) => p.configured);
  const noRevision = !head && !willCommit;

  const generate = useMutation({
    mutationFn: async () => {
      await store.getState().flush();
      // Commit whenever there was unsaved or uncommitted work (NO_CHANGES is fine).
      if (willCommit) {
        try {
          await revisions.commit(
            {
              expectedVersion: store.getState().server.version,
              summary: note.trim() ? `Look preview: ${note.trim()}` : 'Patterns for a look preview',
              allowNoChanges: false,
            },
            commitKey,
          );
        } catch (e) {
          if (toApiError(e).code !== 'NO_CHANGES') throw e;
        }
        await store.getState().reloadFromServer();
        await queryClient.invalidateQueries({
          queryKey: queryKeys.org(active.id).revisions(designId),
        });
      }
      return studioApi.createLook(
        active.id,
        designId,
        {
          style,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(chosen ? { provider: chosen as 'gemini' | 'openai' | 'fake' } : {}),
        },
        key.current,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).looks(designId) });
      setTab('looks');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preview the look</DialogTitle>
          <DialogDescription>
            The AI draws the garment sewn from the patterns of revision{' '}
            {rev(willCommit ? (head?.revisionNumber ?? 0) + 1 : head?.revisionNumber)} — front,
            back, left and right (4 AI images). The look is kept with those patterns, so you can
            come back to them later.
          </DialogDescription>
        </DialogHeader>
        {uncommitted ? (
          <p
            className="rounded-md border border-status-needs-review/50 p-2 text-[13px]"
            data-testid="look-uncommitted"
          >
            {canEdit
              ? `Your latest pattern changes will be saved as revision ${rev((head?.revisionNumber ?? 0) + 1)} first.`
              : `Your latest changes are not committed; the look shows ${rev(head?.revisionNumber)}.`}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="look-style">Style</Label>
            <SimpleSelect
              id="look-style"
              value={style}
              onValueChange={(v) => setStyle(v as 'sketch' | 'realistic')}
              options={[
                { value: 'sketch', label: 'Fashion sketch (line drawing)' },
                { value: 'realistic', label: 'Realistic (on a dress form)' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="look-note">Note (optional)</Label>
            <Input
              id="look-note"
              value={note}
              maxLength={200}
              placeholder="e.g. longer sleeves, wider leg"
              onChange={(e) => setNote(e.target.value)}
              data-testid="look-note"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="look-provider">AI provider</Label>
            <SimpleSelect
              id="look-provider"
              value={chosen}
              onValueChange={setProvider}
              options={configured.map((p) => ({
                value: p.name,
                label:
                  p.name === 'fake'
                    ? 'Demo (offline, no real AI)'
                    : `${p.name} · ${p.models.image}`,
              }))}
            />
          </div>
        </div>
        {noRevision ? (
          <p className="text-[13px] text-muted-foreground">
            Commit the patterns first — a look always shows committed patterns.
          </p>
        ) : null}
        {generate.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {generate.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending || noRevision || !chosen}
            data-testid="look-generate"
          >
            {generate.isPending ? 'Starting…' : 'Draw the look'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
