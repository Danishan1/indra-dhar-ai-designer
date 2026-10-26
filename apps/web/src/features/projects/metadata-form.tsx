'use client';

import { isEditable, type Project } from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/features/organizations/organization-provider';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { projectsApi } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(120, 'At most 120 characters'),
  description: z.string().trim().max(2000, 'At most 2000 characters'),
  productCategory: z.string().trim().max(80),
  season: z.string().trim().max(80),
  brand: z.string().trim().max(120),
  targetMarket: z.string().trim().max(120),
  styleNumber: z.string().trim().max(80),
  tags: z.string().max(800),
});
type Values = z.infer<typeof schema>;

const toValues = (p: Project): Values => ({
  name: p.name,
  description: p.description ?? '',
  productCategory: p.productCategory ?? '',
  season: p.season ?? '',
  brand: p.brand ?? '',
  targetMarket: p.targetMarket ?? '',
  styleNumber: p.styleNumber ?? '',
  tags: p.tags.join(', '),
});
const toTags = (value: string) =>
  value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

/** Project details; saves with the version the user saw and explains conflicts (API-003). */
export function MetadataForm({ project }: { project: Project }) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const [conflict, setConflict] = useState(false);
  const readOnly = !can('project.edit') || !isEditable(project.status);
  const form = useForm<Values>({ resolver: zodResolver(schema), values: toValues(project) });
  const err = form.formState.errors;

  const save = useMutation({
    meta: { silent: true },
    mutationFn: (v: Values) =>
      projectsApi.update(active.id, project.id, {
        expectedVersion: project.version,
        name: v.name,
        description: v.description,
        productCategory: v.productCategory,
        season: v.season,
        brand: v.brand,
        targetMarket: v.targetMarket,
        styleNumber: v.styleNumber,
        tags: toTags(v.tags),
      }),
    onSuccess: async () => {
      setConflict(false);
      toast.success('Project saved');
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).project(project.id),
      });
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(active.id).all, 'projects'],
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CONCURRENT_MODIFICATION') {
        setConflict(true);
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save the project');
    },
  });
  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).project(project.id) });
    form.reset(toValues(project));
    setConflict(false);
  };

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-3"
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      aria-label="Project details"
    >
      {readOnly ? (
        <p className="rounded-md border p-2 text-[13px] text-muted-foreground" role="note">
          {isEditable(project.status)
            ? 'You can view these details but not change them.'
            : 'Details are read-only while the project is completed or archived.'}
        </p>
      ) : null}
      {conflict ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-3 text-[13px]"
        >
          <span>
            Someone else changed this project while you were editing. Reload to see the latest
            version, then apply your changes again.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
            Reload
          </Button>
        </div>
      ) : null}
      <fieldset disabled={readOnly} className="flex flex-col gap-3">
        <FormField label="Name" error={err.name?.message}>
          <Input {...form.register('name')} />
        </FormField>
        <FormField label="Description" error={err.description?.message}>
          <Input {...form.register('description')} />
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Product category" error={err.productCategory?.message}>
            <Input {...form.register('productCategory')} />
          </FormField>
          <FormField label="Season" error={err.season?.message}>
            <Input {...form.register('season')} />
          </FormField>
          <FormField label="Brand" error={err.brand?.message}>
            <Input {...form.register('brand')} />
          </FormField>
          <FormField label="Target market" error={err.targetMarket?.message}>
            <Input {...form.register('targetMarket')} />
          </FormField>
          <FormField label="Style number" error={err.styleNumber?.message}>
            <Input {...form.register('styleNumber')} />
          </FormField>
          <FormField label="Tags" hint="Separate with commas" error={err.tags?.message}>
            <Input {...form.register('tags')} />
          </FormField>
        </div>
      </fieldset>
      {!readOnly ? (
        <Button
          type="submit"
          size="sm"
          className="w-fit"
          disabled={save.isPending || !form.formState.isDirty}
        >
          Save changes
        </Button>
      ) : null}
    </form>
  );
}
