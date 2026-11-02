'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
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
import { queryKeys } from '@/lib/query/keys';

import { selectHasUnsavedWork } from '../store';
import { useEditor, useEditorStore } from '../store-context';

const rev = (n: number | undefined) => (n ? `R${String(n).padStart(3, '0')}` : '—');

/**
 * "Generate tech pack" (Component 3, ADR-056): documents the latest committed revision — never the
 * draft, and the generator never changes the design. Uncommitted changes are pointed out first.
 */
export function TechPackButton() {
  const { can } = useOrganization();
  const [open, setOpen] = useState(false);
  if (!can('design.generate')) return null;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        data-testid="techpack-button"
      >
        <FileTextIcon aria-hidden /> Tech pack
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
            Documents revision {rev(head?.revisionNumber)} exactly as committed: views, components,
            flat patterns, bill of materials, measurements and construction. Anything missing is
            listed — never invented.
          </DialogDescription>
        </DialogHeader>
        {uncommitted ? (
          <p
            className="rounded-md border border-status-needs-review/50 p-2 text-[13px]"
            data-testid="techpack-uncommitted"
          >
            You have changes that are not committed. Commit them first if the tech pack should
            include them.
          </p>
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
            disabled={!head || !chosen || generate.isPending}
            data-testid="generate-techpack"
          >
            {generate.isPending ? 'Starting…' : `Generate for ${rev(head?.revisionNumber)}`}
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
