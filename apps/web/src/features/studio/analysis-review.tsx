'use client';

import type { Analysis } from '@ai-designer/contracts';
import type { AnalysisComponent, AnalysisResult, ComponentMatchView } from '@ai-designer/design-ai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  Loader2Icon,
  LibraryIcon,
  SparklesIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shell/page-header';
import { ErrorState, LoadingState } from '@/components/states/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { assetContentUrl } from '@/features/assets/api';
import { newIdempotencyKey } from '@/features/designs/api';
import { useOrganization } from '@/features/organizations/organization-provider';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { studioApi } from './api';
import { ROLE_OPTIONS } from './new-analysis';
import { SketchReview } from './sketch-review';

const human = (s: string) => s.replaceAll('_', ' ');

const MATCH_TEXT: Record<
  ComponentMatchView['kind'],
  { label: string; className: string; hint: string }
> = {
  exact: {
    label: 'Exact library match',
    className: 'border-status-confirmed text-status-confirmed',
    hint: 'Reused from your library — AI detail was skipped',
  },
  compatible: {
    label: 'Compatible library match',
    className: 'border-status-proposed text-status-proposed',
    hint: 'Close enough to reuse; measurements may differ slightly',
  },
  similar: {
    label: 'Similar in library',
    className: 'border-status-needs-review text-status-needs-review',
    hint: 'A library entry looks alike but differs — AI result used by default',
  },
  new: {
    label: 'New component',
    className: 'border-status-inferred text-status-inferred',
    hint: 'Not in your library yet — it will be saved there',
  },
};

/** An image streamed through the API (authorized per request). */
function AssetImg({
  orgId,
  assetId,
  alt,
  className,
  variant = 'thumb_256',
}: {
  orgId: string;
  assetId: string;
  alt: string;
  className?: string;
  variant?: 'thumb_256' | 'preview_1024';
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authorized API stream
    <img
      src={assetContentUrl(orgId, assetId, variant)}
      alt={alt}
      className={cn('rounded-md border bg-white object-contain', className)}
    />
  );
}

type Decision = 'ai' | 'library' | 'skip';

/**
 * Analysis progress and review (Component 1, ADR-056): see every identified component with its
 * image, attributes, AI-estimated measurements and library match; choose AI result, library entry
 * or leave it out; assign fabrics; then create the structured design and open it in the editor.
 */
export function AnalysisReviewPage({
  projectId,
  analysisId,
}: {
  projectId: string;
  analysisId: string;
}) {
  const { active } = useOrganization();
  const analysis = useQuery({
    queryKey: queryKeys.org(active.id).analysis(analysisId),
    queryFn: ({ signal }) => studioApi.analysis(active.id, analysisId, signal),
    refetchInterval: (q) =>
      q.state.data && (q.state.data.status === 'queued' || q.state.data.status === 'running')
        ? 1500
        : false,
  });

  const back = (
    <Button variant="ghost" size="sm" asChild>
      <Link href={`/projects/${projectId}`}>
        <ArrowLeftIcon /> Back to project
      </Link>
    </Button>
  );
  if (analysis.isPending) return <LoadingState />;
  if (analysis.isError)
    return <ErrorState error={analysis.error} onRetry={() => void analysis.refetch()} />;
  const a = analysis.data;

  if (a.status === 'queued' || a.status === 'running')
    return (
      <div className="flex flex-col">
        <PageHeader title={`Analyzing · ${a.displayId}`} actions={back} />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-10 text-center">
          <Loader2Icon className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium" role="status" data-testid="analysis-stage">
            {a.stage ?? 'Working…'}
          </p>
          <p className="text-[13px] text-muted-foreground">
            The analyzer looks at all images together, compares each component with your library and
            only asks AI for details of components it does not know yet.
          </p>
          <InputStrip orgId={active.id} analysis={a} />
        </div>
      </div>
    );

  if (a.status === 'failed')
    return (
      <div className="flex flex-col">
        <PageHeader title={`Analysis failed · ${a.displayId}`} actions={back} />
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-10 text-center">
          <AlertTriangleIcon className="size-8 text-destructive" aria-hidden />
          <p className="text-sm" role="alert">
            {a.error?.message ?? 'The analysis failed.'}
          </p>
          {a.error?.kind === 'auth' || a.error?.kind === 'not_configured' ? (
            <p className="text-[13px] text-muted-foreground">
              Check the provider’s API key in the server configuration.
            </p>
          ) : null}
          <RetryAnalysis projectId={projectId} analysis={a} />
        </div>
      </div>
    );

  if (a.mode === 'sketch') return <SketchReview projectId={projectId} analysis={a} back={back} />;
  return <Review projectId={projectId} analysis={a} back={back} />;
}

