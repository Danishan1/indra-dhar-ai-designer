'use client';

import {
  updateOrganizationRequestSchema,
  type UpdateOrganizationRequest,
} from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { useSession } from '@/features/auth/session-provider';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';
import { useOrganization } from './organization-provider';

function RenameForm() {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const form = useForm<
    UpdateOrganizationRequest,
    unknown,
    z.output<typeof updateOrganizationRequestSchema>
  >({
    resolver: zodResolver(updateOrganizationRequestSchema),
    values: { name: active.name },
  });
  const rename = useMutation({
    mutationFn: (name: string) => orgsApi.rename(active.id, name),
    onSuccess: async () => {
      toast.success('Organization renamed');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
    },
  });
  return (
    <form
      noValidate
      className="flex max-w-md flex-col gap-3"
      onSubmit={form.handleSubmit((v) => rename.mutate(v.name))}
    >
      <FormField label="Organization name" error={form.formState.errors.name?.message}>
        <Input {...form.register('name')} />
      </FormField>
      <p className="text-xs text-muted-foreground">
        ID {active.displayId} · slug {active.slug}
      </p>
      <Button
        type="submit"
        size="sm"
        className="w-fit"
        disabled={rename.isPending || !form.formState.isDirty}
      >
        Save
      </Button>
    </form>
  );
}

function TransferOwnership() {
  const { active } = useOrganization();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const members = useQuery({
    queryKey: queryKeys.org(active.id).members(),
    queryFn: ({ signal }) => orgsApi.members(active.id, signal),
  });
  const candidates = (members.data?.items ?? []).filter(
    (m) => m.status === 'active' && m.userId !== user?.id,
  );
  const transfer = useMutation({
    mutationFn: () =>
      orgsApi.transferOwnership(active.id, {
        toMembershipId: target,
        confirmOrganizationName: confirmName,
      }),
    onSuccess: async () => {
      toast.success('Ownership transferred. You are now an admin.');
      setConfirmName('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).members() });
    },
  });
  return (
    <section className="flex max-w-md flex-col gap-3 rounded-lg border border-destructive/40 p-4">
      <div>
        <h2 className="text-sm font-semibold">Transfer ownership</h2>
        <p className="text-[13px] text-muted-foreground">
          The selected member becomes the owner and you become an admin. An organization always
          keeps at least one owner.
        </p>
      </div>
      <FormField label="New owner">
        <SimpleSelect
          value={target}
          onValueChange={setTarget}
          placeholder={candidates.length ? 'Choose an active member…' : 'No other active members'}
          disabled={!candidates.length}
          options={candidates.map((m) => ({
            value: m.membershipId,
            label: m.displayName,
            description: m.email,
          }))}
        />
      </FormField>
      <FormField label={`Type “${active.name}” to confirm`}>
        <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
      </FormField>
      <Button
        variant="destructive"
        size="sm"
        className="w-fit"
        disabled={!target || confirmName !== active.name || transfer.isPending}
        onClick={() => transfer.mutate()}
      >
        Transfer ownership
      </Button>
    </section>
  );
}

export function GeneralSettings() {
  const { active, can } = useOrganization();
  return (
    <>
      <PageHeader title="Organization settings" description={active.name} />
      <div className="flex flex-col gap-8 p-6">
        {can('organization.update') ? (
          <RenameForm />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Your roles don't include changing organization settings.
          </p>
        )}
        {can('organization.transfer_ownership') ? <TransferOwnership /> : null}
      </div>
    </>
  );
}
