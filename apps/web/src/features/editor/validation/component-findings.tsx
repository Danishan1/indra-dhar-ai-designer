'use client';

import { FindingKindIcon, KIND_LABELS, KIND_ORDER, kindOf } from './severity';
import { useComponentFindings, useValidation } from './validation-context';

/** Findings about the selected component, at the top of its properties (FR-EDT-117/122). */
export function ComponentFindings({ componentId }: { componentId: string }) {
  const findings = useComponentFindings(componentId);
  const { stale } = useValidation();
  const shown = [...findings]
    .filter((f) => kindOf(f) !== 'info')
    .sort((a, b) => KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]);
  if (!shown.length) return null;
  return (
    <section
      aria-label="Validation findings for this component"
      className="mx-3 mt-2 flex flex-col gap-1 rounded-md border p-2 text-[12px]"
      data-testid="component-findings"
    >
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Design checks{stale ? ' (updating…)' : ''}
      </span>
      {shown.map((f) => (
        <div key={f.findingId} className="flex items-start gap-1.5" data-kind={kindOf(f)}>
          <FindingKindIcon kind={kindOf(f)} className="mt-px" />
          <div className="flex flex-col">
            <span>
              <span className="sr-only">{KIND_LABELS[kindOf(f)]}: </span>
              {f.message}
            </span>
            {f.resolution ? <span className="text-muted-foreground">→ {f.resolution}</span> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