/** Runs the same images again (optionally with another provider) — no re-upload needed. */
function RetryAnalysis({ projectId, analysis }: { projectId: string; analysis: Analysis }) {
  const { active } = useOrganization();
  const router = useRouter();
  const [provider, setProvider] = useState<string>(analysis.provider);
  const key = useRef(newIdempotencyKey());
  const status = useQuery({
    queryKey: queryKeys.org(active.id).aiStatus(),
    queryFn: ({ signal }) => studioApi.aiStatus(active.id, signal),
  });
  const configured = (status.data?.providers ?? []).filter((p) => p.configured);
  const retry = useMutation({
    mutationFn: () =>
      studioApi.createAnalysis(
        active.id,
        projectId,
        {
          inputs: analysis.inputs.map((i) => ({ assetId: i.assetId, role: i.role })),
          ...(analysis.notes ? { notes: analysis.notes } : {}),
          ...(analysis.garmentHint ? { garmentHint: analysis.garmentHint } : {}),
          ...(analysis.audience
            ? { audience: analysis.audience as 'men' | 'women' | 'kids' | 'unisex' }
            : {}),
          mode: analysis.mode,
          ...(analysis.size ? { size: analysis.size } : {}),
          provider: provider as 'gemini' | 'openai' | 'fake',
        },
        key.current,
      ),
    onSuccess: (next) => {
      key.current = newIdempotencyKey();
      router.push(`/projects/${projectId}/analyses/${next.id}`);
    },
  });
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        {configured.length > 1 ? (
          <SimpleSelect
            aria-label="AI provider for the retry"
            className="h-9 w-56"
            value={provider}
            onValueChange={setProvider}
            options={configured.map((p) => ({
              value: p.name,
              label:
                p.name === 'fake'
                  ? 'Demo (offline, no real AI)'
                  : `${p.name === 'gemini' ? 'Google Gemini' : 'OpenAI'} · ${p.models.text}`,
            }))}
          />
        ) : null}
        <Button
          onClick={() => retry.mutate()}
          disabled={retry.isPending}
          data-testid="retry-analysis"
        >
          {retry.isPending ? 'Starting…' : 'Try again with the same images'}
        </Button>
      </div>
      {retry.isError ? (
        <p role="alert" className="text-[13px] text-destructive">
          {retry.error.message}
        </p>
      ) : null}
      <Link href={`/projects/${projectId}/ai/new`} className="text-[13px] underline">
        Start over with other images
      </Link>
    </div>
  );
}

/** The component as a vector outline (what the editor will get), with the reference crop small. */
function OutlinePreview({
  component: c,
  crop,
  orgId,
}: {
  component: AnalysisComponent;
  crop: string | undefined;
  orgId: string;
}) {
  const w = c.region ? Math.max(0.02, c.region.width) : 1;
  const h = c.region ? Math.max(0.02, c.region.height) : 1;
  const k = 64 / Math.max(w, h);
  return (
    <div className="relative size-[72px]" data-testid="component-outline">
      <svg
        viewBox={`-4 -4 ${w * k + 8} ${h * k + 8}`}
        className="size-full rounded-md border bg-white"
        aria-label={`${c.name} outline`}
      >
        {c.outline ? (
          <polygon
            points={c.outline.map((p) => `${p.x * w * k},${p.y * h * k}`).join(' ')}
            fill="#e2e8f0"
            stroke="#1f2937"
            strokeWidth={1.5}
          />
        ) : (
          <rect width={w * k} height={h * k} fill="none" stroke="#9ca3af" strokeDasharray="4 3" />
        )}
      </svg>
      {crop ? (
        <AssetImg
          orgId={orgId}
          assetId={crop}
          alt={`${c.name} in your image`}
          className="absolute right-0 bottom-0 size-6"
        />
      ) : null}
    </div>
  );
}

