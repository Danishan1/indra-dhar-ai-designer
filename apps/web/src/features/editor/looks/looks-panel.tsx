'use client';

import type { Look, LookView } from '@ai-designer/contracts';
import { useQuery } from '@tanstack/react-query';
import { GitCompareIcon, Loader2Icon, Undo2Icon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { assetContentUrl } from '@/features/assets/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { studioApi } from '@/features/studio/api';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { RestoreDialog } from '../revisions/restore-dialog';
import { selectHasUnsavedWork } from '../store';
import { useEditor } from '../store-context';

const VIEW_LABEL: Record<LookView, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Looks tab of the pattern editor (ADR-064): every look preview of the design, newest first, each
 * with the revision whose patterns it shows. "Use these patterns" restores that revision into the
 * working copy (nothing is lost — commit afterwards to record it).
 */
export function LooksPanel() {
  const { active } = useOrganization();
  const designId = useEditor((s) => s.meta.design.id);
  const canRestore = useEditor((s) => s.meta.capabilities.canRestore);
  const base = useEditor((s) => s.server.baseRevisionId);
  const clean = useEditor((s) => !s.server.hasUncommittedChanges && !selectHasUnsavedWork(s));
  const restoredFrom = useEditor((s) => s.server.restoredFromRevisionId);
  const compare = useEditor((s) => s.compare);
  const [restoring, setRestoring] = useState<{ id: string; displayId: string } | null>(null);
  const [zoom, setZoom] = useState<{ look: Look; view: LookView } | null>(null);
  const looks = useQuery({
    queryKey: queryKeys.org(active.id).looks(designId),
    queryFn: ({ signal }) => studioApi.looks(active.id, designId, signal),
    refetchInterval: (q) =>
      q.state.data?.items.some((l) => l.status === 'queued' || l.status === 'running')
        ? 1500
        : false,
  });
  const items = looks.data?.items ?? [];

  if (looks.isPending)
    return <p className="p-3 text-[12px] text-muted-foreground">Loading looks…</p>;
  if (!items.length)
    return (
      <p className="p-3 text-[12px] text-muted-foreground" data-testid="looks-empty">
        No looks yet. Use <strong>Preview look</strong> at the top to see how the garment sewn from
        these patterns looks from the front, back and sides.
      </p>
    );

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-2" data-testid="looks-panel">
      {items.map((look, i) => {
        const current = look.revisionId === base && clean;
        const restored = !current && look.revisionId === restoredFrom;
        const busy = look.status === 'queued' || look.status === 'running';
        return (
          <article
            key={look.id}
            className="flex flex-col gap-2 rounded-md border p-2 text-[12px]"
            data-testid="look-card"
            data-look-id={look.id}
          >
            <header className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{look.displayId}</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                patterns {look.revisionLabel}
              </Badge>
              {i === 0 ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  latest
                </Badge>
              ) : null}
              {current ? (
                <Badge className="h-5 px-1.5 text-[11px]" data-testid="look-current">
                  current patterns
                </Badge>
              ) : null}
              {restored ? (
                <Badge className="h-5 px-1.5 text-[11px]" data-testid="look-restored">
                  restored — commit to keep
                </Badge>
              ) : null}
              <span className="ml-auto text-muted-foreground">{when(look.createdAt)}</span>
            </header>
            {look.note ? <p className="text-muted-foreground">{look.note}</p> : null}
            {busy ? (
              <p className="flex items-center gap-1 text-muted-foreground" data-testid="look-stage">
                <Loader2Icon className="size-3 animate-spin" aria-hidden />
                {look.stage ?? 'Waiting…'}
              </p>
            ) : null}
            {look.status === 'failed' && look.error ? (
              <p role="alert" className="text-destructive">
                {look.error.message}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-1.5">
              {look.views.map((v) => (
                <figure key={v.view} className="flex flex-col gap-0.5">
                  {v.assetId ? (
                    <button
                      type="button"
                      className="overflow-hidden rounded border bg-white"
                      onClick={() => setZoom({ look, view: v.view })}
                      data-testid={`look-view-${v.view}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={assetContentUrl(active.id, v.assetId, 'preview_1024')}
                        alt={`${VIEW_LABEL[v.view]} view of ${look.displayId}`}
                        className="aspect-[3/4] w-full object-contain"
                      />
                    </button>
                  ) : (
                    <div
                      className={cn(
                        'flex aspect-[3/4] items-center justify-center rounded border border-dashed p-1 text-center text-[11px] text-muted-foreground',
                        busy && 'animate-pulse',
                      )}
                      title={v.note ?? undefined}
                    >
                      {busy ? 'drawing…' : (v.note ?? 'not drawn')}
                    </div>
                  )}
                  <figcaption className="text-center text-[11px] text-muted-foreground">
                    {VIEW_LABEL[v.view]}
                  </figcaption>
                </figure>
              ))}
            </div>
            {!current && !restored ? (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => compare(look.revisionId, 'working')}
                >
                  <GitCompareIcon aria-hidden /> Compare with now
                </Button>
                {canRestore ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    onClick={() =>
                      setRestoring({ id: look.revisionId, displayId: look.revisionDisplayId })
                    }
                    data-testid="look-restore"
                  >
                    <Undo2Icon aria-hidden /> Use these patterns
                  </Button>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
      <RestoreDialog revision={restoring} onClose={() => setRestoring(null)} />
      {zoom ? <LookViewer {...zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}

function LookViewer({ look, view, onClose }: { look: Look; view: LookView; onClose: () => void }) {
  const { active } = useOrganization();
  const [shown, setShown] = useState(view);
  const drawn = look.views.filter((v) => v.assetId);
  const current = look.views.find((v) => v.view === shown);
  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-w-3xl" data-testid="look-viewer">
        <DialogHeader>
          <DialogTitle>
            {look.displayId} · {VIEW_LABEL[shown]} view
          </DialogTitle>
          <DialogDescription>
            Drawn from the patterns of {look.revisionLabel}
            {look.note ? ` — ${look.note}` : ''}. An AI illustration to judge the look, not a
            measured drawing.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1">
          {drawn.map((v) => (
            <Button
              key={v.view}
              size="sm"
              variant={v.view === shown ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              onClick={() => setShown(v.view)}
            >
              {VIEW_LABEL[v.view]}
            </Button>
          ))}
        </div>
        {current?.assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetContentUrl(active.id, current.assetId, 'preview_1024')}
            alt={`${VIEW_LABEL[shown]} view of ${look.displayId}`}
            className="max-h-[70vh] w-full rounded border bg-white object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
