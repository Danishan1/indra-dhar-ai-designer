'use client';

import {
  createOrganizationRequestSchema,
  type CreateOrganizationRequest,
} from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormNotice } from '@/features/auth/auth-card';
import { friendlyMessage, toApiError } from '@/lib/api/errors';
import { PreferenceKeys, writePreference } from '@/lib/local-preferences';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';

export function CreateOrganizationForm({ onCreated }: { onCreated: (orgId: string) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<
    CreateOrganizationRequest,
    unknown,
    z.output<typeof createOrganizationRequestSchema>
  >({
    resolver: zodResolver(createOrganizationRequestSchema),
    defaultValues: { name: '' },
  });
  const create = useMutation({
    mutationFn: (name: string) => orgsApi.create(name),
    meta: { silent: true },
    onSuccess: async (org) => {
      writePreference(PreferenceKeys.activeOrganization, org.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.myOrgs() });
      onCreated(org.id);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit((v) => create.mutate(v.name))}
    >
      <FormField
        label="Organization name"
        error={form.formState.errors.name?.message}
        hint="Your company, studio or team. You can rename it later."
      >
        <Input autoFocus autoComplete="organization" {...form.register('name')} />
      </FormField>
      {create.error ? (
        <FormNotice tone="error">{friendlyMessage(toApiError(create.error).code)}</FormNotice>
      ) : null}
      <Button type="submit" disabled={create.isPending}>
        Create organization
      </Button>
    </form>
  );
}