/** Original next to the vector reconstruction the analysis produced (before any editing). */
function ReconstructionPreview({
  orgId,
  analysis,
  result,
}: {
  orgId: string;
  analysis: Analysis;
  result: AnalysisResult;
}) {
  const d = result.decomposition;
  const traced = d.components.filter((c) => c.region && c.outline);
  const img = traced[0]?.region?.imageIndex ?? 0;
  const size = result.imageSizes?.[img] ?? { width: 1000, height: 1000 };
  const input = analysis.inputs[img];
  const onImage = traced.filter((c) => c.region!.imageIndex === img);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3" data-testid="reconstruction-preview">
        <figure className="flex flex-col gap-1">
          {input ? (
            <AssetImg
              orgId={orgId}
              assetId={input.assetId}
              alt="Original"
              className="aspect-square w-full"
              variant="preview_1024"
            />
          ) : null}
          <figcaption className="text-[11px] text-muted-foreground">Original</figcaption>
        </figure>
        <figure className="flex flex-col gap-1">
          <svg
            viewBox={`0 0 ${size.width} ${size.height}`}
            className="aspect-square w-full rounded-md border bg-white"
            aria-label="Editable reconstruction preview"
          >
            {onImage.map((c) => {
              const r = c.region!;
              return (
                <polygon
                  key={c.key}
                  points={c
                    .outline!.map(
                      (p) =>
                        `${(r.x + p.x * r.width) * size.width},${(r.y + p.y * r.height) * size.height}`,
                    )
                    .join(' ')}
                  fill="#f1f5f9"
                  fillOpacity={0.85}
                  stroke="#1f2937"
                  strokeWidth={Math.max(size.width, size.height) / 300}
                >
                  <title>{c.name}</title>
                </polygon>
              );
            })}
          </svg>
          <figcaption className="text-[11px] text-muted-foreground">
            Editable reconstruction · {onImage.length} traced parts
            {d.components.length - traced.length > 0
              ? ` · ${d.components.length - traced.length} from templates`
              : ''}
          </figcaption>
        </figure>
      </div>
      <InputStrip orgId={orgId} analysis={analysis} />
    </div>
  );
}

