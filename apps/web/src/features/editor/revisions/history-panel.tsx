'use client';

import type { RevisionSummary } from '@ai-designer/contracts';
import {
  EyeIcon,
  GitCommitVerticalIcon,
  GitCompareIcon,
  HistoryIcon,
  Undo2Icon,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

import { CommitButton } from './commit-dialog';
import { RestoreDialog } from './restore-dialog';
import { useRevisionHistory } from './use-revisions';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const shortLabel = (displayId: string) => displayId.replace(/^.*-(R\d+)$/, '$1');

/**
 * History (FR-PRJ-028/029, FR-EDT-092): the working copy (autosaved draft) on top, then the
 * immutable revisions newest first with author, time, summary, lineage and markers.
 */
export function HistoryPanel() {
  const meta = useEditor((s) => s.meta);
  const version = useEditor((s) => s.server.version);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges);
  const baseRevisionId = useEditor((s) => s.server.baseRevisionId);
  const restoredFrom = useEditor((s) => s.server.restoredFromRevisionId);
  const viewRevision = useEditor((s) => s.viewRevision);
  const compare = useEditor((s) => s.compare);
  const history = useRevisionHistory();
  const [restoring, setRestoring] = useState<RevisionSummary | null>(null);
  const byId = new Map(history.items.map((r) => [r.id, r]));
  const restoredLabel = restoredFrom ? (byId.get(restoredFrom)?.displayId ?? null) : null;

  return (
    <div className="flex flex-col gap-2 p-2 text-[12px]" data-testid="history-panel">
      <section
        aria-label="Working copy"
        className="flex flex-col gap-1 rounded-md border border-dashed p-2"
        data-testid="history-working-copy"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">Working copy · v{version}</span>
          <Badge variant={uncommitted ? 'secondary' : 'outline'}>
            {uncommitted ? 'Not committed' : 'Committed'}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Autosaved draft — not a revision.{' '}
          {restoredLabel
            ? `Restored from ${shortLabel(restoredLabel)}; commit to record it.`
            : uncommitted
              ? `Changed since ${meta.headRevision ? shortLabel(meta.headRevision.displayId) : 'the start'}.`
              : 'Same as the latest revision.'}
        </span>
        <div className="flex flex-wrap gap-1">
          <CommitButton size="sm" />
          {meta.headRevision && uncommitted ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => compare(meta.headRevision!.id, 'working')}
            >
              <GitCompareIcon aria-hidden /> Changes
            </Button>
          ) : null}
        </div>
      </section>

      {history.isPending ? (
        <p className="text-muted-foreground">Loading history…</p>
      ) : history.isError ? (
        <div className="flex flex-col items-start gap-1">
          <span>We couldn’t load the history.</span>
          <Button size="sm" variant="outline" onClick={() => void history.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <ol aria-label="Revisions" className="flex flex-col">
          {history.items.map((r, i) => {
            const parent = r.parentRevisionIds[0] ? byId.get(r.parentRevisionIds[0]) : undefined;
            const restored = r.restoredFromRevisionId
              ? byId.get(r.restoredFromRevisionId)
              : undefined;
            const isHead = r.id === meta.headRevision?.id;
            const isApproved = r.id === meta.approvedRevision?.id;
            const isBase = r.id === baseRevisionId;
            const lines = r.changeSummary.split('\n').filter(Boolean);
            return (
              <li
                key={r.id}
                className="relative flex gap-2 pb-3"
                data-testid="revision-item"
                data-revision-id={r.id}
              >
                {/* Lineage rail. */}
                <div className="flex flex-col items-center" aria-hidden>
                  <GitCommitVerticalIcon
                    className={cn('size-4', isHead ? 'text-primary' : 'text-muted-foreground')}
                  />
                  {i < history.items.length - 1 ? <div className="w-px flex-1 bg-border" /> : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold" data-testid="revision-label">
                      {shortLabel(r.displayId)}
                    </span>
                    {isHead ? <Badge variant="secondary">Latest</Badge> : null}
                    {isApproved ? <Badge variant="outline">Approved</Badge> : null}
                    {isBase && !isHead ? <Badge variant="outline">Working copy base</Badge> : null}
                    {r.validationSummary.errors ? (
                      <Badge variant="outline" className="text-destructive">
                        {r.validationSummary.errors} errors
                      </Badge>
                    ) : null}
                    {r.validationSummary.warnings ? (
                      <Badge variant="outline">{r.validationSummary.warnings} warnings</Badge>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {r.createdByName ?? 'Unknown'} · {when(r.createdAt)}
                  </span>
                  {parent || restored ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <HistoryIcon className="size-3" aria-hidden />
                      {parent ? `After ${shortLabel(parent.displayId)}` : null}
                      {restored ? ` · restored from ${shortLabel(restored.displayId)}` : null}
                    </span>
                  ) : null}
                  <p className="line-clamp-3 whitespace-pre-line" title={r.changeSummary}>
                    {lines.length ? lines.slice(0, 3).join('\n') : 'No summary'}
                  </p>
                  <div className="flex flex-wrap gap-0.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => viewRevision(r.id)}
                    >
                      <EyeIcon aria-hidden /> View
                      <span className="sr-only"> {shortLabel(r.displayId)}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-xs"
                      onClick={() => compare(r.id, 'working')}
                    >
                      <GitCompareIcon aria-hidden /> Compare
                      <span className="sr-only"> {shortLabel(r.displayId)}</span>
                    </Button>
                    {meta.capabilities.canRestore && !(isBase && !uncommitted && !restoredFrom) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-xs"
                        onClick={() => setRestoring(r)}
                      >
                        <Undo2Icon aria-hidden /> Restore
                        <span className="sr-only"> {shortLabel(r.displayId)}</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {history.hasNextPage ? (
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {history.isFetchingNextPage ? 'Loading…' : 'Older revisions'}
        </Button>
      ) : null}
      <RestoreDialog revision={restoring} onClose={() => setRestoring(null)} />
    </div>
  );
}
