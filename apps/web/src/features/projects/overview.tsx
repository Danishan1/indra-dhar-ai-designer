'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, FileImageIcon, LayersIcon } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/shell/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { AccessTab } from './access-tab';
import { projectsApi } from './api';
import { LifecycleActions } from './lifecycle-actions';
import { MetadataForm } from './metadata-form';
import { ProjectStatusBadge } from './status-badge';

/** Project overview: lifecycle actions, details, access; designs and sources arrive later. */
export function ProjectOverview({ projectId }: { projectId: string }) {
  const { active, can } = useOrganization();
  const project = useQuery({
    queryKey: queryKeys.org(active.id).project(projectId),
    queryFn: ({ signal }) => projectsApi.get(active.id, projectId, signal),
  });

  if (project.isPending)
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  if (project.isError)
    return (
      <div className="flex flex-col gap-3 p-6">
        <Link href="/projects" className="flex items-center gap-1 text-[13px] hover:underline">
          <ArrowLeftIcon className="size-4" aria-hidden /> All projects
        </Link>
        <ErrorState
          error={project.error}
          title="We couldn’t open this project"
          onRetry={() => void project.refetch()}
        />
      </div>
    );

  const p = project.data;
  return (
    <div className="flex flex-col">
      <PageHeader
        title={p.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{p.displayId}</span>
            <ProjectStatusBadge status={p.status} />
            {p.visibility === 'restricted' ? <span>· Restricted</span> : null}
            {p.statusReason ? <span>· “{p.statusReason}”</span> : null}
            {p.duplicatedFromId ? (
              <Link href={`/projects/${p.duplicatedFromId}`} className="underline">
                · Copy of another project
              </Link>
            ) : null}
          </span>
        }
        actions={<LifecycleActions project={p} />}
      />
      <div className="p-6">
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="designs">Designs</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            {can('project.manage_access') ? <TabsTrigger value="access">Access</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="details" className="pt-4">
            <MetadataForm project={p} />
          </TabsContent>
          <TabsContent value="designs" className="pt-4">
            <EmptyState
              icon={<LayersIcon />}
              title="No designs yet"
              description="Designs, revisions and approvals arrive in iteration I12."
            />
          </TabsContent>
          <TabsContent value="sources" className="pt-4">
            <EmptyState
              icon={<FileImageIcon />}
              title="No sources yet"
              description="Sketches, photos and fabric images for this project arrive with source intake (I26). Files can already be uploaded on the Files page."
            />
          </TabsContent>
          {can('project.manage_access') ? (
            <TabsContent value="access" className="pt-4">
              <AccessTab project={p} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
