'use client';

import type { Asset } from '@ai-designer/contracts';
import type { PatternAudience } from '@ai-designer/garment-model';
import { sizesFor } from '@ai-designer/pattern-model';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { AssetThumbnail } from '@/features/assets/asset-thumbnail';
import { UploadDropzone } from '@/features/assets/upload-dropzone';
import { newIdempotencyKey } from '@/features/designs/api';
import { NewDesignDialog } from '@/features/designs/new-design-dialog';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { studioApi } from './api';

type Role = 'auto' | 'sketch' | 'reference' | 'pattern' | 'fabric';

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'auto', label: 'Let AI decide' },
  { value: 'sketch', label: 'Sketch / drawing' },
  { value: 'reference', label: 'Garment photo' },
  { value: 'pattern', label: 'Pattern pieces' },
  { value: 'fabric', label: 'Fabric swatch' },
];

/** A first guess at the role from the file name; the user can change it. */
export function guessRole(fileName: string | null): Role {
  const n = (fileName ?? '').toLowerCase();
  if (/fabric|swatch|textile|cloth|material/.test(n)) return 'fabric';
  if (/pattern|block|pieces/.test(n)) return 'pattern';
  if (/sketch|drawing|draft|flat/.test(n)) return 'sketch';
  if (/photo|reference|ref|img|image/.test(n)) return 'reference';
  return 'auto';
}

const START_MODES = [
  {
    key: 'sketch',
    title: 'From a sketch',
    text: 'Upload a drawing of the garment. AI reads the style; we draft the flat patterns with real dimensions.',
    ready: true,
  },
  {
    key: 'photo',
    title: 'From a garment photo',
    text: 'A photo of an existing garment.',
    ready: false,
  },
  {
    key: 'pattern',
    title: 'From pattern pieces',
    text: 'Scans or photos of a paper pattern.',
    ready: false,
  },
  { key: 'blank', title: 'Blank or template', text: 'Start without images.', ready: true },
] as const;

const SKETCH_GARMENTS = [
  { value: 'auto', label: 'Let AI decide' },
  { value: 'dress', label: 'Dress' },
  { value: 'top', label: 'Top / shirt / T-shirt' },
  { value: 'skirt', label: 'Skirt' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'shorts', label: 'Shorts / half pants' },
  { value: 'shirt and shorts set', label: 'Set: top + bottom (co-ord)' },
  { value: 'jumpsuit', label: 'Jumpsuit / romper' },
  { value: 'dungarees', label: 'Dungarees' },
  { value: 'jacket', label: 'Jacket / blazer' },
  { value: 'hoodie', label: 'Hoodie / sweatshirt' },
];
const SKETCH_AUDIENCES = [
  { value: 'auto', label: 'Let AI decide' },
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'girls', label: 'Girls' },
  { value: 'boys', label: 'Boys' },
];

/**
 * "New design with AI" (ADR-058): the user first chooses how to start. Sketch → AI reads the
 * garment → the pattern engine drafts editable flat patterns (review, then the pattern editor).
 */
