'use client';

import type { Readiness } from '@ai-designer/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BugIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  HardDriveIcon,
  type LucideIcon,
  RotateCwIcon,
  ServerIcon,
  XCircleIcon,
} from 'lucide-react';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { devApi, systemApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

const COMPONENTS: { key: keyof Readiness['checks']; label: string; icon: LucideIcon }[] = [
  { key: 'database', label: 'Database', icon: DatabaseIcon },
  { key: 'redis', label: 'Queue & cache (Redis)', icon: ServerIcon },
  { key: 'objectStorage', label: 'Object storage', icon: HardDriveIcon },
];

function ComponentStatus({
  label,
  icon: Icon,
  status,
}: {
  label: string;
  icon: LucideIcon;
  status: 'ok' | 'down';
}) {
  const ok = status === 'ok';
  const StateIcon = ok ? CheckCircle2Icon : XCircleIcon;
  return (
    <li
      data-testid={`status-${label}`}
      data-status={status}
      className="flex items-center gap-3 rounded-lg border bg-card p-4"
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1.5 text-[13px] font-medium',
          ok ? 'text-status-ok' : 'text-status-down',
        )}
      >
        <StateIcon className="size-4" aria-hidden />
        {ok ? 'Operational' : 'Unavailable'}
      </span>
    </li>
  );
}

/**
 * Dev-only: sends an invalid request to the example endpoint so the error path (envelope →
 * ApiError → friendly toast with reference) can be seen and E2E-tested.
 */
function Diagnostics() {
  const failing = useMutation({ mutationFn: () => devApi.echo('') });
  return (
    <section className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4">
      <div>
        <h2 className="text-sm font-medium">Diagnostics (development only)</h2>
        <p className="text-[13px] text-muted-foreground">
          Trigger an API validation error to check error reporting.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => failing.mutate()}
        disabled={failing.isPending}
      >
        <BugIcon aria-hidden /> Trigger test error
      </Button>
    </section>
  );
}

/** Proves web ↔ API connectivity through the typed client (I04 AC3). */
export function SystemStatusPage() {
  const readiness = useQuery({
    queryKey: queryKeys.system.readiness(),
    queryFn: ({ signal }) => systemApi.readiness(signal),
    refetchInterval: 30_000,
  });
  const liveness = useQuery({
    queryKey: queryKeys.system.liveness(),
    queryFn: ({ signal }) => systemApi.liveness(signal),
  });

  return (
    <>
      <PageHeader
        title="System status"
        description="Health of the API and the services it depends on."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void readiness.refetch()}
            disabled={readiness.isFetching}
            aria-label="Refresh status"
          >
            <RotateCwIcon className={cn(readiness.isFetching && 'animate-spin')} aria-hidden />{' '}
            Refresh
          </Button>
        }
      />
      <div className="flex max-w-3xl flex-col gap-4 p-6">
        {readiness.isPending ? (
          <LoadingState label="Checking services…" />
        ) : readiness.isError ? (
          <ErrorState
            error={readiness.error}
            title="Cannot reach the API"
            onRetry={() => void readiness.refetch()}
          />
        ) : (
          <>
            <p className="text-[13px]" role="status">
              Overall:{' '}
              <strong data-testid="overall-status">
                {readiness.data.status === 'ok' ? 'All systems operational' : 'Degraded'}
              </strong>
            </p>
            <ul className="flex flex-col gap-2">
              {COMPONENTS.map((c) => (
                <ComponentStatus
                  key={c.key}
                  label={c.label}
                  icon={c.icon}
                  status={readiness.data.checks[c.key]}
                />
              ))}
            </ul>
            {process.env.NODE_ENV !== 'production' ? <Diagnostics /> : null}
            <p className="text-xs text-muted-foreground">
              API version {liveness.data?.version ?? '…'} · checked{' '}
              {new Date(readiness.data.time).toLocaleTimeString()}
            </p>
          </>
        )}
      </div>
    </>
  );
}
