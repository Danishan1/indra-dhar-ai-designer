import { AlertTriangleIcon, InboxIcon, Loader2Icon, RotateCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { friendlyMessage, toApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2Icon className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground [&_svg]:size-8" aria-hidden>
        {icon ?? <InboxIcon />}
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {description ? (
        <p className="max-w-md text-[13px] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Inline error for failed queries: friendly text + support reference + retry. */
export function ErrorState({
  error,
  title,
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const apiError = toApiError(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/40 p-8 text-center',
        className,
      )}
    >
      <AlertTriangleIcon className="size-7 text-destructive" aria-hidden />
      <h2 className="text-sm font-semibold">{title ?? 'Something went wrong'}</h2>
      <p className="max-w-md text-[13px] text-muted-foreground">{friendlyMessage(apiError.code)}</p>
      {apiError.requestId ? (
        <p className="text-xs text-muted-foreground">
          Reference: <code className="font-mono select-all">{apiError.requestId}</code>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RotateCwIcon aria-hidden /> Try again
        </Button>
      ) : null}
    </div>
  );
}
