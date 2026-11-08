'use client';

import type { Analysis } from '@ai-designer/contracts';
import type { SketchAnalysis } from '@ai-designer/design-ai';
import { type PatternSpec, patternSpecSchema } from '@ai-designer/garment-model';
import { draftPattern, draftToState, seamChecks } from '@ai-designer/pattern-model';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScissorsIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assetContentUrl } from '@/features/assets/api';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { PatternPreview } from '@/features/patterns/cad/pattern-preview';
import { GarmentStyleForms } from '@/features/patterns/garment-forms';
import { FAMILY_LABEL, type Unit } from '@/features/patterns/options';
import { ChecksList, GarmentBasics, UnitToggle } from '@/features/patterns/pattern-forms';
import { queryKeys } from '@/lib/query/keys';

import { studioApi } from './api';

/**
 * Sketch → pattern review (ADR-058): what the AI read from the sketch, the options it set (changeable
 * here), and a live preview of the drafted pattern with its dimensions and fit checks. Creating the
 * design opens the pattern editor.
 */
/** Per-garment highlights; analyses stored before ADR-061 had plain arrays for the one garment. */
function sketchHighlights(result: { fromSketch?: unknown; unsure?: unknown }) {
  const norm = (v: unknown): Record<string, string[]> =>
    Array.isArray(v)
      ? { main: v as string[] }
      : v && typeof v === 'object'
        ? (v as Record<string, string[]>)
        : {};
  return { fromSketch: norm(result.fromSketch), unsure: norm(result.unsure) };
}

