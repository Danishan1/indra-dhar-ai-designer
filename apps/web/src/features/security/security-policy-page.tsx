'use client';

import type { SecurityPolicyConfig } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormNotice } from '@/features/auth/auth-card';
import { useOrganization } from '@/features/organizations/organization-provider';
import { friendlyMessage, toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { securityApi } from './api';

const numberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Settings → Security policy (needs `security_policy.manage`; saving needs a recent step-up). */
export function SecurityPolicyPage() {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const policy = useQuery({
    queryKey: queryKeys.org(active.id).securityPolicy(),
    queryFn: ({ signal }) => securityApi.securityPolicy(active.id, signal),
    enabled: can('security_policy.manage'),
  });
  const [draft, setDraft] = useState<SecurityPolicyConfig | null>(null);
  useEffect(() => {
    if (policy.data) setDraft(policy.data.config);
  }, [policy.data]);
  const save = useMutation({
    mutationFn: (config: SecurityPolicyConfig) =>
      securityApi.updateSecurityPolicy(active.id, config),
    meta: { silent: true },
    onSuccess: async (updated) => {
      toast.success(`Security policy saved (version ${updated.version})`);
      queryClient.setQueryData(queryKeys.org(active.id).securityPolicy(), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).myPermissions() });
    },
  });

  const header = (
    <PageHeader title="Security policy" description={`Rules for everyone in ${active.name}.`} />
  );
  if (!can('security_policy.manage')) {
    return (
      <>
        {header}
        <div className="p-6">
          <EmptyState
            title="You can't change the security policy"
            description="Owners and admins manage it."
          />
        </div>
      </>
    );
  }
  if (policy.isPending || !draft)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (policy.isError)
    return (
      <>
        {header}
        <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
      </>
    );
  const limits = policy.data.limits;
  const error = save.error ? toApiError(save.error) : null;
  const set = <K extends keyof SecurityPolicyConfig>(k: K, v: SecurityPolicyConfig[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <>
      {header}
      <form
        noValidate
        className="flex max-w-xl flex-col gap-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(draft);
        }}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={draft.requireMfa}
            onChange={(e) => set('requireMfa', e.target.checked)}
          />
          <span className="flex flex-col">
            <span className="text-[13px] font-medium">
              Require two-step verification for everyone
            </span>
            <span className="text-xs text-muted-foreground">
              Members without an authenticator app can’t open anything in this organization until
              they set one up. Sensitive actions always require it.
            </span>
          </span>
        </label>
        <FormField
          label="Re-verify for high-risk actions after (minutes)"
          hint="Transferring ownership, changing this policy, billing and credentials need a code this recent."
        >
          <Input
            type="number"
            min={1}
            max={60}
            value={draft.stepUpMaxAgeMinutes}
            onChange={(e) => set('stepUpMaxAgeMinutes', Number(e.target.value))}
          />
        </FormField>
        <FormField
          label="Sign out after inactivity (minutes)"
          hint={`Empty = platform default (${limits.sessionIdleMinutesMax} min). Only shorter values are allowed.`}
        >
          <Input
            type="number"
            value={draft.sessionIdleMinutes ?? ''}
            onChange={(e) => set('sessionIdleMinutes', numberOrNull(e.target.value))}
          />
        </FormField>
        <FormField
          label="Maximum session length (hours)"
          hint={`Empty = platform default (${limits.sessionAbsoluteHoursMax} h).`}
        >
          <Input
            type="number"
            value={draft.sessionAbsoluteHours ?? ''}
            onChange={(e) => set('sessionAbsoluteHours', numberOrNull(e.target.value))}
          />
        </FormField>
        {error ? (
          <FormNotice tone="error">
            {error.code === 'VALIDATION_FAILED'
              ? ((error.details?.['issues'] as { message: string; path: string }[] | undefined)
                  ?.map((i) => `${i.path}: ${i.message}`)
                  .join(' · ') ?? error.message)
              : friendlyMessage(error.code)}
          </FormNotice>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            Save policy
          </Button>
          <span className="text-xs text-muted-foreground">
            Version {policy.data.version}
            {policy.data.updatedAt ? ` · ${new Date(policy.data.updatedAt).toLocaleString()}` : ''}
          </span>
        </div>
      </form>
    </>
  );
}
