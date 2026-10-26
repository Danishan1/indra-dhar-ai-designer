'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { newIdempotencyKey, projectsApi } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Give the project a name').max(120, 'At most 120 characters'),
  productCategory: z.string().trim().max(80),
  season: z.string().trim().max(80),
  brand: z.string().trim().max(120),
  styleNumber: z.string().trim().max(80),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { name: '', productCategory: '', season: '', brand: '', styleNumber: '' };

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  // The same key is reused if the user retries after a network error, so only one project exists.
  const key = useRef(newIdempotencyKey());
  const create = useMutation({
    mutationFn: (v: Values) => projectsApi.create(active.id, v, key.current),
    onSuccess: async (project) => {
      toast.success(`Created ${project.displayId}`);
      key.current = newIdempotencyKey();
      form.reset(EMPTY);
      onOpenChange(false);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(active.id).all, 'projects'],
      });
      router.push(`/projects/${project.id}`);
    },
  });
  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project groups the designs, sources and specifications for one style. You can change
            these details later.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
        >
          <FormField label="Name" error={err.name?.message}>
            <Input autoFocus {...form.register('name')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Product category" error={err.productCategory?.message}>
              <Input placeholder="e.g. Shirts" {...form.register('productCategory')} />
            </FormField>
            <FormField label="Season" error={err.season?.message}>
              <Input placeholder="e.g. SS27" {...form.register('season')} />
            </FormField>
            <FormField label="Brand" error={err.brand?.message}>
              <Input {...form.register('brand')} />
            </FormField>
            <FormField label="Style number" error={err.styleNumber?.message}>
              <Input {...form.register('styleNumber')} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
