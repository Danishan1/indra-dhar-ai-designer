'use client';

import {
  createInvitationRequestSchema,
  type CreateInvitationRequest,
  type Member,
  OrgRoleLabels,
} from '@ai-designer/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontalIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { FormField } from '@/components/forms/form-field';
import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/features/auth/session-provider';
import { EffectivePermissionsSheet } from '@/features/authorization/effective-permissions-sheet';
import { RoleEditorDialog } from '@/features/authorization/role-editor-dialog';
import { queryKeys } from '@/lib/query/keys';

import { orgsApi } from './api';
import { useOrganization } from './organization-provider';
import { MembershipStatusBadge, RoleBadges } from './status-badges';

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const roles = useQuery({
    queryKey: queryKeys.org(active.id).roles(),
    queryFn: ({ signal }) => orgsApi.roles(active.id, signal),
    enabled: open,
  });
  const invitable = (roles.data?.items ?? []).filter((r) => r.assignable && r.delegableByMe);
  const form = useForm<
    CreateInvitationRequest,
    unknown,
    z.output<typeof createInvitationRequestSchema>
  >({
    resolver: zodResolver(createInvitationRequestSchema),
    defaultValues: { email: '', role: 'designer' },
  });
  const invite = useMutation({
    mutationFn: (values: z.output<typeof createInvitationRequestSchema>) =>
      orgsApi.invite(active.id, values),
    onSuccess: async (inv) => {
      toast.success(`Invitation sent to ${inv.email}`);
      form.reset();
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).invitations() });
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {active.name}</DialogTitle>
          <DialogDescription>
            They get an email with a link that is valid for 7 days. Only that email address can
            accept it.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((v) => invite.mutate(v))}
        >
          <FormField label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoFocus {...form.register('email')} />
          </FormField>
          <FormField label="Role" error={form.formState.errors.role?.message}>
            <SimpleSelect
              value={form.watch('role')}
              onValueChange={(v) =>
                form.setValue('role', v as CreateInvitationRequest['role'], {
                  shouldValidate: true,
                })
              }
              options={
                invitable.length
                  ? invitable.map((r) => ({
                      value: r.key,
                      label: r.name,
                      description: r.description,
                    }))
                  : [{ value: 'designer', label: OrgRoleLabels.designer }]
              }
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberActions({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const [editingRoles, setEditingRoles] = useState(false);
  const [viewingPermissions, setViewingPermissions] = useState(false);
  const manage = can('members.manage') && !isSelf;
  const editRoles = can('members.manage_roles') && member.status !== 'revoked';
  const action = useMutation({
    mutationFn: (kind: 'suspend' | 'reactivate' | 'revoke') =>
      orgsApi.memberAction(active.id, member.membershipId, kind),
    onSuccess: async (updated) => {
      toast.success(
        `${updated.displayName}: ${updated.status === 'revoked' ? 'removed from the organization' : updated.status}`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).members() });
    },
  });
  if (member.status === 'revoked') return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.displayName}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setViewingPermissions(true)}>
            View permissions
          </DropdownMenuItem>
          {editRoles ? (
            <DropdownMenuItem onSelect={() => setEditingRoles(true)}>Edit roles</DropdownMenuItem>
          ) : null}
          {manage && member.status === 'active' ? (
            <DropdownMenuItem onSelect={() => action.mutate('suspend')}>Suspend</DropdownMenuItem>
          ) : null}
          {manage && member.status === 'suspended' ? (
            <DropdownMenuItem onSelect={() => action.mutate('reactivate')}>
              Reactivate
            </DropdownMenuItem>
          ) : null}
          {manage ? (
            <DropdownMenuItem variant="destructive" onSelect={() => action.mutate('revoke')}>
              Remove from organization
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {editRoles ? (
        <RoleEditorDialog member={member} open={editingRoles} onOpenChange={setEditingRoles} />
      ) : null}
      <EffectivePermissionsSheet
        member={member}
        open={viewingPermissions}
        onOpenChange={setViewingPermissions}
      />
    </>
  );
}

