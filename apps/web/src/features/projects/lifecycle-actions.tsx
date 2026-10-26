'use client';

import {
  allowedActions,
  type LifecycleAction,
  LIFECYCLE_TRANSITIONS,
  type Project,
} from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { LoadingState } from '@/components/states/states';
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

import { projectsApi } from './api';

interface ActionText {
  button: string;
  title: string;
  /** What will happen — shown before confirming (NFR-PRJ-017). */
  effect: string;
  reasonLabel?: string;
  reasonRequired?: boolean;
  success: string;
  variant?: 'default' | 'outline' | 'destructive';
}

const TEXT: Record<LifecycleAction, ActionText> = {
  hold: {
    button: 'Put on hold',
    title: 'Put this project on hold?',
    effect:
      'Work pauses but nothing is lost. You can still edit the details, and resume at any time.',
    reasonLabel: 'Reason (optional)',
    success: 'Project put on hold',
    variant: 'outline',
  },
  resume: {
    button: 'Resume',
    title: 'Resume this project?',
    effect: 'The project becomes active again.',
    success: 'Project resumed',
  },
  complete: {
    button: 'Mark completed',
    title: 'Mark this project as completed?',
    effect:
      'Completed means the work is finished — it does not mean designs are approved or ready for production. Details become read-only until someone with permission reopens it.',
    success: 'Project marked completed',
    variant: 'outline',
  },
  reopen: {
    button: 'Reopen',
    title: 'Reopen this project?',
    effect: 'The project returns to active so work can continue. Your reason is recorded.',
    reasonLabel: 'Why is it being reopened?',
    reasonRequired: true,
    success: 'Project reopened',
  },
  archive: {
    button: 'Archive',
    title: 'Archive this project?',
    effect:
      'It disappears from active work and its details become read-only. Revisions, approvals and released documents are kept. You can restore it later.',
    reasonLabel: 'Reason (optional)',
    success: 'Project archived',
    variant: 'outline',
  },
  restore: {
    button: 'Restore',
    title: 'Restore this project?',
    effect: 'The project becomes active again and returns to active work.',
    success: 'Project restored',
  },
  delete: {
    button: 'Delete',
    title: 'Delete this project?',
    effect:
      'The project disappears from every list. Its history stays on record as required for audit and approvals; it is not erased immediately.',
    success: 'Project deleted',
    variant: 'destructive',
  },
};

/** Lifecycle buttons for what is valid in the current state and allowed for the caller. */
export function LifecycleActions({ project }: { project: Project }) {
  const { active, can } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const actions = allowedActions(project.status).filter((a) =>
    can(LIFECYCLE_TRANSITIONS[a].permission),
  );
  const close = () => {
    setPending(null);
    setReason('');
    setAcknowledged(false);
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).project(project.id) });
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.org(active.id).all, 'projects'],
    });
  };

  const dependents = useQuery({
    queryKey: [...queryKeys.org(active.id).project(project.id), 'dependents'],
    queryFn: ({ signal }) => projectsApi.dependents(active.id, project.id, signal),
    enabled: pending === 'delete',
    staleTime: 0,
  });

  const run = useMutation({
    mutationFn: async (action: LifecycleAction) => {
      if (action === 'delete')
        return projectsApi.remove(active.id, project.id, acknowledged || !dependents.data?.total);
      return projectsApi.transition(active.id, project.id, action, reason.trim() || undefined);
    },
    onSuccess: async (_data, action) => {
      toast.success(TEXT[action].success);
      close();
      await refresh();
      if (action === 'delete') router.replace('/projects');
    },
  });
  const duplicate = useMutation({
    mutationFn: () => projectsApi.duplicate(active.id, project.id),
    onSuccess: async (copy) => {
      toast.success(`Created ${copy.displayId} (copy)`);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(active.id).all, 'projects'],
      });
      router.push(`/projects/${copy.id}`);
    },
  });

  const text = pending ? TEXT[pending] : null;
  const needsAck = pending === 'delete' && (dependents.data?.total ?? 0) > 0;
  const blocked =
    run.isPending ||
    (text?.reasonRequired && !reason.trim()) ||
    (pending === 'delete' && (dependents.isPending || (needsAck && !acknowledged)));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {can('project.create') ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={duplicate.isPending}
            onClick={() => duplicate.mutate()}
          >
            <CopyIcon /> Duplicate
          </Button>
        ) : null}
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={TEXT[a].variant ?? 'default'}
            onClick={() => setPending(a)}
          >
            {TEXT[a].button}
          </Button>
        ))}
      </div>
      <Dialog open={pending !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {text ? (
            <>
              <DialogHeader>
                <DialogTitle>{text.title}</DialogTitle>
                <DialogDescription>{text.effect}</DialogDescription>
              </DialogHeader>
              {pending === 'delete' ? (
                dependents.isPending ? (
                  <LoadingState label="Checking what depends on this project…" />
                ) : needsAck ? (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3 text-[13px]">
                    <p className="font-medium">This project has dependent items:</p>
                    <ul className="list-disc pl-5">
                      {dependents.data?.items.map((d) => (
                        <li key={d.type}>
                          {d.label}: {d.count}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      I understand and want to delete it anyway
                    </label>
                  </div>
                ) : null
              ) : null}
              {text.reasonLabel ? (
                <FormField label={text.reasonLabel}>
                  <Input
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </FormField>
              ) : null}
              <DialogFooter>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant={text.variant === 'destructive' ? 'destructive' : 'default'}
                  disabled={Boolean(blocked)}
                  onClick={() => pending && run.mutate(pending)}
                >
                  {text.button}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