export function NewAnalysisPage({ projectId }: { projectId: string }) {
  const { active, can } = useOrganization();
  const router = useRouter();
  const [sketches, setSketches] = useState<Asset[]>([]);
  const [garment, setGarment] = useState('auto');
  const [audience, setAudience] = useState('auto');
  const [size, setSize] = useState('auto');
  const [notes, setNotes] = useState('');
  const [provider, setProvider] = useState('');
  const [blankOpen, setBlankOpen] = useState(false);
  const key = useRef(newIdempotencyKey());

  const status = useQuery({
    queryKey: queryKeys.org(active.id).aiStatus(),
    queryFn: ({ signal }) => studioApi.aiStatus(active.id, signal),
  });
  const configured = (status.data?.providers ?? []).filter((p) => p.configured);
  const chosen = provider || status.data?.defaultProvider || '';
  const sizes = audience === 'auto' ? [] : sizesFor(audience as PatternAudience);

  const analyze = useMutation({
    mutationFn: () =>
      studioApi.createAnalysis(
        active.id,
        projectId,
        {
          mode: 'sketch',
          inputs: sketches.map((a) => ({ assetId: a.id, role: 'sketch' as const })),
          ...(garment !== 'auto' ? { garmentHint: garment } : {}),
          ...(audience !== 'auto' ? { audience: audience as 'women' } : {}),
          ...(size !== 'auto' && audience !== 'auto' ? { size } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(chosen ? { provider: chosen as 'gemini' | 'openai' | 'fake' } : {}),
        },
        key.current,
      ),
    onSuccess: (analysis) => {
      key.current = newIdempotencyKey();
      router.push(`/projects/${projectId}/analyses/${analysis.id}`);
    },
  });

  const canRun = can('design.generate');
  return (
    <div className="flex flex-col">
      <PageHeader
        title="New design with AI"
        description="Choose how to start. From a sketch, AI reads the garment and we draft its flat patterns — every piece has real dimensions you can edit."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}`}>
              <ArrowLeftIcon /> Back to project
            </Link>
          </Button>
        }
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        <section
          aria-label="How do you want to start?"
          className="grid gap-3 sm:grid-cols-4"
          data-testid="start-modes"
        >
          {START_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              disabled={!m.ready}
              onClick={() => (m.key === 'blank' ? setBlankOpen(true) : undefined)}
              aria-pressed={m.key === 'sketch'}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left',
                m.key === 'sketch' && 'border-primary ring-2 ring-primary/30',
                !m.ready && 'cursor-not-allowed opacity-50',
              )}
              data-testid={`start-${m.key}`}
            >
              <span className="text-sm font-semibold">{m.title}</span>
              <span className="text-[12px] text-muted-foreground">{m.text}</span>
              {!m.ready ? <span className="text-[11px] font-medium">Coming soon</span> : null}
            </button>
          ))}
        </section>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="flex flex-col gap-4" aria-label="Sketch">
            <h2 className="text-sm font-semibold">1. Your sketch</h2>
            <UploadDropzone
              orgId={active.id}
              assetType="source_image"
              hint="PNG, JPEG or WebP · the front view, plus up to 3 more views"
              disabled={sketches.length >= 4}
              onSettled={(asset) => {
                if (asset.status !== 'ready') return;
                setSketches((list) =>
                  list.some((a) => a.id === asset.id) ? list : [...list, asset],
                );
              }}
            />
            {sketches.length ? (
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Sketches">
                {sketches.map((a, i) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                    data-testid="analysis-input"
                  >
                    <AssetThumbnail orgId={active.id} asset={a} className="size-16" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium">
                        {a.fileName ?? a.displayId}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {i === 0 ? 'Main sketch' : `View ${i + 1}`}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${a.fileName ?? 'image'}`}
                      onClick={() => setSketches((list) => list.filter((x) => x.id !== a.id))}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <section className="flex flex-col gap-4" aria-label="About the garment">
            <h2 className="text-sm font-semibold">2. A little context (optional)</h2>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="garment-hint">Garment</Label>
              <SimpleSelect
                id="garment-hint"
                value={garment}
                onValueChange={setGarment}
                options={SKETCH_GARMENTS}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audience">For</Label>
                <SimpleSelect
                  id="audience"
                  value={audience}
                  onValueChange={(v) => {
                    setAudience(v);
                    setSize('auto');
                  }}
                  options={SKETCH_AUDIENCES}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="size">Size</Label>
                <SimpleSelect
                  id="size"
                  value={size}
                  onValueChange={setSize}
                  disabled={audience === 'auto'}
                  options={[
                    {
                      value: 'auto',
                      label: audience === 'auto' ? 'After the reading' : 'Standard',
                    },
                    ...sizes.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="e.g. back zip, lined bodice, knee length"
                className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="provider">AI provider</Label>
              <SimpleSelect
                id="provider"
                value={chosen}
                onValueChange={setProvider}
                options={configured.map((p) => ({
                  value: p.name,
                  label:
                    p.name === 'fake'
                      ? 'Demo (offline, no real AI)'
                      : `${p.name === 'gemini' ? 'Google Gemini' : 'OpenAI'} · ${p.models.text}`,
                }))}
                placeholder={status.isPending ? 'Loading…' : 'No provider configured'}
              />
              {status.data ? (
                <p className="text-[12px] text-muted-foreground">
                  {status.data.usedToday} of {status.data.dailyLimit} AI requests used today.
                </p>
              ) : null}
            </div>
            <Button
              onClick={() => analyze.mutate()}
              disabled={!canRun || !sketches.length || !chosen || analyze.isPending}
              data-testid="analyze-button"
            >
              <SparklesIcon /> {analyze.isPending ? 'Starting…' : 'Read the sketch'}
            </Button>
            {analyze.isError ? (
              <p role="alert" className="text-[13px] text-destructive">
                {analyze.error.message}
              </p>
            ) : null}
            {!canRun ? (
              <p className="text-[13px] text-muted-foreground">Your role cannot run AI analysis.</p>
            ) : null}
          </section>
        </div>
      </div>
      <NewDesignDialog projectId={projectId} open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}
