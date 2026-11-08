'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileTextIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { studioApi } from '@/features/studio/api';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { useRevisionsApi } from '../revisions/use-revisions';
import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

const rev = (n: number | undefined) => (n ? `R${String(n).padStart(3, '0')}` : '—');

/**
 * "Generate tech pack" (Component 3, ADR-056): documents the latest committed revision — never the
 * draft, and the generator never changes the design. With uncommitted changes the user can commit
 * them as a new revision in the same step (ADR-060: patterns finished → tech pack), or generate
 * for the previous revision.
 */
export function TechPackButton() {
  const { can } = useOrganization();
  const [open, setOpen] = useState(false);
  const patternFirst = useEditor((s) => !!s.display.patternSpec);
  if (!can('design.generate')) return null;
  return (
    <>
      <Button
        size="sm"
        variant={patternFirst ? 'default' : 'outline'}
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        data-testid="techpack-button"
      >
        <FileTextIcon aria-hidden /> {patternFirst ? 'Create tech pack' : 'Tech pack'}
      </Button>
      {open ? <TechPackDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TechPackDialog({ onClose }: { onClose: () => void }) {
  const { active } = useOrganization();
  const router = useRouter();
  const store = useEditorStore();
  const designId = useEditor((s) => s.meta.design.id);
  const head = useEditor((s) => s.meta.headRevision);
  const uncommitted = useEditor((s) => s.server.hasUncommittedChanges || selectHasUnsavedWork(s));
  const canEdit = useEditor((s) => s.meta.capabilities.canEdit);
  const revisions = useRevisionsApi();
  const queryClient = useQueryClient();
  const [commitFirst, setCommitFirst] = useState(true);
  const [commitKey] = useState(() => globalThis.crypto.randomUUID());
  const willCommit = uncommitted && canEdit && commitFirst;
  const [modelImages, setModelImages] = useState(true);
  const [presentation, setPresentation] = useState({
    model: 'female' as 'female' | 'male' | 'child' | 'none',
    pose: 'standing_front' as 'standing_front' | 'three_quarter' | 'walking',
    background: 'studio_white' as 'studio_white' | 'light_grey' | 'lifestyle',
    view: 'front' as 'front' | 'back',
  });
  const [provider, setProvider] = useState('');
  const key = useRef(newIdempotencyKey());

  const status = useQuery({
    queryKey: queryKeys.org(active.id).aiStatus(),
    queryFn: ({ signal }) => studioApi.aiStatus(active.id, signal),
  });
  const previous = useQuery({
    queryKey: queryKeys.org(active.id).techPacks(designId),
    queryFn: ({ signal }) => studioApi.techPacks(active.id, designId, signal),
  });
  const chosen = provider || status.data?.defaultProvider || '';
  const configured = (status.data?.providers ?? []).filter((p) => p.configured);

  const generate = useMutation({
    mutationFn: async () => {
      await store.getState().flush();
      if (willCommit && store.getState().server.hasUncommittedChanges) {
        try {
          await revisions.commit(
            {
              expectedVersion: store.getState().server.version,
              summary: 'Patterns finalized for the tech pack',
              allowNoChanges: false,
            },
            commitKey,
          );
        } catch (e) {
          if (toApiError(e).code !== 'NO_CHANGES') throw e;
        }
        await store.getState().reloadFromServer();
        await queryClient.invalidateQueries({
          queryKey: queryKeys.org(active.id).revisions(designId),
        });
      }
      return studioApi.createTechPack(
        active.id,
        designId,
        {
          modelImages,
          presentation,
          ...(chosen ? { provider: chosen as 'gemini' | 'openai' | 'fake' } : {}),
        },
        key.current,
      );
    },
    onSuccess: (tp) => router.push(`/techpacks/${tp.id}`),
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate tech pack</DialogTitle>
          <DialogDescription>
            Documents revision{' '}
            {rev(willCommit ? (head?.revisionNumber ?? 0) + 1 : head?.revisionNumber)} exactly as
            committed: views, components, flat patterns, bill of materials, measurements and
            construction. Anything missing is listed — never invented.
          </DialogDescription>
        </DialogHeader>
        {uncommitted ? (
          <div
            className="flex flex-col gap-2 rounded-md border border-status-needs-review/50 p-2 text-[13px]"
            data-testid="techpack-uncommitted"
          >
            <p>Your latest changes are not in a revision yet.</p>
            {canEdit ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={commitFirst}
                  onChange={(e) => setCommitFirst(e.target.checked)}
                  data-testid="techpack-commit-first"
                />
                Commit them as revision {rev((head?.revisionNumber ?? 0) + 1)} and document that
              </label>
            ) : (
              <p className="text-muted-foreground">
                The tech pack will document {rev(head?.revisionNumber)} without them.
              </p>
            )}
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tp-provider">AI provider</Label>
            <SimpleSelect
              id="tp-provider"
              value={chosen}
              onValueChange={setProvider}
              options={configured.map((p) => ({
                value: p.name,
                label:
                  p.name === 'fake'
                    ? 'Demo (offline, no real AI)'
                    : `${p.name} · ${p.models.image}`,
              }))}
            />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={modelImages}
              onChange={(e) => setModelImages(e.target.checked)}
            />
            Include mannequin and model images (2 more AI images)
          </label>
          {modelImages ? (
            <div className="grid grid-cols-2 gap-2" data-testid="presentation-presets">
              <Preset
                label="Model"
                value={presentation.model}
                options={[
                  ['female', 'Female'],
                  ['male', 'Male'],
                  ['child', 'Child'],
                  ['none', 'Ghost mannequin'],
                ]}
                onChange={(v) => setPresentation((p) => ({ ...p, model: v as typeof p.model }))}
              />
              <Preset
                label="Pose"
                value={presentation.pose}
                options={[
                  ['standing_front', 'Standing, facing'],
                  ['three_quarter', 'Three-quarter'],
                  ['walking', 'Walking'],
                ]}
                onChange={(v) => setPresentation((p) => ({ ...p, pose: v as typeof p.pose }))}
              />
              <Preset
                label="Background"
                value={presentation.background}
                options={[
                  ['studio_white', 'Studio white'],
                  ['light_grey', 'Light grey'],
                  ['lifestyle', 'Lifestyle'],
                ]}
                onChange={(v) =>
                  setPresentation((p) => ({ ...p, background: v as typeof p.background }))
                }
              />
              <Preset
                label="View"
                value={presentation.view}
                options={[
                  ['front', 'Front'],
                  ['back', 'Back'],
                ]}
                onChange={(v) => setPresentation((p) => ({ ...p, view: v as typeof p.view }))}
              />
            </div>
          ) : null}
          {previous.data?.items.length ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Earlier tech packs
              </span>
              <ul className="flex flex-col gap-0.5">
                {previous.data.items.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <Link href={`/techpacks/${t.id}`} className="hover:underline">
                      {t.displayId} · {t.revisionLabel}
                    </Link>
                    <span className="text-muted-foreground">{t.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {generate.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {generate.error.message}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => generate.mutate()}
            disabled={(!head && !willCommit) || !chosen || generate.isPending}
            data-testid="generate-techpack"
          >
            {generate.isPending
              ? 'Starting…'
              : willCommit
                ? `Commit ${rev((head?.revisionNumber ?? 0) + 1)} and generate`
                : `Generate for ${rev(head?.revisionNumber)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Preset({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[12px]">{label}</Label>
      <SimpleSelect
        aria-label={label}
        value={value}
        onValueChange={onChange}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
      />
    </div>
  );
}
