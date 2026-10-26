'use client';

import {
  ArtifactCategoryKeys,
  type ArtifactCategoryKey,
  type ArtifactDetail,
} from '@ai-designer/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
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
import { useUpload } from '@/features/assets/use-upload';
import { useOrganization } from '@/features/organizations/organization-provider';
import { ApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';

import { libraryApi, newIdempotencyKey } from './api';
import { CATEGORY_LABELS } from './labels';

const list = (text: string) =>
  text
    .split(',')
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_'),
    )
    .filter(Boolean);
const join = (items: unknown) => (Array.isArray(items) ? items.join(', ') : '');

const MODES = [
  { value: 'attach', label: 'Attach as a part' },
  { value: 'follow_boundary', label: 'Follow an edge (lace, trims)' },
  { value: 'fixed_position', label: 'Fixed position (motifs, buttons)' },
  { value: 'tiled_fill', label: 'Fill (fabrics)' },
];

/** Create an artifact, or add a revision to one (revisions are immutable; designs keep theirs). */
export function ArtifactFormDialog({
  open,
  onOpenChange,
  revising,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog adds a new revision to this artifact. */
  revising?: ArtifactDetail;
  onSaved?: (artifact: ArtifactDetail) => void;
}) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const current = revising?.revisions[0];
  const def = (current?.definition ?? {}) as Record<string, unknown>;
  const [category, setCategory] = useState<ArtifactCategoryKey>('lace');
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'user' | 'organization'>('user');
  const [targets, setTargets] = useState('');
  const [allowed, setAllowed] = useState('');
  const [preferred, setPreferred] = useState('');
  const [repeatable, setRepeatable] = useState(false);
  const [mode, setMode] = useState('attach');
  const [note, setNote] = useState('');
  const [previewAssetId, setPreviewAssetId] = useState<string | null | undefined>(undefined);
  const [problems, setProblems] = useState<string[]>([]);
  const key = useRef(newIdempotencyKey());
  const upload = useUpload(active.id, {
    assetType: 'artwork',
    onSettled: (asset) => {
      if (asset.status === 'ready') setPreviewAssetId(asset.id);
    },
  });

  useEffect(() => {
    if (!open) return;
    setProblems([]);
    setNote('');
    setPreviewAssetId(undefined);
    setTargets(join(def.compatibleTargetTypes) || 'sleeve, hem');
    setAllowed(join(def.allowedPlacementRegions));
    setPreferred(join(def.preferredPlacementRegions));
    setRepeatable(Boolean(def.repeatable));
    setMode(
      (Array.isArray(def.placementModes) ? (def.placementModes[0] as string) : null) ?? 'attach',
    );
    if (!revising) {
      setName('');
      setScope('user');
    }
  }, [open]);

  const definition = () => ({
    ...def,
    compatibleTargetTypes: list(targets),
    allowedPlacementRegions: list(allowed).length ? list(allowed) : null,
    preferredPlacementRegions: list(preferred),
    repeatable,
    placementModes: [mode],
  });

  const save = useMutation({
    meta: { silent: true },
    mutationFn: () =>
      revising
        ? libraryApi.revise(active.id, revising.id, {
            expectedCurrentRevisionId: revising.currentRevisionId!,
            definition: definition(),
            ...(previewAssetId !== undefined ? { previewAssetId } : {}),
            ...(note.trim() ? { changeNote: note.trim() } : {}),
          })
        : libraryApi.create(
            active.id,
            {
              category,
              name,
              scope,
              definition: definition(),
              ...(previewAssetId ? { previewAssetId } : {}),
            },
            key.current,
          ),
    onSuccess: async (artifact) => {
      key.current = newIdempotencyKey();
      toast.success(
        revising
          ? `Saved ${artifact.displayId}-R${String(artifact.currentRevisionNumber).padStart(3, '0')}`
          : `Created ${artifact.displayId}`,
      );
      onOpenChange(false);
      onSaved?.(artifact);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(active.id).all, 'artifacts'],
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).artifact(artifact.id),
      });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_BLOCKED') {
        setProblems(
          ((e.details?.findings as { message: string }[] | undefined) ?? []).map((f) => f.message),
        );
        return;
      }
      toast.error(e instanceof ApiError ? e.message : 'Could not save the artifact');
    },
  });
  const uploading = upload.items.some(
    (i) => i.phase === 'starting' || i.phase === 'uploading' || i.phase === 'processing',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {revising ? `New revision of ${revising.name}` : 'New artifact'}
          </DialogTitle>
          <DialogDescription>
            {revising
              ? 'Saving creates a new revision. Designs that use an earlier revision keep it until someone updates them.'
              : 'A reusable part, material or trim. Physical facts (fibre, weight, size) can be added later with their evidence.'}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!revising ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Name">
                <Input
                  autoFocus
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>
              <FormField label="Category">
                <SimpleSelect
                  aria-label="Category"
                  value={category}
                  onValueChange={(v) => setCategory(v as ArtifactCategoryKey)}
                  options={ArtifactCategoryKeys.map((c) => ({
                    value: c,
                    label: CATEGORY_LABELS[c],
                  }))}
                />
              </FormField>
              <FormField label="Who can see it">
                <SimpleSelect
                  aria-label="Who can see it"
                  value={scope}
                  onValueChange={(v) => setScope(v as 'user' | 'organization')}
                  options={[
                    { value: 'user', label: 'Only me (private)' },
                    ...(can('artifact.publish')
                      ? [{ value: 'organization', label: 'Everyone in the organization' }]
                      : []),
                  ]}
                />
              </FormField>
            </div>
          ) : null}
          <FormField
            label="Can be used on"
            hint="Component types, separated by commas (e.g. sleeve, hem)"
          >
            <Input value={targets} onChange={(e) => setTargets(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Allowed regions" hint="Empty = anywhere">
              <Input value={allowed} onChange={(e) => setAllowed(e.target.value)} />
            </FormField>
            <FormField label="Preferred regions">
              <Input value={preferred} onChange={(e) => setPreferred(e.target.value)} />
            </FormField>
            <FormField label="How it is placed">
              <SimpleSelect
                aria-label="How it is placed"
                value={mode}
                onValueChange={setMode}
                options={MODES}
              />
            </FormField>
            <label className="flex items-center gap-2 self-end pb-1 text-[13px]">
              <input
                type="checkbox"
                checked={repeatable}
                onChange={(e) => setRepeatable(e.target.checked)}
              />
              Can be used more than once on a part
            </label>
          </div>
          <FormField label="Preview image (optional)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Preview image"
              className="text-[13px]"
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) void upload.upload(files);
              }}
            />
          </FormField>
          {upload.items[0] ? (
            <p className="text-[12px] text-muted-foreground" data-testid="preview-upload-status">
              {upload.items[0].fileName}:{' '}
              {upload.items[0].phase === 'ready' ? 'Ready' : (upload.items[0].error ?? 'Checking…')}
            </p>
          ) : null}
          {revising ? (
            <FormField label="What changed">
              <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </FormField>
          ) : null}
          {problems.length ? (
            <ul role="alert" className="list-disc pl-5 text-[12px] text-destructive">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={save.isPending || uploading || (!revising && !name.trim())}
            >
              {revising ? 'Save revision' : 'Create artifact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
