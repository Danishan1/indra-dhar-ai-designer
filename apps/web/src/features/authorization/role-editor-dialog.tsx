'use client';

import type { Member, OrgRoleKey } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { orgsApi } from '@/features/organizations/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

/** Edit a member's roles. Only roles the caller can delegate are editable (server re-checks). */
export function RoleEditorDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Member;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<OrgRoleKey[]>(member.roles);
  const roles = useQuery({
    queryKey: queryKeys.org(active.id).roles(),
    queryFn: ({ signal }) => orgsApi.roles(active.id, signal),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () => orgsApi.updateMemberRoles(active.id, member.membershipId, selected),
    onSuccess: async (updated) => {
      toast.success(`Roles updated for ${updated.displayName}`);
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).members() });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).effectivePermissions(member.membershipId),
      });
    },
  });
  const toggle = (key: OrgRoleKey) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  const unchanged =
    selected.length === member.roles.length && selected.every((r) => member.roles.includes(r));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setSelected(member.roles);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roles of {member.displayName}</DialogTitle>
          <DialogDescription>
            A member can hold several roles; permissions add up. You can only give or remove roles
            whose permissions you hold yourself. Ownership changes only by transfer.
          </DialogDescription>
        </DialogHeader>
        {roles.isPending ? (
          <LoadingState />
        ) : roles.isError ? (
          <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />
        ) : (
          <fieldset className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto" aria-label="Roles">
            {roles.data.items.map((role) => {
              const locked = !role.assignable || !role.delegableByMe;
              const id = `role-${role.key}`;
              return (
                <label
                  key={role.key}
                  htmlFor={id}
                  className="flex items-start gap-2 rounded-md p-2 hover:bg-accent data-[locked=true]:opacity-60"
                  data-locked={locked}
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={selected.includes(role.key)}
                    disabled={locked}
                    onChange={() => toggle(role.key)}
                  />
                  <span className="flex flex-col">
                    <span className="flex items-center gap-1 text-[13px] font-medium">
                      {role.name}
                      {locked ? (
                        <LockIcon className="size-3" aria-label="Not editable by you" />
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{role.description}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending || unchanged || selected.length === 0}
            onClick={() => save.mutate()}
          >
            Save roles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
