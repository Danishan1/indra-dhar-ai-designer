'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LaptopIcon, ShieldCheckIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/query/keys';

import { securityApi } from './api';

const when = (iso: string) => new Date(iso).toLocaleString();

/** Your sessions, with sign-out per device (FR-SEC-054). */
export function SessionsCard() {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.security.sessions(),
    queryFn: ({ signal }) => securityApi.sessions(signal),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.security.sessions() });
  const revoke = useMutation({
    mutationFn: securityApi.revokeSession,
    onSuccess: async () => {
      toast.success('Session signed out');
      await refresh();
    },
  });
  const revokeOthers = useMutation({
    mutationFn: securityApi.revokeOtherSessions,
    onSuccess: async ({ revoked }) => {
      toast.success(revoked ? `Signed out ${revoked} other session(s)` : 'No other sessions');
      await refresh();
    },
  });
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-4"
      aria-labelledby="sessions-heading"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="sessions-heading" className="text-sm font-semibold">
            Where you’re signed in
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Sign out sessions you don’t recognise. Changing your password or two-step verification
            signs out the others automatically.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          Sign out other sessions
        </Button>
      </div>
      {sessions.isPending ? (
        <LoadingState />
      ) : sessions.isError ? (
        <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : (
        <ul className="flex flex-col divide-y" aria-label="Sessions">
          {sessions.data.items.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2" data-testid="session-row">
              <LaptopIcon className="size-5 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-medium">
                  {s.deviceLabel}
                  {s.current ? (
                    <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">
                      This device
                    </span>
                  ) : null}
                  {s.mfaVerified ? (
                    <ShieldCheckIcon
                      className="ml-1 inline size-3.5 text-status-ok"
                      aria-label="Verified with two-step verification"
                    />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  Signed in {when(s.createdAt)} · last active {when(s.lastSeenAt)}
                </span>
              </div>
              {s.current ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(s.id)}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
