'use client';

import type { ArtifactDetail } from '@ai-designer/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorState, LoadingState } from '@/components/states/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';

import { libraryApi } from './api';
import { ArtifactPreview } from './artifact-card';
import { ArtifactFormDialog } from './artifact-form';
import {
  CAPABILITY_LABELS,
  CATEGORY_LABELS,
  human,
  SCOPE_LABELS,
  VALIDATION_LABELS,
} from './labels';

interface PV {
  value: unknown;
  unit?: string | null;
  status: string;
}

function Properties({
  title,
  props,
  empty,
}: {
  title: string;
  props: Record<string, unknown>;
  empty: string;
}) {
  const entries = Object.entries(props) as [string, PV][];
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-[12px] font-medium uppercase text-muted-foreground">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="text-[13px]">
          {entries.map(([k, pv]) => (
            <li key={k} className="flex justify-between gap-2">
              <span>{human(k.split('.')[1] ?? k)}</span>
              <span>
                {pv.value === null ? '—' : `${String(pv.value)}${pv.unit ? ` ${pv.unit}` : ''}`}{' '}
                <span className="text-[11px] text-muted-foreground">
                  ({pv.status.replace('_', ' ')})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Artifact detail: preview, rules, visual vs physical properties, revisions, where used, actions. */
export function ArtifactDetailDrawer({
  artifactId,
  onClose,
}: {
  artifactId: string | null;
  onClose: () => void;
}) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const keys = queryKeys.org(active.id);
  const [revising, setRevising] = useState(false);
  const detail = useQuery({
    queryKey: keys.artifact(artifactId ?? ''),
    queryFn: ({ signal }) => libraryApi.get(active.id, artifactId!, signal),
    enabled: !!artifactId,
  });
  const used = useQuery({
    queryKey: keys.whereUsed(artifactId ?? ''),
    queryFn: ({ signal }) => libraryApi.whereUsed(active.id, artifactId!, signal),
    enabled: !!artifactId,
  });
  const refresh = async (a?: ArtifactDetail) => {
    if (a) queryClient.setQueryData(keys.artifact(a.id), a);
    await queryClient.invalidateQueries({ queryKey: [...keys.all, 'artifacts'] });
  };
  const act = useMutation({
    mutationFn: async (
      action: 'deactivate' | 'reactivate' | 'publish' | 'duplicate' | 'delete',
    ) => {
      const id = artifactId!;
      if (action === 'deactivate' || action === 'reactivate')
        return libraryApi.setActive(active.id, id, action === 'reactivate');
      if (action === 'publish') return libraryApi.publish(active.id, id);
      if (action === 'duplicate') return libraryApi.duplicate(active.id, id, 'user');
      await libraryApi.remove(active.id, id);
      return null;
    },
    onSuccess: async (a, action) => {
      const done = {
        deactivate: 'Deactivated',
        reactivate: 'Reactivated',
        publish: 'Shared with the organization',
        duplicate: 'Copied to your private library',
        delete: 'Deleted',
      }[action];
      toast.success(done);
      await refresh(a ?? undefined);
      if (action === 'delete' || action === 'duplicate') onClose();
    },
  });

  const a = detail.data;
  const own = a && a.ownerScope !== 'platform';
  const mayEdit = own && can('artifact.edit');
  return (
    <Sheet open={artifactId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {detail.isPending ? (
          <LoadingState />
        ) : detail.isError ? (
          <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
        ) : a ? (
          <div className="flex flex-col gap-4 p-1">
            <SheetHeader>
              <SheetTitle>{a.name}</SheetTitle>
              <SheetDescription>
                {a.displayId} · {CATEGORY_LABELS[a.category]} · R
                {String(a.currentRevisionNumber).padStart(3, '0')}
              </SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <ArtifactPreview url={a.previewUrl} label={a.name} />
              <div className="flex flex-col gap-2 text-[13px]">
                <span className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{SCOPE_LABELS[a.ownerScope]}</Badge>
                  {a.lifecycleStatus !== 'active' ? (
                    <Badge variant="outline">Deactivated</Badge>
                  ) : null}
                  {a.validationStatus ? (
                    <Badge variant="outline">{VALIDATION_LABELS[a.validationStatus]}</Badge>
                  ) : null}
                  {a.geometryCapability ? (
                    <Badge variant="outline">{CAPABILITY_LABELS[a.geometryCapability]}</Badge>
                  ) : null}
                </span>
                {a.description ? <p>{a.description}</p> : null}
                <p>
                  <span className="text-muted-foreground">Used on: </span>
                  {a.compatibleTargetTypes.map(human).join(', ')}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('artifact.create') ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => act.mutate('duplicate')}
                >
                  Copy to my library
                </Button>
              ) : null}
              {mayEdit && a.lifecycleStatus === 'active' ? (
                <Button size="sm" onClick={() => setRevising(true)}>
                  New revision
                </Button>
              ) : null}
              {a.ownerScope === 'user' && can('artifact.publish') ? (
                <Button size="sm" variant="outline" onClick={() => act.mutate('publish')}>
                  Share with organization
                </Button>
              ) : null}
              {mayEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act.mutate(a.lifecycleStatus === 'active' ? 'deactivate' : 'reactivate')
                  }
                >
                  {a.lifecycleStatus === 'active' ? 'Deactivate' : 'Reactivate'}
                </Button>
              ) : null}
              {mayEdit &&
              (a.ownerScope === 'user' || can('artifact.delete')) &&
              used.data &&
              used.data.items.length + used.data.draftCount === 0 ? (
                <Button size="sm" variant="destructive" onClick={() => act.mutate('delete')}>
                  Delete
                </Button>
              ) : null}
            </div>
            {a.revisions[0] ? (
              <div className="grid grid-cols-2 gap-4">
                <Properties
                  title="Visual"
                  props={a.revisions[0].properties.visual}
                  empty="No visual properties recorded."
                />
                <Properties
                  title="Physical / manufacturing"
                  props={a.revisions[0].properties.physical}
                  empty="Not specified — this is a design asset, not production data."
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <h3 className="text-[12px] font-medium uppercase text-muted-foreground">Revisions</h3>
              <ul className="text-[13px]" aria-label="Artifact revisions">
                {a.revisions.map((r) => (
                  <li key={r.id} data-testid="artifact-revision">
                    {r.displayId} · {new Date(r.createdAt).toLocaleDateString()}
                    {r.changeNote ? ` · ${r.changeNote}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-[12px] font-medium uppercase text-muted-foreground">
                Where used
              </h3>
              {used.data ? (
                used.data.items.length === 0 && used.data.draftCount === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    Not used by any design in this organization.
                  </p>
                ) : (
                  <ul className="text-[13px]">
                    {used.data.items.map((u) => (
                      <li key={u.revisionId}>
                        <Link className="hover:underline" href={`/designs/${u.designId}`}>
                          {u.designName}
                        </Link>{' '}
                        · {u.revisionDisplayId}
                      </li>
                    ))}
                    {used.data.draftCount ? (
                      <li>{used.data.draftCount} unsaved design draft(s)</li>
                    ) : null}
                  </ul>
                )
              ) : null}
            </div>
            <ArtifactFormDialog
              open={revising}
              onOpenChange={setRevising}
              revising={a}
              onSaved={(x) => void refresh(x)}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