function MembersTable() {
  const { active } = useOrganization();
  const { user } = useSession();
  const members = useQuery({
    queryKey: queryKeys.org(active.id).members(),
    queryFn: ({ signal }) => orgsApi.members(active.id, signal),
  });
  if (members.isPending) return <LoadingState />;
  if (members.isError)
    return <ErrorState error={members.error} onRetry={() => void members.refetch()} />;
  const current = members.data.items.filter((m) => m.status !== 'revoked');
  const former = members.data.items.filter((m) => m.status === 'revoked');
  const rows = (list: Member[]) =>
    list.map((m) => (
      <TableRow key={m.membershipId} data-testid={`member-${m.email}`}>
        <TableCell>
          <div className="flex flex-col">
            <span className="font-medium">
              {m.displayName}
              {m.userId === user?.id ? (
                <span className="ml-1 text-xs text-muted-foreground">(you)</span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{m.email}</span>
          </div>
        </TableCell>
        <TableCell>
          <RoleBadges roles={m.roles} />
        </TableCell>
        <TableCell>
          <MembershipStatusBadge status={m.status} />
        </TableCell>
        <TableCell className="text-muted-foreground">
          {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
        </TableCell>
        <TableCell className="w-10 text-right">
          <MemberActions member={m} isSelf={m.userId === user?.id} />
        </TableCell>
      </TableRow>
    ));
  return (
    <div className="flex flex-col gap-6">
      <Table aria-label="Members">
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{rows(current)}</TableBody>
      </Table>
      {former.length ? (
        <section>
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">
            Former members (kept for audit)
          </h2>
          <Table aria-label="Former members">
            <TableBody>{rows(former)}</TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function InvitationsTable() {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const invitations = useQuery({
    queryKey: queryKeys.org(active.id).invitations(),
    queryFn: ({ signal }) => orgsApi.invitations(active.id, signal),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).invitations() });
  const resend = useMutation({
    mutationFn: (id: string) => orgsApi.resendInvitation(active.id, id),
    onSuccess: async (inv) => {
      toast.success(`New link sent to ${inv.email}`);
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => orgsApi.cancelInvitation(active.id, id),
    onSuccess: async () => {
      toast.success('Invitation cancelled');
      await refresh();
    },
  });
  if (invitations.isPending) return <LoadingState />;
  if (invitations.isError)
    return <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />;
  if (!invitations.data.items.length)
    return (
      <EmptyState
        title="No pending invitations"
        description="Invite colleagues with the button above."
      />
    );
  return (
    <Table aria-label="Pending invitations">
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="sr-only">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.data.items.map((inv) => (
          <TableRow key={inv.id} data-testid={`invitation-${inv.email}`}>
            <TableCell>
              <div className="flex flex-col">
                <span>{inv.email}</span>
                <span className="text-xs text-muted-foreground">
                  Invited by {inv.invitedBy.displayName}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <RoleBadges roles={inv.roles} />
            </TableCell>
            <TableCell>
              <MembershipStatusBadge status={inv.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {new Date(inv.expiresAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resend.isPending}
                  onClick={() => resend.mutate(inv.id)}
                >
                  Resend
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(inv.id)}
                >
                  Cancel
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MembersPage() {
  const { active, can } = useOrganization();
  const [inviting, setInviting] = useState(false);
  const canManage = can('members.invite');
  if (!can('members.view')) {
    return (
      <>
        <PageHeader title="Members" description={`People with access to ${active.name}.`} />
        <div className="p-6">
          <EmptyState
            title="You can't see the member list"
            description="Your roles in this organization don't include viewing members. Ask an admin if you need it."
          />
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Members"
        description={`People with access to ${active.name}.`}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlusIcon aria-hidden /> Invite
            </Button>
          ) : null
        }
      />
      <div className="p-6">
        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            {canManage ? <TabsTrigger value="invitations">Invitations</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="members" className="pt-2">
            <MembersTable />
          </TabsContent>
          {canManage ? (
            <TabsContent value="invitations" className="pt-2">
              <InvitationsTable />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
      {canManage ? <InviteDialog open={inviting} onOpenChange={setInviting} /> : null}
    </>
  );
}
