import type { ProjectStatus } from '@ai-designer/contracts';
import {
  ArchiveIcon,
  CheckCircle2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  Trash2Icon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const STATUS: Record<ProjectStatus, { label: string; icon: typeof ArchiveIcon; tone: string }> = {
  ACTIVE: { label: 'Active', icon: PlayCircleIcon, tone: 'text-status-ok border-status-ok/40' },
  ON_HOLD: {
    label: 'On hold',
    icon: PauseCircleIcon,
    tone: 'text-status-needs-review border-status-needs-review/40',
  },
  COMPLETED: { label: 'Completed', icon: CheckCircle2Icon, tone: 'text-primary border-primary/40' },
  ARCHIVED: { label: 'Archived', icon: ArchiveIcon, tone: 'text-muted-foreground border-border' },
  DELETED: { label: 'Deleted', icon: Trash2Icon, tone: 'text-destructive border-destructive/40' },
};

export const statusLabel = (status: ProjectStatus) => STATUS[status].label;

/** Lifecycle status with icon + text (never color only, FR-EDT-129). */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        s.tone,
      )}
      data-testid="project-status"
    >
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}
