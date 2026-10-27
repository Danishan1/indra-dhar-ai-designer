'use client';

import { ArtifactCategoryKeys } from '@ai-designer/contracts';
import type { DesignComponent } from '@ai-designer/garment-model';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { libraryApi, newIdempotencyKey } from '@/features/library/api';
import { SCOPE_LABELS } from '@/features/library/labels';
import { useOrganization } from '@/features/organizations/organization-provider';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { useEditor } from '../store-context';

/** Component types that can become library artifacts (the artifact category is the type). */
export const canSaveAsArtifact = (c: DesignComponent) =>
  (ArtifactCategoryKeys as readonly string[]).includes(c.componentType);

/**
 * "Save as artifact…" (FR-EDT-057): copies the component's saved values into a new artifact with a
 * preview drawn from the flat. Private by default; the organization library needs `artifact.publish`.
 * Unsaved changes are not included — the server reads the saved working copy.
 */
export function SaveArtifactDialog({
  component,
  onClose,
}: {
  component: DesignComponent | null;
  onClose: () => void;
}) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const designId = useEditor((s) => s.meta.design.id);
  const canPublish = useEditor((s) => s.meta.capabilities.canPublishArtifacts);
  const flush = useEditor((s) => s.flush);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'user' | 'organization'>('user');
  const [key] = useState(newIdempotencyKey);
  const save = useMutation({
    mutationFn: async () => {
      await flush();
      return libraryApi.fromComponent(
        active.id,
        { designId, componentId: component!.componentId, name: name.trim(), scope },
        key,
      );
    },
    onSuccess: async (a) => {
      toast.success(`Saved “${a.name}” to the library`, { description: a.displayId });
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(active.id).all, 'artifacts'],
      });
      onClose();
    },
  });
  const error = save.error ? toApiError(save.error).message : undefined;
  return (
    <Dialog open={!!component} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Save {component?.displayName} as an artifact</DialogTitle>
            <DialogDescription>
              Its saved values and a drawing become a reusable library item. Values stay proposals
              when reused elsewhere.
            </DialogDescription>
          </DialogHeader>
          <FormField label="Name" error={error}>
            <Input
              autoFocus
              value={name}
              maxLength={120}
              placeholder={component?.displayName}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Who can use it">
            <SimpleSelect
              value={scope}
              onValueChange={(v) => setScope(v as typeof scope)}
              options={[
                { value: 'user', label: SCOPE_LABELS.user, description: 'Only you' },
                {
                  value: 'organization',
                  label: SCOPE_LABELS.organization,
                  description: canPublish
                    ? 'Everyone in the organization'
                    : 'Needs permission to publish',
                  disabled: !canPublish,
                },
              ]}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save to library'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
