import type { ValidationFindingView } from '@ai-designer/contracts';
import { CircleAlertIcon, EyeIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type FindingKind = 'blocking' | 'warning' | 'review' | 'info';

/** Manual-review findings are shown as their own kind (they stay until resolved, §15.3). */
export const kindOf = (f: Pick<ValidationFindingView, 'severity' | 'outcome'>): FindingKind =>
  f.outcome === 'requires_manual_review' ? 'review' : f.severity;

export const KIND_LABELS: Record<FindingKind, string> = {
  blocking: 'Blocking',
  warning: 'Warning',
  review: 'Needs review',
  info: 'Info',
};

const ICONS = {
  blocking: OctagonXIcon,
  warning: TriangleAlertIcon,
  review: EyeIcon,
  info: InfoIcon,
} as const;

export const KIND_CLASS: Record<FindingKind, string> = {
  blocking: 'text-destructive',
  warning: 'text-status-needs-review',
  review: 'text-status-proposed',
  info: 'text-muted-foreground',
};

export const KIND_ORDER: Record<FindingKind, number> = {
  blocking: 0,
  warning: 1,
  review: 2,
  info: 3,
};

/** Icon + text (never colour alone, FR-EDT-119). */
export function FindingKindIcon({
  kind,
  className,
  withLabel = false,
}: {
  kind: FindingKind;
  className?: string;
  withLabel?: boolean;
}) {
  const Icon = ICONS[kind] ?? CircleAlertIcon;
  return (
    <span className={cn('inline-flex items-center gap-1', KIND_CLASS[kind], className)}>
      <Icon
        className="size-3.5 shrink-0"
        aria-hidden={withLabel}
        aria-label={withLabel ? undefined : KIND_LABELS[kind]}
      />
      {withLabel ? <span>{KIND_LABELS[kind]}</span> : null}
    </span>
  );
}