function InputStrip({ orgId, analysis }: { orgId: string; analysis: Analysis }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="Inputs">
      {analysis.inputs.map((i) => (
        <li key={i.assetId} className="flex flex-col items-center gap-1">
          <AssetImg
            orgId={orgId}
            assetId={i.assetId}
            alt={i.fileName ?? 'input'}
            className="size-20"
          />
          <span className="text-[11px] text-muted-foreground">
            {ROLE_OPTIONS.find((r) => r.value === i.role)?.label ?? i.role}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Review({
  projectId,
  analysis,
  back,
}: {
  projectId: string;
  analysis: Analysis;
  back: React.ReactNode;
}) {
  const { active, can } = useOrganization();
  const router = useRouter();
  const queryClient = useQueryClient();
  const result = analysis.result as unknown as AnalysisResult;
  const d = result.decomposition;
  const [name, setName] = useState(d.garment.label.slice(0, 120));
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    Object.fromEntries(
      d.components.map((c) => {
        const m = result.matches[c.key];
        return [
          c.key,
          m?.entry && (m.kind === 'exact' || m.kind === 'compatible') ? 'library' : 'ai',
        ];
      }),
    ),
  );
  const [fabrics, setFabrics] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(d.components.map((c) => [c.key, c.fabricKey])),
  );
  const key = useRef(newIdempotencyKey());

  const children = useMemo(() => {
    const byParent = new Map<string | null, AnalysisComponent[]>();
    for (const c of d.components) {
      const p = c.componentType === 'garment_body' ? null : (c.parentKey ?? 'body');
      byParent.set(p, [...(byParent.get(p) ?? []), c]);
    }
    return byParent;
  }, [d.components]);
  const ordered: { c: AnalysisComponent; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of children.get(parent) ?? []) {
      ordered.push({ c, depth });
      if (depth < 4) walk(c.key, depth + 1);
    }
  };
  walk(null, 0);
  for (const c of d.components)
    if (!ordered.some((o) => o.c.key === c.key)) ordered.push({ c, depth: 1 });

  const create = useMutation({
    mutationFn: () =>
      studioApi.createDesign(
        active.id,
        analysis.id,
        { name: name.trim(), decisions, fabricAssignments: fabrics, saveToLibrary },
        key.current,
      ),
    onSuccess: async (out) => {
      toast.success(
        `Created ${out.design.displayId}` +
          (out.libraryEntriesCreated
            ? ` · ${out.libraryEntriesCreated} components saved to the library`
            : ''),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(active.id).project(projectId),
      });
      router.push(`/projects/${projectId}/designs/${out.design.id}`);
    },
  });

  const fabricOptions = [
    { value: '__none', label: 'No fabric' },
    ...d.fabrics.map((f) => ({ value: f.key, label: f.name })),
  ];
  const reused = result.libraryReuseFor.length;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={`Review · ${d.garment.label}`}
        description={`${analysis.displayId} · ${result.provider} (${result.models.text}) · ${d.components.length} components · ${reused} reused from the library`}
        actions={back}
      />
      <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2" aria-label="Garment">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{human(d.garment.category)}</Badge>
              {d.garment.audience !== 'unknown' ? (
                <Badge variant="outline">{d.garment.audience}</Badge>
              ) : null}
              {d.garment.silhouette ? (
                <Badge variant="outline">{d.garment.silhouette}</Badge>
              ) : null}
              <span className="text-[12px] text-muted-foreground">
                confidence {Math.round(d.garment.confidence * 100)}%
              </span>
            </div>
            {d.garment.description ? <p className="text-[13px]">{d.garment.description}</p> : null}
            <ReconstructionPreview orgId={active.id} analysis={analysis} result={result} />
          </section>

          <section className="flex flex-col gap-3" aria-label="Components">
            <h2 className="text-sm font-semibold">Components</h2>
            <p className="text-[12px] text-muted-foreground">
              Measurements are AI estimates — they stay marked as estimates in the design until you
              confirm them. Pattern pieces are provisional.
            </p>
            <ul className="flex flex-col gap-2">
              {ordered.map(({ c, depth }) => {
                const match = result.matches[c.key];
                const detail = result.details?.details.find((x) => x.key === c.key);
                const crop = analysis.crops[c.key];
                const m = match ? MATCH_TEXT[match.kind] : null;
                const attrs = { ...c.attributes, ...(detail?.attributes ?? {}) };
                const dims = { ...c.measurementsMm, ...(detail?.measurementsMm ?? {}) };
                const decision = decisions[c.key] ?? 'ai';
                const isBody = c.componentType === 'garment_body';
                return (
                  <li
                    key={c.key}
                    className={cn(
                      'grid grid-cols-[72px_1fr] gap-3 rounded-lg border p-3',
                      decision === 'skip' && 'opacity-50',
                    )}
                    style={{ marginLeft: depth * 16 }}
                    data-testid="analysis-component"
                  >
                    <OutlinePreview component={c} crop={crop} orgId={active.id} />
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {human(c.componentType)}
                          {c.side !== 'none' ? ` · ${c.side}` : ''}
                        </span>
                        {m ? (
                          <span
                            className={cn('rounded border px-1.5 text-[11px]', m.className)}
                            title={m.hint}
                            data-testid="match-badge"
                          >
                            {m.label}
                            {match?.entry && match.kind !== 'new' ? ` · ${match.entry.name}` : ''}
                          </span>
                        ) : null}
                      </div>
                      {detail?.description || c.description ? (
                        <p className="text-[12px] text-muted-foreground">
                          {detail?.description || c.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(attrs).map(([k, v]) => (
                          <span key={k} className="rounded bg-muted px-1.5 text-[11px]">
                            {human(k)}: {human(v)}
                          </span>
                        ))}
                        {Object.entries(dims).map(([k, v]) => (
                          <span
                            key={k}
                            className="rounded border border-status-inferred/50 px-1.5 text-[11px]"
                            title={
                              c.measurementSource === 'pattern'
                                ? 'Read from your pattern'
                                : 'AI estimate'
                            }
                          >
                            {human(k)}: {Math.round(v)} mm{' '}
                            {c.measurementSource === 'pattern' ? '(pattern)' : '(est.)'}
                          </span>
                        ))}
                      </div>
                      {!isBody ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <SimpleSelect
                            aria-label={`Use for ${c.name}`}
                            className="h-8 w-56"
                            value={decision}
                            onValueChange={(v) =>
                              setDecisions((s) => ({ ...s, [c.key]: v as Decision }))
                            }
                            options={[
                              { value: 'ai', label: 'Use the AI result' },
                              ...(match?.entry && match.kind !== 'new'
                                ? [{ value: 'library', label: `Use library: ${match.entry.name}` }]
                                : []),
                              { value: 'skip', label: 'Leave it out' },
                            ]}
                          />
                          {d.fabrics.length ? (
                            <SimpleSelect
                              aria-label={`Fabric for ${c.name}`}
                              className="h-8 w-48"
                              value={fabrics[c.key] ?? '__none'}
                              onValueChange={(v) =>
                                setFabrics((s) => ({ ...s, [c.key]: v === '__none' ? null : v }))
                              }
                              options={fabricOptions}
                            />
                          ) : null}
                        </div>
                      ) : d.fabrics.length ? (
                        <SimpleSelect
                          aria-label={`Fabric for ${c.name}`}
                          className="h-8 w-48"
                          value={fabrics[c.key] ?? '__none'}
                          onValueChange={(v) =>
                            setFabrics((s) => ({ ...s, [c.key]: v === '__none' ? null : v }))
                          }
                          options={fabricOptions}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {d.patternPieces.length ? (
            <section className="flex flex-col gap-2" aria-label="Pattern pieces">
              <h2 className="text-sm font-semibold">Pattern pieces read from your images</h2>
              <ul className="flex flex-wrap gap-3">
                {d.patternPieces.map((p, i) => (
                  <li
                    key={i}
                    className="flex w-32 flex-col items-center gap-1 rounded-lg border p-2"
                  >
                    <svg
                      viewBox="-0.05 -0.05 1.1 1.1"
                      className="size-24"
                      aria-label={p.name}
                      role="img"
                    >
                      <polygon
                        points={p.outline.map((pt) => `${pt.x},${pt.y}`).join(' ')}
                        fill="#f1f5f9"
                        stroke="#334155"
                        strokeWidth={0.01}
                      />
                    </svg>
                    <span className="text-center text-[12px]">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.widthMm && p.heightMm
                        ? `${Math.round(p.widthMm)} × ${Math.round(p.heightMm)} mm`
                        : 'size unknown'}
                      {p.cutQuantity > 1 ? ` · cut ${p.cutQuantity}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="flex flex-col gap-5">
          {d.fabrics.length ? (
            <section className="flex flex-col gap-2" aria-label="Fabrics">
              <h2 className="text-sm font-semibold">Fabrics</h2>
              <ul className="flex flex-col gap-2">
                {d.fabrics.map((f) => {
                  const src =
                    f.imageIndex !== null ? analysis.inputs[f.imageIndex]?.assetId : undefined;
                  return (
                    <li
                      key={f.key}
                      className="flex gap-2 rounded-lg border p-2"
                      data-testid="analysis-fabric"
                    >
                      {src ? (
                        <AssetImg
                          orgId={active.id}
                          assetId={src}
                          alt={f.name}
                          className="size-12"
                        />
                      ) : (
                        <span
                          className="size-12 rounded-md border"
                          style={{ background: f.color ?? '#eee' }}
                        />
                      )}
                      <div className="flex min-w-0 flex-col text-[12px]">
                        <span className="flex items-center gap-1.5 font-medium">
                          {f.color ? (
                            <span
                              className="inline-block size-3 rounded-full border"
                              style={{ background: f.color }}
                            />
                          ) : null}
                          {f.name}
                        </span>
                        <span className="text-muted-foreground">
                          {[
                            f.pattern,
                            f.texture,
                            f.weight !== 'unknown' ? `${f.weight} weight` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {f.likelyMaterial ? (
                          <span className="text-muted-foreground">
                            Likely {f.likelyMaterial} (unconfirmed)
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {d.missingInformation.length ? (
            <section className="flex flex-col gap-2" aria-label="Still missing">
              <h2 className="text-sm font-semibold">Still missing</h2>
              <ul className="list-disc pl-4 text-[12px] text-muted-foreground">
                {d.missingInformation.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-3 rounded-lg border p-3" aria-label="Create design">
            {analysis.designId ? (
              <>
                <p className="flex items-center gap-1.5 text-[13px]">
                  <CheckCircle2Icon className="size-4 text-status-confirmed" /> A design was created
                  from this analysis.
                </p>
                <Button asChild>
                  <Link href={`/projects/${projectId}/designs/${analysis.designId}`}>
                    Open the design
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="design-name">Design name</Label>
                  <Input
                    id="design-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={saveToLibrary}
                    onChange={(e) => setSaveToLibrary(e.target.checked)}
                  />
                  <span>
                    <LibraryIcon className="mr-1 inline size-3.5" />
                    Save new components and fabrics to the library for reuse
                  </span>
                </label>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || create.isPending || !can('design.create')}
                  data-testid="create-design-button"
                >
                  <SparklesIcon />{' '}
                  {create.isPending ? 'Creating…' : 'Create design and open editor'}
                </Button>
                {create.isError ? (
                  <p role="alert" className="text-[13px] text-destructive">
                    {create.error.message}
                  </p>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
