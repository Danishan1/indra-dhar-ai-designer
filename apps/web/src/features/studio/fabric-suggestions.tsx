'use client';

import type { Analysis } from '@ai-designer/contracts';
import type { FabricSuggestions } from '@ai-designer/design-ai';
import type { PatternAudience } from '@ai-designer/garment-model';
import { sizesFor } from '@ai-designer/pattern-model';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, SparklesIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { assetContentUrl } from '@/features/assets/api';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { studioApi } from './api';

const WHO: Record<string, string> = { women: 'Women', men: 'Men', girls: 'Girls', boys: 'Boys' };

/**
 * From a fabric (ADR-066), step 2: what the AI read from the fabric and the garments it suggests.
 * The user picks one; the AI then draws it in the fabric (a reference picture) and makes its line
 * sketch, which is read like any sketch — the next page is the usual sketch review.
 */
export function FabricSuggestionsReview({
  analysis,
  back,
  failed,
}: {
  analysis: Analysis;
  back: ReactNode;
  /** The last design attempt failed: show why and let the user pick again. */
  failed?: string | null;
}) {
  const { active, can } = useOrganization();
  const queryClient = useQueryClient();
  const result = analysis.result as unknown as FabricSuggestions & { chosen?: number };
  const [picked, setPicked] = useState<number | null>(result.chosen ?? null);
  const [size, setSize] = useState('auto');
  const key = useRef(newIdempotencyKey());
  const choice = picked !== null ? result.suggestions[picked] : null;
  const sizes = choice ? sizesFor(choice.audience as PatternAudience) : [];

  const design = useMutation({
    mutationFn: () =>
      studioApi.chooseFabricSuggestion(
        active.id,
        analysis.id,
        { suggestion: picked!, ...(size !== 'auto' ? { size } : {}) },
        key.current,
      ),
    onSuccess: async () => {
      key.current = newIdempotencyKey();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).analysis(analysis.id),
      });
    },
  });

  const f = result.fabric;
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Garments for your fabric"
        description={`${analysis.displayId} · read by ${result.provider}. Pick one: AI designs it in your fabric and draws its line sketch, then the patterns are drafted from the sketch.`}
        actions={back}
      />
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-3" aria-label="Your fabric">
          {analysis.inputs.map((i, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i.assetId}
              src={assetContentUrl(active.id, i.assetId, 'preview_1024')}
              alt={n === 0 ? 'Your fabric' : `Fabric photo ${n + 1}`}
              className="w-full rounded-md border bg-white object-contain"
            />
          ))}
          <dl
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]"
            data-testid="fabric-reading"
          >
            <dt className="text-muted-foreground">Colours</dt>
            <dd className="flex flex-wrap gap-1">
              {f.colors.map((c) => (
                <Badge key={c} variant="outline" className="h-5 px-1.5 text-[11px]">
                  {c}
                </Badge>
              ))}
            </dd>
            <dt className="text-muted-foreground">Pattern</dt>
            <dd>
              {f.pattern}
              {f.motif ? ` — ${f.motif}` : ''}
            </dd>
            <dt className="text-muted-foreground">Texture</dt>
            <dd>{f.texture || '—'}</dd>
            <dt className="text-muted-foreground">Weight · drape</dt>
            <dd>
              {f.weight} · {f.drape}
              {f.stretch ? ' · stretch' : ''}
            </dd>
            <dt className="text-muted-foreground">Likely material</dt>
            <dd>{f.likelyMaterial ? `${f.likelyMaterial} (a guess)` : '—'}</dd>
            {f.season ? (
              <>
                <dt className="text-muted-foreground">Season</dt>
                <dd>{f.season}</dd>
              </>
            ) : null}
          </dl>
          {result.bestFor ? (
            <p
              className="rounded-md border border-primary/40 bg-primary/5 p-2 text-[12px]"
              data-testid="fabric-best-for"
            >
              <strong>Best for {WHO[result.bestFor.audience]?.toLowerCase()}.</strong>{' '}
              {result.bestFor.why}
            </p>
          ) : null}
        </aside>
        <section className="flex flex-col gap-4" aria-label="Suggested garments">
          {failed ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/50 p-2 text-[13px] text-destructive"
            >
              The design could not be made: {failed} Pick a garment to try again.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Garments">
            {result.suggestions.map((s, i) => (
              <button
                key={`${s.title}-${i}`}
                type="button"
                role="radio"
                aria-checked={picked === i}
                onClick={() => {
                  setPicked(i);
                  setSize('auto');
                }}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors',
                  picked === i
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'hover:bg-accent',
                )}
                data-testid="fabric-suggestion"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {picked === i ? <CheckIcon className="size-4 text-primary" aria-hidden /> : null}
                  {s.title}
                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[11px]">
                    {WHO[s.audience]}
                  </Badge>
                </span>
                {s.description ? (
                  <span className="text-[13px] text-muted-foreground">{s.description}</span>
                ) : null}
                {s.styleDetails.length ? (
                  <span className="flex flex-wrap gap-1">
                    {s.styleDetails.map((d) => (
                      <Badge
                        key={d}
                        variant="outline"
                        className="h-5 px-1.5 text-[11px] font-normal"
                      >
                        {d}
                      </Badge>
                    ))}
                  </span>
                ) : null}
                {s.why ? <span className="text-[12px] italic">{s.why}</span> : null}
              </button>
            ))}
          </div>
          {choice ? (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fabric-size">Size</Label>
                <SimpleSelect
                  id="fabric-size"
                  value={size}
                  onValueChange={setSize}
                  options={[
                    { value: 'auto', label: 'Standard' },
                    ...sizes.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </div>
              <p className="min-w-60 flex-1 text-[12px] text-muted-foreground">
                AI draws the {choice.title.toLowerCase()} in your fabric (a reference picture) and
                its black-and-white line sketch, then reads the sketch — 4 AI requests.
              </p>
              <Button
                onClick={() => design.mutate()}
                disabled={!can('design.generate') || design.isPending}
                data-testid="fabric-design-button"
              >
                <SparklesIcon /> {design.isPending ? 'Starting…' : 'Design this'}
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Pick the garment you want to make.</p>
          )}
          {design.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {design.error.message}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
