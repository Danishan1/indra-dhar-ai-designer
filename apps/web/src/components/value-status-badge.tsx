import { type ValueStatus, ValueStatusLabels } from '@ai-designer/contracts';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  EyeIcon,
  type LucideIcon,
  MinusCircleIcon,
  SparklesIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<ValueStatus, { icon: LucideIcon; className: string }> = {
  confirmed: {
    icon: CheckCircle2Icon,
    className: 'text-status-confirmed border-status-confirmed/40',
  },
  inferred: {
    icon: SparklesIcon,
    className: 'text-status-inferred border-status-inferred/40 border-dashed',
  },
  proposed: {
    icon: CircleDashedIcon,
    className: 'text-status-proposed border-status-proposed/40 border-dashed',
  },
  missing: { icon: CircleAlertIcon, className: 'text-status-missing border-status-missing/40' },
  needs_review: {
    icon: EyeIcon,
    className: 'text-status-needs-review border-status-needs-review/40',
  },
  not_applicable: {
    icon: MinusCircleIcon,
    className: 'text-status-not-applicable border-status-not-applicable/40',
  },
};

/**
 * The one way to show a value's status (02-conventions §6). Icon + text label + border style, so
 * meaning never depends on color alone (FR-EDT-129). `compact` hides the text visually but keeps
 * it for screen readers and the tooltip.
 */
export function ValueStatusBadge({
  status,
  compact = false,
  className,
}: {
  status: ValueStatus;
  compact?: boolean;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STATUS_STYLE[status];
  const label = ValueStatusLabels[status];
  return (
    <span
      data-status={status}
      title={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        tone,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </span>
  );
}
