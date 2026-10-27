'use client';

import { SAVE_STATUS_LABELS, type SaveStatus } from '@ai-designer/editor-core';
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleDotIcon,
  CloudOffIcon,
  GitMergeIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ICONS: Record<SaveStatus, LucideIcon> = {
  saved: CheckIcon,
  saving: LoaderCircleIcon,
  unsaved: CircleDotIcon,
  save_failed: AlertTriangleIcon,
  conflict: GitMergeIcon,
  offline: CloudOffIcon,
};

const TONES: Record<SaveStatus, string> = {
  saved: 'text-status-ok',
  saving: 'text-muted-foreground',
  unsaved: 'text-muted-foreground',
  save_failed: 'text-destructive',
  conflict: 'text-status-needs-review',
  offline: 'text-status-needs-review',
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * Save status of the working copy (FR-EDT-005/087): always an icon AND text (never color alone);
 * "Saved" only after the server acknowledged (FR-PRJ-016). Failed and conflict offer the way out.
 */
export function SaveStatusChip({
  status,
  lastSavedAt,
  error,
  onRetry,
  onResolve,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
  error?: string | null;
  onRetry?: () => void;
  onResolve?: () => void;
}) {
  const Icon = ICONS[status];
  const title =
    status === 'saved' && lastSavedAt
      ? `All changes saved at ${time(lastSavedAt)}`
      : status === 'save_failed' && error
        ? `Save failed: ${error}. Your changes are kept.`
        : status === 'offline'
          ? 'You are offline. Changes are kept and saved when the connection returns.'
          : status === 'conflict'
            ? 'Someone else changed this design. Nothing was overwritten.'
            : SAVE_STATUS_LABELS[status];
  return (
    <div className="flex items-center gap-1">
      <span
        role="status"
        aria-live="polite"
        data-save-status={status}
        title={title}
        className={cn('flex items-center gap-1 text-xs font-medium', TONES[status])}
      >
        <Icon className={cn('size-3.5', status === 'saving' && 'animate-spin')} aria-hidden />
        {SAVE_STATUS_LABELS[status]}
      </span>
      {status === 'save_failed' && onRetry ? (
        <Button size="sm" variant="outline" className="h-6" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
      {status === 'conflict' && onResolve ? (
        <Button size="sm" variant="outline" className="h-6" onClick={onResolve}>
          Resolve
        </Button>
      ) : null}
    </div>
  );
}
