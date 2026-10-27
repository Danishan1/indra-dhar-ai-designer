'use client';

import { isEditable, type ProjectStatus } from '@ai-designer/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, CopyIcon, PenToolIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrganization } from '@/features/organizations/organization-provider';
import { projectsApi } from '@/features/projects/api';
import { queryKeys } from '@/lib/query/keys';

import { designsApi } from './api';
import { DesignHistory } from './design-history';
import { categoryLabel } from './designs-tab';
import { WorkingCopyPanel } from './working-copy-panel';

/** Design detail (temporary developer view until the editor in I15–I19). */
export function DesignPage({ designId }: { designId: string }) {
  const { active, can } = useOrganization();
  const router = useRouter();
  const keys = queryKeys.org(active.id);
  const design = useQuery({
    queryKey: keys.design(designId),
    queryFn: ({ signal }) => designsApi.get(active.id, designId, signal),
  });
  const workingCopy = useQuery({
    queryKey: keys.workingCopy(designId),
    queryFn: ({ signal }) => designsApi.workingCopy(active.id, designId, signal),
  });
  const projectId = design.data?.projectId;
  const project = useQuery({
    queryKey: keys.project(projectId ?? ''),
    queryFn: ({ signal }) => projectsApi.get(active.id, projectId!, signal),
    enabled: !!projectId,
  });
  const duplicate = useMutation({
    mutationFn: () => designsApi.duplicate(active.id, designId),
    onSuccess: (copy) => {
      toast.success(`Created ${copy.displayId}`);
      router.push(`/designs/${copy.id}`);
    },
  });

  if (design.isPending || workingCopy.isPending)
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  if (design.isError || workingCopy.isError)
    return (
      <div className="p-6">
        <ErrorState
          error={design.error ?? workingCopy.error}
          title="We couldn’t open this design"
          onRetry={() => {
            void design.refetch();
            void workingCopy.refetch();
          }}
        />
      </div>
    );

  const d = design.data;
  const readOnly = project.data ? !isEditable(project.data.status as ProjectStatus) : false;
  return (
    <div className="flex flex-col">
      <PageHeader
        title={d.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${d.projectId}`}
              className="flex items-center gap-1 hover:underline"
            >
              <ArrowLeftIcon className="size-3.5" aria-hidden />
              {project.data?.name ?? 'Project'}
            </Link>
            <span>· {d.displayId}</span>
            <span>· {categoryLabel(d.garmentCategory)}</span>
            <span>· R{String(d.headRevisionNumber).padStart(3, '0')}</span>
            <span>· {d.status === 'DRAFT' ? 'Draft' : d.status}</span>
          </span>
        }
        actions={
          <>
            {can('design.create') && !readOnly ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate()}
              >
                <CopyIcon /> Duplicate
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href={`/projects/${d.projectId}/designs/${d.id}`}>
                <PenToolIcon /> Open editor
              </Link>
            </Button>
          </>
        }
      />
      <div className="p-6">
        <Tabs defaultValue="draft">
          <TabsList>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="draft" className="pt-4">
            <WorkingCopyPanel design={d} workingCopy={workingCopy.data} readOnly={readOnly} />
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <DesignHistory design={d} workingCopy={workingCopy.data} readOnly={readOnly} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
