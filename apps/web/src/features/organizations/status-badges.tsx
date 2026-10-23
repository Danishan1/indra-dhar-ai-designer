import {
  type InvitationStatus,
  type MembershipStatus,
  type OrgRoleKey,
  OrgRoleLabels,
} from '@ai-designer/contracts';
import {
  BanIcon,
  CheckCircle2Icon,
  ClockIcon,
  PauseCircleIcon,
  ShieldIcon,
  XCircleIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const MEMBERSHIP: Record<
  MembershipStatus,
  { label: string; icon: typeof CheckCircle2Icon; tone: string }
> = {
  active: { label: 'Active', icon: CheckCircle2Icon, tone: 'text-status-ok border-status-ok/40' },
  invited: { label: 'Invited', icon: ClockIcon, tone: 'text-muted-foreground border-border' },
  suspended: {
    label: 'Suspended',
    icon: PauseCircleIcon,
    tone: 'text-status-needs-review border-status-needs-review/40',
  },
  revoked: { label: 'Removed', icon: BanIcon, tone: 'text-muted-foreground border-border' },
  expired: { label: 'Expired', icon: XCircleIcon, tone: 'text-muted-foreground border-border' },
};

/** Status with icon + text (never color only, FR-EDT-129). */
export function MembershipStatusBadge({ status }: { status: MembershipStatus | InvitationStatus }) {
  const s = MEMBERSHIP[status as MembershipStatus] ?? {
    label: status === 'pending' ? 'Pending' : status,
    icon: ClockIcon,
    tone: 'text-muted-foreground border-border',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        s.tone,
      )}
    >
      <s.icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

export function RoleBadges({ roles }: { roles: OrgRoleKey[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <span
          key={r}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium"
        >
          {r === 'organization_owner' ? <ShieldIcon className="size-3" aria-hidden /> : null}
          {OrgRoleLabels[r]}
        </span>
      ))}
    </span>
  );
}
