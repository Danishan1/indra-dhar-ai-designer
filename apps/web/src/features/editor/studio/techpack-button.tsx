'use client';

import { type PatternSpec, patternSpecSchema, type SizeSystem } from '@ai-designer/garment-model';
import { convertSize, SIZE_SYSTEM_LABELS, sizesFor } from '@ai-designer/pattern-model';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, FileTextIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

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
import { useCustomCharts } from '@/features/patterns/pattern-forms';
import { studioApi } from '@/features/studio/api';
import { toApiError } from '@/lib/api/errors';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

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
  const rawSpec = useEditor((s) => s.display.patternSpec);
  const spec = useMemo(() => (rawSpec ? patternSpecSchema.parse(rawSpec) : null), [rawSpec]);
  const sizing = useSizing(spec);
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
          ...(sizing.request ? { sizing: sizing.request } : {}),
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
          {spec ? <SizingPicker sizing={sizing} /> : null}
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

const STANDARD_SYSTEMS: Exclude<SizeSystem, 'custom'>[] = ['intl', 'uk', 'us', 'eu'];

/**
 * Size chart of the tech pack (ADR-067): the standard (or an organization chart), the base size —
 * the design's size converted to that standard — and the sizes to grade.
 */
function useSizing(spec: PatternSpec | null) {
  const audience = spec?.audience ?? 'women';
  const custom = useCustomCharts(audience);
  const designSystem = spec?.sizeSystem ?? 'intl';
  const [value, setValue] = useState<string>(
    designSystem === 'custom' ? `custom:${spec?.customChart?.id ?? ''}` : designSystem,
  );
  const chart = value.startsWith('custom:')
    ? (custom.find((c) => `custom:${c.id}` === value) ??
      (spec?.customChart && `custom:${spec.customChart.id}` === value ? spec.customChart : null))
    : null;
  const system: SizeSystem = chart
    ? 'custom'
    : value.startsWith('custom:')
      ? 'intl'
      : (value as SizeSystem);
  const all = sizesFor(audience, system, chart);
  const converted = spec
    ? convertSize(
        audience,
        { system: designSystem, size: spec.size, custom: spec.customChart ?? null },
        { system, custom: chart },
      )
    : '';
  const [base, setBase] = useState<string | null>(null);
  const baseSize = base && all.includes(base) ? base : converted;
  const [picked, setPicked] = useState<string[] | null>(null);
  const sizes = (picked ?? [baseSize]).filter((s) => all.includes(s));
  const withBase = all.filter((s) => s === baseSize || sizes.includes(s));
  return {
    custom,
    value,
    system,
    all,
    baseSize,
    sizes: withBase,
    setStandard: (v: string) => {
      setValue(v);
      setBase(null);
      setPicked(null);
    },
    setBase: (s: string) => setBase(s),
    toggle: (s: string) =>
      setPicked(withBase.includes(s) ? withBase.filter((x) => x !== s) : [...withBase, s]),
    setAll: (on: boolean) => setPicked(on ? [...all] : [baseSize]),
    request: spec
      ? {
          system,
          ...(chart ? { chartId: chart.id } : {}),
          baseSize,
          sizes: withBase,
        }
      : null,
  };
}

function SizingPicker({ sizing }: { sizing: ReturnType<typeof useSizing> }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-2.5" data-testid="techpack-sizing">
      <legend className="px-1 text-[13px] font-medium">Sizes</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tp-standard" className="text-[12px]">
            Size standard
          </Label>
          <SimpleSelect
            id="tp-standard"
            value={sizing.value}
            onValueChange={sizing.setStandard}
            options={[
              ...STANDARD_SYSTEMS.map((s) => ({ value: s, label: SIZE_SYSTEM_LABELS[s] })),
              ...sizing.custom.map((c) => ({ value: `custom:${c.id}`, label: c.name })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tp-base" className="text-[12px]">
            Base size (patterns)
          </Label>
          <SimpleSelect
            id="tp-base"
            value={sizing.baseSize}
            onValueChange={sizing.setBase}
            options={sizing.all.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Sizes to grade">
        {sizing.all.map((s) => {
          const on = sizing.sizes.includes(s);
          const base = s === sizing.baseSize;
          return (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={on ? 'default' : 'outline'}
              aria-pressed={on}
              disabled={base}
              className={cn('h-7 gap-1 px-2 text-xs', base && 'disabled:opacity-100')}
              onClick={() => sizing.toggle(s)}
              data-testid={`tp-size-${s}`}
            >
              {on ? <CheckIcon aria-hidden /> : null}
              {s}
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => sizing.setAll(sizing.sizes.length < sizing.all.length)}
          data-testid="tp-size-all"
        >
          {sizing.sizes.length < sizing.all.length ? 'All sizes' : 'Base only'}
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground" data-testid="tp-size-summary">
        {sizing.sizes.length === 1
          ? `Size chart for ${sizing.baseSize} only.`
          : `Size chart for ${sizing.sizes.length} sizes (${sizing.sizes[0]}–${sizing.sizes[sizing.sizes.length - 1]}), graded from the base size ${sizing.baseSize}.`}
      </p>
    </fieldset>
  );
}
