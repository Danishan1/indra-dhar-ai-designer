'use client';

import type { Project } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormField } from '@/components/forms/form-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { orgsApi } from '@/features/organizations/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { projectsApi } from './api';

const LEVELS = [
  { value: 'view', label: 'View only' },
  { value: 'edit', label: 'View and edit' },
];

/** Who can see this project: whole organization, or only people with explicit access. */
export function AccessTab({ project }: { project: Project }) {
  const { active } = useOrganization();
  const queryClient = useQueryClient();
  const restricted = project.visibility === 'restricted';
  const [member, setMember] = useState('');
  const [level, setLevel] = useState('view');

  const keys = [...queryKeys.org(active.id).project(project.id), 'grants'];
  const grants = useQuery({
    queryKey: keys,
    queryFn: ({ signal }) => projectsApi.grants(active.id, project.id, signal),
  });
  const members = useQuery({
    queryKey: queryKeys.org(active.id).members(),
    queryFn: ({ signal }) => orgsApi.members(active.id, signal),
  });
  const refreshProject = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.org(active.id).project(project.id) });

  const setVisibility = useMutation({
    mutationFn: (visibility: 'organization' | 'restricted') =>
      projectsApi.setVisibility(active.id, project.id, {
        expectedVersion: project.version,
        visibility,
      }),
    onSuccess: async (p) => {
      toast.success(
        p.visibility === 'restricted'
          ? 'Only people with access can see this project'
          : 'Everyone in the organization can see this project',
      );
      await refreshProject();
    },
  });
  const grant = useMutation({
    mutationFn: () =>
      projectsApi.grant(active.id, project.id, {
        userId: member,
        actions: level === 'edit' ? ['project.view', 'project.edit'] : ['project.view'],
      }),
    onSuccess: async () => {
      toast.success('Access given');
      setMember('');
      await queryClient.invalidateQueries({ queryKey: keys });
    },
  });
  const revoke = useMutation({
    mutationFn: (userId: string) => projectsApi.revokeGrant(active.id, project.id, userId),
    onSuccess: async () => {
      toast.success('Access removed');
      await queryClient.invalidateQueries({ queryKey: keys });
    },
  });

  const granted = new Set(grants.data?.items.map((g) => g.userId));
  const candidates = (members.data?.items ?? []).filter(
    (m) => m.status === 'active' && !granted.has(m.userId),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border p-4">
        <div className="flex items-start gap-3">
          {restricted ? (
            <LockIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          ) : (
            <UsersIcon className="mt-0.5 size-5 text-muted-foreground" aria-hidden />
          )}
          <div className="flex-1">
            <h2 className="text-sm font-semibold">
              {restricted ? 'Restricted' : 'Everyone in the organization'}
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {restricted
                ? 'Only people you give access to below, and those who manage project access, can see this project.'
                : 'Everyone whose role allows viewing projects can see this project.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={setVisibility.isPending}
            onClick={() => setVisibility.mutate(restricted ? 'organization' : 'restricted')}
          >
            {restricted ? 'Open to organization' : 'Restrict access'}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="grants-heading">
        <h2 id="grants-heading" className="text-sm font-semibold">
          People with explicit access
        </h2>
        {grants.isPending ? (
          <LoadingState />
        ) : grants.isError ? (
          <ErrorState error={grants.error} onRetry={() => void grants.refetch()} />
        ) : grants.data.items.length === 0 ? (
          <EmptyState
            title="No one has been given access yet"
            description={
              restricted
                ? 'Add people below so they can see this project.'
                : 'Explicit access matters once the project is restricted.'
            }
          />
        ) : (
          <Table aria-label="Access">
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.data.items.map((g) => (
                <TableRow key={g.id} data-testid={`grant-${g.email}`}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{g.displayName}</span>
                      <span className="text-xs text-muted-foreground">{g.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {g.actions.includes('project.edit') ? 'View and edit' : 'View only'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revoke.isPending}
                      aria-label={`Remove access for ${g.displayName}`}
                      onClick={() => revoke.mutate(g.userId)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <FormField label="Person" className="min-w-56 flex-1">
            <SimpleSelect
              value={member}
              onValueChange={setMember}
              placeholder={candidates.length ? 'Choose a member…' : 'No other active members'}
              disabled={!candidates.length}
              options={candidates.map((m) => ({
                value: m.userId,
                label: m.displayName,
                description: m.email,
              }))}
            />
          </FormField>
          <FormField label="Access" className="w-44">
            <SimpleSelect value={level} onValueChange={setLevel} options={LEVELS} />
          </FormField>
          <Button size="sm" disabled={!member || grant.isPending} onClick={() => grant.mutate()}>
            Give access
          </Button>
        </div>
      </section>
    </div>
  );
}
