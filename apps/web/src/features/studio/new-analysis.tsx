'use client';

import type { Asset } from '@ai-designer/contracts';
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

import { studioApi } from './api';

type Role = 'auto' | 'sketch' | 'reference' | 'pattern' | 'fabric';

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'auto', label: 'Let AI decide' },
  { value: 'sketch', label: 'Sketch / drawing' },
  { value: 'reference', label: 'Garment photo' },
  { value: 'pattern', label: 'Pattern pieces' },
  { value: 'fabric', label: 'Fabric swatch' },
];

const GARMENTS = [
  { value: 'auto', label: 'Detect from the images' },
  { value: 'shirt', label: 'Shirt' },
  { value: 't-shirt', label: 'T-shirt' },
  { value: 'dress', label: 'Dress' },
  { value: 'skirt', label: 'Skirt' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'jacket', label: 'Jacket' },
  { value: 'hoodie', label: 'Hoodie' },
];

const AUDIENCES = [
  { value: 'any', label: 'Not specified' },
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'kids', label: 'Kids' },
  { value: 'unisex', label: 'Unisex' },
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

interface Input {
  asset: Asset;
  role: Role;
}

/**
 * "New design with AI" (Component 1, ADR-056): upload any combination of sketches, garment photos,
 * pattern pieces and fabric swatches; the analyzer decomposes them into components you review.
 */
export function NewAnalysisPage({ projectId }: { projectId: string }) {
  const { active, can } = useOrganization();
  const router = useRouter();
  const [inputs, setInputs] = useState<Input[]>([]);
  const [garment, setGarment] = useState('auto');
  const [audience, setAudience] = useState('any');
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

  const analyze = useMutation({
    mutationFn: () =>
      studioApi.createAnalysis(
        active.id,
        projectId,
        {
          inputs: inputs.map((i) => ({ assetId: i.asset.id, role: i.role })),
          ...(garment !== 'auto' ? { garmentHint: garment } : {}),
          ...(audience !== 'any'
            ? { audience: audience as 'men' | 'women' | 'kids' | 'unisex' }
            : {}),
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

  const ready = inputs.filter((i) => i.asset.status === 'ready');
  const canRun = can('design.generate');

  return (
    <div className="flex flex-col">
      <PageHeader
        title="New design with AI"
        description="Upload a sketch, a photo of a garment, pattern pieces, fabrics — or any mix. AI breaks the garment into components you can review; nothing is confirmed until you say so."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/projects/${projectId}`}>
              <ArrowLeftIcon /> Back to project
            </Link>
          </Button>
        }
      />
      <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-4" aria-label="Images">
          <h2 className="text-sm font-semibold">1. Your images</h2>
          <UploadDropzone
            orgId={active.id}
            assetType="source_image"
            hint="PNG, JPEG or WebP · up to 10 images"
            disabled={inputs.length >= 10}
            onSettled={(asset) => {
              if (asset.status !== 'ready') return;
              setInputs((list) =>
                list.some((i) => i.asset.id === asset.id)
                  ? list
                  : [...list, { asset, role: guessRole(asset.fileName) }],
              );
            }}
          />
          {inputs.length ? (
            <ul className="grid gap-3 sm:grid-cols-2" aria-label="Analysis inputs">
              {inputs.map((input) => (
                <li
                  key={input.asset.id}
                  className="flex items-center gap-3 rounded-lg border p-2"
                  data-testid="analysis-input"
                >
                  <AssetThumbnail orgId={active.id} asset={input.asset} className="size-16" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-[13px] font-medium">
                      {input.asset.fileName ?? input.asset.displayId}
                    </span>
                    <SimpleSelect
                      aria-label={`What is ${input.asset.fileName ?? 'this image'}?`}
                      value={input.role}
                      onValueChange={(role) =>
                        setInputs((list) =>
                          list.map((i) =>
                            i.asset.id === input.asset.id ? { ...i, role: role as Role } : i,
                          ),
                        )
                      }
                      options={ROLE_OPTIONS}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${input.asset.fileName ?? 'image'}`}
                    onClick={() =>
                      setInputs((list) => list.filter((i) => i.asset.id !== input.asset.id))
                    }
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
              options={GARMENTS}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audience">For</Label>
            <SimpleSelect
              id="audience"
              value={audience}
              onValueChange={setAudience}
              options={AUDIENCES}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="e.g. relaxed fit, contrast collar in the second fabric"
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
            disabled={!canRun || ready.length === 0 || !chosen || analyze.isPending}
            data-testid="analyze-button"
          >
            <SparklesIcon /> {analyze.isPending ? 'Starting…' : 'Analyze design'}
          </Button>
          {analyze.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {analyze.error.message}
            </p>
          ) : null}
          {!canRun ? (
            <p className="text-[13px] text-muted-foreground">Your role cannot run AI analysis.</p>
          ) : null}
          <p className="text-[13px] text-muted-foreground">
            No images?{' '}
            <button type="button" className="underline" onClick={() => setBlankOpen(true)}>
              Start from a template or blank
            </button>
            .
          </p>
        </section>
      </div>
      <NewDesignDialog projectId={projectId} open={blankOpen} onOpenChange={setBlankOpen} />
    </div>
  );
}
