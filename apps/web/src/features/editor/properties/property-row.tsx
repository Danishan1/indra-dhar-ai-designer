'use client';

import type { ValueStatus } from '@ai-designer/contracts';
import type { PropertyDefinition, PropertyValue } from '@ai-designer/garment-model';
import { AlertTriangleIcon, InfoIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ValueStatusBadge } from '@/components/value-status-badge';
import { cn } from '@/lib/utils';

import { useEditor } from '../store-context';

import { PropertyControl } from './controls';
import type { DisplayLengthUnit } from './value-input';

const SOURCE_LABELS: Record<string, string> = {
  none: 'No source',
  user_input: 'Typed by a person',
  template: 'Template suggestion',
  uploaded_reference: 'Uploaded reference',
  specification_document: 'Specification document',
  artifact_revision: 'Artifact',
  ai_interpretation: 'AI interpretation',
  ai_generation: 'AI generation',
  imported_data: 'Imported data',
  measurement_record: 'Measurement record',
  external_system: 'External system',
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export interface RowTarget {
  componentId: string;
  label: string;
}

/**
 * One property: label, control, status badge with provenance and review actions (FR-EDT-034/035/037),
 * the reason when a rule makes it not applicable (FR-EDT-033) and refusals inline (FR-EDT-030).
 * With several targets (bulk edit) the change is applied to each of them in one step.
 */
export function PropertyRow({
  def,
  pv,
  targets,
  unit,
  editable,
  disabledReason,
  conflict,
  mixed,
}: {
  def: PropertyDefinition;
  pv: PropertyValue | undefined;
  targets: RowTarget[];
  unit: DisplayLengthUnit;
  editable: boolean;
  disabledReason: string | null;
  conflict: boolean;
  /** Bulk edit: the targets currently hold different values. */
  mixed?: boolean;
}) {
  const apply = useEditor((s) => s.apply);
  const refusals = useEditor(
    useShallow((s) => targets.flatMap((t) => s.refusals[`${t.componentId}|${def.key}`] ?? [])),
  );
  const warnings = useEditor(
    useShallow((s) =>
      s.findings.filter(
        (f) =>
          f.outcome !== 'valid' &&
          targets.some((t) => f.entity?.entityId === t.componentId) &&
          (f.path?.includes(def.key) ?? false),
      ),
    ),
  );
  const [invalid, setInvalid] = useState<string | null>(null);
  const messageId = useId();
  const status = (pv?.status ?? 'missing') as ValueStatus;

  // One step for all targets (bulk edit groups them into one undo step).
  const change = (op: Record<string, unknown>, label: string) => {
    const groupId = targets.length > 1 ? `bulk:${def.key}:${Date.now()}` : null;
    for (const t of targets)
      apply({ ...op, componentId: t.componentId, key: def.key } as never, { label, groupId });
  };

  const messages = [...(invalid ? [invalid] : []), ...new Set(refusals)];
  return (
    <div
      className={cn('flex flex-col gap-1 px-3 py-1.5', disabledReason && 'opacity-70')}
      data-property={def.key}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
          {def.label}
          {def.manufacturingCritical ? (
            <span
              title="Manufacturing-critical: keep evidence and review"
              className="text-status-needs-review"
            >
              *
            </span>
          ) : null}
        </span>
        {mixed ? (
          <span className="text-[11px] text-muted-foreground">Mixed values</span>
        ) : (
          <StatusPopover
            def={def}
            pv={pv}
            status={status}
            editable={editable}
            onAction={(op, label) => change(op, label)}
          />
        )}
      </div>
      <PropertyControl
        def={def}
        pv={mixed ? undefined : pv}
        unit={unit}
        disabled={!editable || !!disabledReason}
        describedBy={messages.length || disabledReason ? messageId : undefined}
        invalid={messages.length > 0}
        onInvalid={setInvalid}
        onCommit={(value, u) =>
          change({ type: 'set_property', value, unit: u }, `Set ${def.label.toLowerCase()}`)
        }
      />
      <div id={messageId} className="flex flex-col gap-0.5 text-[11px]">
        {disabledReason ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <InfoIcon className="size-3" aria-hidden /> {disabledReason}
            {conflict ? ' — a value is still set here.' : ''}
          </span>
        ) : null}
        {messages.map((m) => (
          <span key={m} role="alert" className="flex items-center gap-1 text-destructive">
            <AlertTriangleIcon className="size-3" aria-hidden /> {m}
          </span>
        ))}
        {warnings.map((w, i) => (
          <span
            key={`${w.ruleId}-${String(i)}`}
            className="flex items-center gap-1 text-status-needs-review"
          >
            <AlertTriangleIcon className="size-3" aria-hidden /> {w.message}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusPopover({
  def,
  pv,
  status,
  editable,
  onAction,
}: {
  def: PropertyDefinition;
  pv: PropertyValue | undefined;
  status: ValueStatus;
  editable: boolean;
  onAction: (op: Record<string, unknown>, label: string) => void;
}) {
  const userId = useEditor((s) => s.meta.userId);
  const [open, setOpen] = useState(false);
  const hasValue = pv?.value !== null && pv?.value !== undefined;
  const act = (op: Record<string, unknown>, label: string) => {
    onAction(op, label);
    setOpen(false);
  };
  const lower = def.label.toLowerCase();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${def.label}: ${status.replaceAll('_', ' ')} — details`}
          className="rounded"
        >
          <ValueStatusBadge status={status} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 text-[12px]"
        aria-label={`${def.label} provenance`}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <ValueStatusBadge status={status} />
          </dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd data-testid="provenance-source">
            {SOURCE_LABELS[pv?.sourceType ?? 'none'] ?? pv?.sourceType}
          </dd>
          {pv?.confidence !== null && pv?.confidence !== undefined ? (
            <>
              <dt className="text-muted-foreground">Confidence</dt>
              <dd>{Math.round(pv.confidence * 100)}% (informational)</dd>
            </>
          ) : null}
          {pv?.confirmedBy ? (
            <>
              <dt className="text-muted-foreground">Confirmed</dt>
              <dd data-testid="provenance-confirmed">
                {pv.confirmedBy === userId ? 'by you' : 'by a team member'}
                {pv.confirmedAt ? `, ${when(pv.confirmedAt)}` : ''}
              </dd>
            </>
          ) : null}
          {pv?.sourceRefs.length ? (
            <>
              <dt className="text-muted-foreground">Evidence</dt>
              <dd>{pv.sourceRefs.length} reference(s)</dd>
            </>
          ) : null}
        </dl>
        {editable ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {hasValue && status !== 'confirmed' ? (
              <Button
                size="sm"
                className="h-7"
                onClick={() =>
                  act({ type: 'set_property_status', action: 'confirm' }, `Confirm ${lower}`)
                }
              >
                Confirm
              </Button>
            ) : null}
            {hasValue && status !== 'needs_review' ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() =>
                  act({ type: 'set_property_status', action: 'needs_review' }, `Review ${lower}`)
                }
              >
                Needs review
              </Button>
            ) : null}
            {status !== 'not_applicable' ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() =>
                  act(
                    { type: 'set_property_status', action: 'not_applicable' },
                    `${def.label}: not applicable`,
                  )
                }
              >
                Not applicable
              </Button>
            ) : null}
            {hasValue || status === 'not_applicable' ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => act({ type: 'reset_property' }, `Clear ${lower}`)}
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
