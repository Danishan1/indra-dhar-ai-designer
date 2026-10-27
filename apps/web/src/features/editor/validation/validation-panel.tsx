'use client';

import type { ValidationFindingView } from '@ai-designer/contracts';
import { CrosshairIcon, RefreshCwIcon, ShieldQuestionIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useLeftTab } from '@/features/editor/library/left-panel';
import { toApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils';

import { useRightTab } from '../right-panel';
import { useEditor, useEditorStore } from '../store-context';

import { type FindingKind, FindingKindIcon, KIND_LABELS, KIND_ORDER, kindOf } from './severity';
import { useValidation } from './validation-context';

const FILTERS: ('all' | FindingKind)[] = ['all', 'blocking', 'warning', 'review', 'info'];

/** The component a finding is about (relationships point at their target). */
function useFindingTarget() {
  const components = useEditor((s) => s.display.components);
  const relationships = useEditor((s) => s.display.relationships);
  return useMemo(() => {
    const byId = new Map(components.map((c) => [c.componentId, c]));
    const rels = new Map(relationships.map((r) => [r.relationshipId, r]));
    return (f: ValidationFindingView) => {
      if (!f.entity) return null;
      if (f.entity.entityType === 'design_component') return byId.get(f.entity.entityId) ?? null;
      if (f.entity.entityType === 'relationship') {
        const r = rels.get(f.entity.entityId);
        return r?.target.entityType === 'design_component'
          ? (byId.get(r.target.entityId) ?? null)
          : null;
      }
      return null;
    };
  }, [components, relationships]);
}

/**
 * Validation panel (FR-EDT-117…124): counts by severity, filters, findings with rule, explanation
 * and resolution, click to show the component, stale marker and re-run. Always labelled as design
 * structure validation — never production readiness (CST-006).
 */
export function ValidationPanel() {
  const store = useEditorStore();
  const { run, stale, checking, error, rerun } = useValidation();
  const targetOf = useFindingTarget();
  const [filter, setFilter] = useState<'all' | FindingKind>('all');
  const findings = useMemo(
    () => [...(run?.findings ?? [])].sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]),
    [run],
  );
  const counts = useMemo(() => {
    const c: Record<FindingKind, number> = { blocking: 0, warning: 0, review: 0, info: 0 };
    for (const f of findings) c[kindOf(f)]++;
    return c;
  }, [findings]);
  const shown = filter === 'all' ? findings : findings.filter((f) => kindOf(f) === filter);

  const show = (f: ValidationFindingView) => {
    const c = targetOf(f);
    if (!c) return;
    store.getState().closeInspect();
    store.getState().select(c.componentId, 'replace');
    useLeftTab.getState().setTab('parts');
    useRightTab.getState().setTab('properties');
  };

  return (
    <div className="flex h-full flex-col text-[12px]" data-testid="validation-panel">
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1">
        <span className="flex items-center gap-1 font-medium" data-testid="validation-scope">
          <ShieldQuestionIcon className="size-3.5" aria-hidden />
          Design structure validation
        </span>
        <span className="text-muted-foreground">— not production readiness</span>
        {run ? (
          <span className="text-muted-foreground" title="Constraint set and the version checked">
            · {run.constraintSet} · v{run.targetVersion}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Filter findings">
          {FILTERS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                filter === k ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/60',
              )}
              data-testid={`validation-filter-${k}`}
            >
              {k === 'all' ? (
                `All ${findings.length}`
              ) : (
                <>
                  <FindingKindIcon kind={k} /> {KIND_LABELS[k]} {counts[k]}
                </>
              )}
            </button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-xs"
            disabled={checking}
            onClick={rerun}
          >
            <RefreshCwIcon className={cn(checking && 'animate-spin')} aria-hidden /> Re-run
            validation
          </Button>
        </div>
      </div>
      {stale || checking ? (
        <p
          role="status"
          className="border-b bg-status-needs-review/10 px-2 py-1"
          data-testid="validation-stale"
        >
          {checking
            ? 'Checking the latest changes…'
            : `These results are from v${run?.targetVersion ?? '?'}; the design has changed since. They update automatically after saving.`}
        </p>
      ) : null}
      {error && !checking ? (
        <p role="alert" className="border-b px-2 py-1 text-destructive">
          Validation could not run: {toApiError(error).message}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {!run ? (
          <p className="p-2 text-muted-foreground">Not validated yet.</p>
        ) : shown.length === 0 ? (
          <p className="p-2 text-muted-foreground" data-testid="validation-empty">
            {findings.length
              ? 'Nothing in this filter.'
              : 'No findings. The design structure checks passed — this says nothing about production readiness.'}
          </p>
        ) : (
          <ul aria-label="Validation findings" className="divide-y">
            {shown.map((f) => {
              const target = targetOf(f);
              const kind = kindOf(f);
              return (
                <li
                  key={f.findingId}
                  className="flex items-start gap-2 px-2 py-1.5"
                  data-testid="validation-finding"
                  data-rule-id={f.ruleId}
                  data-kind={kind}
                  data-component-id={target?.componentId}
                >
                  <FindingKindIcon kind={kind} withLabel className="w-24 shrink-0 font-medium" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span>{f.message}</span>
                    {f.resolution ? (
                      <span className="text-muted-foreground">→ {f.resolution}</span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      {f.ruleId}@{f.ruleVersion}
                      {target ? ` · ${target.displayName}` : ' · whole design'}
                    </span>
                  </div>
                  {target ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs"
                      onClick={() => show(f)}
                    >
                      <CrosshairIcon aria-hidden /> Show
                      <span className="sr-only"> {target.displayName}</span>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Small count for the bottom-panel tab label. */
export function ValidationTabCount() {
  const { run, stale } = useValidation();
  if (!run) return null;
  const n = run.counts.errors + run.counts.warnings + run.counts.manualReview;
  if (!n) return null;
  return (
    <span
      className={cn(
        'ml-1 rounded-full px-1.5 text-[10px] tabular-nums',
        run.counts.errors ? 'bg-destructive/15 text-destructive' : 'bg-muted',
        stale && 'opacity-60',
      )}
      aria-label={`${run.counts.errors} blocking, ${run.counts.warnings} warnings, ${run.counts.manualReview} to review`}
    >
      {n}
    </span>
  );
}
