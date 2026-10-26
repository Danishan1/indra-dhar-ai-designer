'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
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
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { designsApi, newIdempotencyKey } from './api';

const TEMPLATES = [
  { value: 'woven_shirt', label: 'Woven shirt' },
  { value: 'knit_tshirt', label: 'Knit T-shirt' },
  { value: 'blank', label: 'Blank (choose parts later)' },
];

const schema = z.object({
  name: z.string().trim().min(1, 'Give the design a name').max(120, 'At most 120 characters'),
  template: z.enum(['woven_shirt', 'knit_tshirt', 'blank']),
});
type Values = z.infer<typeof schema>;
const EMPTY: Values = { name: '', template: 'woven_shirt' };

export function NewDesignDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const key = useRef(newIdempotencyKey());
  const create = useMutation({
    mutationFn: (v: Values) => designsApi.create(active.id, projectId, v, key.current),
    onSuccess: async (design) => {
      toast.success(`Created ${design.displayId}`);
      key.current = newIdempotencyKey();
      form.reset(EMPTY);
      onOpenChange(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).project(projectId),
      });
      router.push(`/designs/${design.id}`);
    },
  });
  const err = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New design</DialogTitle>
          <DialogDescription>
            A template gives you the usual parts with suggested options to review — nothing is
            confirmed until you say so. The first revision (R001) is saved automatically.
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
          <FormField label="Start from">
            <Controller
              control={form.control}
              name="template"
              render={({ field }) => (
                <SimpleSelect
                  aria-label="Start from"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={TEMPLATES}
                />
              )}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Create design
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