export function SketchReview({
  projectId,
  analysis,
  back,
}: {
  projectId: string;
  analysis: Analysis;
  back: ReactNode;
}) {
  const { active } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const result = analysis.result as unknown as SketchAnalysis;
  const [spec, setSpec] = useState<PatternSpec>(() => patternSpecSchema.parse(result.spec));
  const [name, setName] = useState(result.reading.label);
  const [unit, setUnit] = useState<Unit>('cm');
  const key = useRef(newIdempotencyKey());
  const marks = useMemo(() => sketchHighlights(result), [result]);

  const preview = useMemo(() => {
    const draft = draftPattern(spec);
    const pieces = draftToState(null, draft).patternPieces;
    return { pieces, checks: seamChecks(pieces, draft.spec) };
  }, [spec]);

  const create = useMutation({
    mutationFn: () =>
      studioApi.createDesign(
        active.id,
        analysis.id,
        { name: name.trim(), patternSpec: spec as unknown as Record<string, unknown> },
        key.current,
      ),
    onSuccess: async (out) => {
      toast.success(`Created ${out.design.displayId} with ${preview.pieces.length} pattern pieces`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).project(projectId),
      });
      router.push(`/projects/${projectId}/designs/${out.design.id}`);
    },
  });

  const reading = result.reading;
  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Review · ${reading.label}`}
        description={`${analysis.displayId} · read by ${result.provider}`}
        actions={back}
      />
      <div className="mx-auto grid w-full max-w-7xl gap-6 p-6 lg:grid-cols-[300px_1fr]">
        <aside className="flex flex-col gap-3" aria-label="Your sketch">
          {analysis.inputs.map((i, n) => (
            <figure key={i.assetId} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetContentUrl(active.id, i.assetId, 'preview_1024')}
                alt={n === 0 ? 'Your sketch' : `View ${n + 1}`}
                className="w-full rounded-md border bg-white object-contain"
              />
              <figcaption className="text-[11px] text-muted-foreground">
                {n === 0 ? 'Sketch' : `View ${n + 1}`}
              </figcaption>
            </figure>
          ))}
          <section className="flex flex-col gap-1.5 text-[13px]" data-testid="sketch-reading">
            {result.classification ? (
              <dl
                className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px]"
                data-testid="sketch-classification"
              >
                <dt className="text-muted-foreground">For</dt>
                <dd>
                  {result.classification.gender === 'unisex'
                    ? 'Anyone'
                    : result.classification.gender === 'male'
                      ? 'Male'
                      : 'Female'}{' '}
                  ·{' '}
                  {result.classification.ageGroup === 'child'
                    ? `child${result.classification.ageYears ? ` (about ${Math.round(result.classification.ageYears)} years)` : ''}`
                    : 'adult'}
                </dd>
                <dt className="text-muted-foreground">Covers</dt>
                <dd>
                  {(result.classification.sections.length
                    ? result.classification.sections
                    : ['—']
                  ).join(' + ')}
                </dd>
                <dt className="text-muted-foreground">Garments</dt>
                <dd data-testid="sketch-garments">
                  {(result.garments ?? [])
                    .map((g) => `${g.label} (${g.type.replaceAll('_', ' ')})`)
                    .join(', ')}
                </dd>
              </dl>
            ) : null}
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">
                {spec.garments.length
                  ? `Set of ${spec.garments.length + 1}`
                  : FAMILY_LABEL[result.spec.family]}
              </Badge>
              {reading.audience ? <Badge variant="outline">{reading.audience}</Badge> : null}
              <span className="text-[12px] text-muted-foreground">
                confidence {Math.round(reading.confidence * 100)}%
              </span>
            </div>
            {reading.description ? <p>{reading.description}</p> : null}
            {reading.details.length ? (
              <div className="rounded-md border border-status-needs-review/50 p-2 text-[12px]">
                <div className="font-medium">Not in the pattern (add by hand)</div>
                <ul className="list-disc pl-4">
                  {reading.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {reading.uncertain.length ? (
              <div className="text-[12px] text-muted-foreground">
                <div className="font-medium">Not visible in the sketch</div>
                <ul className="list-disc pl-4">
                  {reading.uncertain.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </aside>
        <div className="flex min-w-0 flex-col gap-4">
          <section
            className="flex flex-col gap-3 rounded-lg border p-3"
            aria-label="Pattern options"
          >
            <h2 className="text-sm font-semibold">Pattern options</h2>
            <p className="text-[12px] text-muted-foreground">
              Options marked <span className="rounded bg-primary/10 px-1 text-primary">sketch</span>{' '}
              were read from your drawing;{' '}
              <span className="rounded bg-status-needs-review/15 px-1 text-status-needs-review">
                check
              </span>{' '}
              marks a guess worth confirming. Sizes come from a standard size chart — you can change
              every measurement in the editor.
            </p>
            <GarmentBasics spec={spec} onChange={(s) => setSpec(patternSpecSchema.parse(s))} />
            <GarmentStyleForms
              spec={spec}
              highlight={marks.fromSketch}
              unsure={marks.unsure}
              onChange={(s) => setSpec(patternSpecSchema.parse(s))}
            />
          </section>
          <section className="flex flex-col gap-2" aria-label="Pattern preview">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                Pattern preview · {preview.pieces.length} pieces
              </h2>
              <UnitToggle unit={unit} onChange={setUnit} />
            </div>
            <div className="h-[520px] rounded-lg border" data-testid="pattern-preview">
              <PatternPreview pieces={preview.pieces} unit={unit} />
            </div>
            <details
              className="rounded-md border p-2"
              open={preview.checks.some((c) => c.status !== 'ok')}
            >
              <summary className="cursor-pointer text-[13px] font-medium">
                Fit checks — {preview.checks.filter((c) => c.status === 'ok').length} of{' '}
                {preview.checks.length} seams match
              </summary>
              <div className="mt-2">
                <ChecksList checks={preview.checks} unit={unit} />
              </div>
            </details>
          </section>
          <section className="flex flex-wrap items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="design-name">Design name</Label>
              <Input
                id="design-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 120))}
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              data-testid="create-patterns-button"
            >
              <ScissorsIcon />{' '}
              {create.isPending ? 'Creating…' : 'Create patterns and open the editor'}
            </Button>
          </section>
          {result.notes?.length ? (
            <ul className="text-[12px] text-muted-foreground">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {create.isError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {create.error.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
