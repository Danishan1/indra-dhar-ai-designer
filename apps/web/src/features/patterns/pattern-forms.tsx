'use client';

import {
  type BodyMeasurementKey,
  type CustomSizeChart,
  type PatternAudience,
  type PatternFamily,
  type PatternSpec,
  type SizeSystem,
} from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  convertSize,
  defaultSizeFor,
  defaultStyle,
  measurementsForSpec,
  resolve,
  type SeamCheck,
  SIZE_SYSTEM_LABELS,
  sizeLabel,
  sizesFor,
  specMeasurements,
} from '@ai-designer/pattern-model';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, CircleAlertIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { useOrganization } from '@/features/organizations/organization-provider';
import { sizeChartsApi } from '@/features/sizes/api';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';

import { AUDIENCE_LABEL, FAMILY_LABEL, fieldsFor, fmt, parseLength, type Unit } from './options';

/** The organization's size charts for an audience, as spec snapshots (ADR-067). */
export function useCustomCharts(audience: PatternAudience): CustomSizeChart[] {
  const { active } = useOrganization();
  const charts = useQuery({
    queryKey: queryKeys.org(active.id).sizeCharts(),
    queryFn: ({ signal }) => sizeChartsApi.list(active.id, signal),
    staleTime: 60_000,
  });
  return (charts.data?.items ?? [])
    .filter((c) => c.audience === audience)
    .map((c) => ({
      id: c.id,
      name: c.name,
      audience: c.audience,
      sizes: c.sizes.map((x) => ({ label: x.label, body: x.body })),
    }));
}

const STANDARD_SYSTEMS: Exclude<SizeSystem, 'custom'>[] = ['intl', 'uk', 'us', 'eu'];

/**
 * Garment type, who it is for, size standard and size (ADR-067) — changing the family resets the
 * style to its defaults; changing the standard keeps about the same size; a custom chart is copied
 * into the spec.
 */
export function GarmentBasics({
  spec,
  onChange,
  disabled,
}: {
  spec: PatternSpec;
  onChange: (next: PatternSpec, label: string) => void;
  disabled?: boolean;
}) {
  const custom = useCustomCharts(spec.audience);
  const system = spec.sizeSystem ?? 'intl';
  const systemValue = system === 'custom' ? `custom:${spec.customChart?.id ?? ''}` : system;
  const systemOptions = [
    ...STANDARD_SYSTEMS.map((s) => ({ value: s, label: SIZE_SYSTEM_LABELS[s] })),
    ...custom.map((c) => ({ value: `custom:${c.id}`, label: c.name })),
    // A chart copied earlier that was since deleted or renamed stays selectable.
    ...(system === 'custom' &&
    spec.customChart &&
    !custom.some((c) => c.id === spec.customChart!.id)
      ? [{ value: systemValue, label: `${spec.customChart.name} (copy)` }]
      : []),
  ];
  const setSystem = (value: string) => {
    const nextChart = value.startsWith('custom:')
      ? (custom.find((c) => `custom:${c.id}` === value) ?? spec.customChart ?? null)
      : null;
    const to: SizeSystem = nextChart ? 'custom' : (value as SizeSystem);
    const size = convertSize(
      spec.audience,
      { system, size: spec.size, custom: spec.customChart ?? null },
      { system: to, custom: nextChart },
    );
    const next: PatternSpec = { ...spec, sizeSystem: to, size };
    if (nextChart) next.customChart = nextChart;
    else delete next.customChart;
    onChange(next, `Sizes: ${nextChart?.name ?? SIZE_SYSTEM_LABELS[to]} ${size}`);
  };
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="garment-basics">
      <div className="flex flex-col gap-1">
        <Label className="text-[12px]">Garment</Label>
        <SimpleSelect
          aria-label="Garment type"
          value={spec.family}
          disabled={disabled}
          onValueChange={(v) => {
            const family = v as PatternFamily;
            onChange(
              {
                ...spec,
                family,
                style: {
                  ...spec.style,
                  ...defaultStyle(family, spec.audience),
                } as PatternSpec['style'],
              },
              `Garment type: ${FAMILY_LABEL[family]}`,
            );
          }}
          options={Object.entries(FAMILY_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[12px]">For</Label>
        <SimpleSelect
          aria-label="Who it is for"
          value={spec.audience}
          disabled={disabled}
          onValueChange={(v) => {
            const audience = v as PatternAudience;
            // A custom chart belongs to one audience: fall back to International for another.
            const sys: SizeSystem = system === 'custom' ? 'intl' : system;
            const sizes = sizesFor(audience, sys);
            const next: PatternSpec = {
              ...spec,
              audience,
              sizeSystem: sys,
              size: sizes.includes(spec.size) ? spec.size : defaultSizeFor(audience, sys),
              body: {},
            };
            delete next.customChart;
            onChange(next, `For: ${AUDIENCE_LABEL[audience]}`);
          }}
          options={Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[12px]">Size standard</Label>
        <SimpleSelect
          aria-label="Size standard"
          value={systemValue}
          disabled={disabled}
          onValueChange={setSystem}
          options={systemOptions}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[12px]">Size</Label>
        <SimpleSelect
          aria-label="Size"
          value={spec.size}
          disabled={disabled}
          onValueChange={(size) =>
            onChange({ ...spec, size, body: {} }, `Size ${sizeLabel({ ...spec, size })}`)
          }
          options={sizesFor(spec.audience, system, spec.customChart ?? null).map((s) => ({
            value: s,
            label: s,
          }))}
        />
      </div>
    </div>
  );
}

/** Style options valid for the family. */
export function StyleForm({
  spec,
  onChange,
  disabled,
  highlight,
  unsure,
}: {
  spec: PatternSpec;
  onChange: (next: PatternSpec, label: string) => void;
  disabled?: boolean;
  /** Fields the AI read from the sketch (marked). */
  highlight?: ReadonlySet<string>;
  /** Fields the AI guessed (marked "check"). */
  unsure?: ReadonlySet<string>;
}) {
  const fields = fieldsFor(spec.family, spec.style);
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2" data-testid="style-form">
      {fields.map((f) => {
        const value = spec.style[f.key];
        const set = (v: unknown, text: string) =>
          onChange(
            {
              ...spec,
              style: {
                ...spec.style,
                [f.key]: v,
                ...(f.key === 'length' ? { lengthMm: null } : {}),
                ...(f.key === 'sleeve' ? { sleeveLengthMm: null } : {}),
              },
            },
            `${f.label}: ${text}`,
          );
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <Label className="flex items-center gap-1 text-[12px]">
              {f.label}
              {highlight?.has(f.key) ? (
                <span
                  className="rounded bg-primary/10 px-1 text-[10px] text-primary"
                  title="Read from your sketch"
                >
                  sketch
                </span>
              ) : null}
              {unsure?.has(f.key) ? (
                <span
                  className="rounded bg-status-needs-review/15 px-1 text-[10px] text-status-needs-review"
                  title="The AI was not sure — check this against your design"
                  data-testid={`unsure-${f.key}`}
                >
                  check
                </span>
              ) : null}
            </Label>
            {f.kind === 'count' ? (
              <SimpleSelect
                aria-label={f.label}
                value={value === null || value === undefined ? 'auto' : String(value)}
                disabled={disabled}
                onValueChange={(v) => set(v === 'auto' ? null : Number(v), v)}
                options={[
                  ...(f.key === 'buttons' ? [{ value: 'auto', label: 'Automatic' }] : []),
                  ...Array.from({ length: (f.max ?? 5) - (f.min ?? 0) + 1 }, (_, i) => {
                    const n = (f.min ?? 0) + i;
                    return { value: String(n), label: n === 0 ? 'None' : String(n) };
                  }),
                ]}
              />
            ) : f.kind === 'multi' ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label={f.label}>
                {Object.entries(f.options ?? {}).map(([v, label]) => {
                  const list = Array.isArray(value) ? (value as string[]) : [];
                  const on = list.includes(v);
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={disabled}
                      aria-pressed={on}
                      onClick={() =>
                        set(
                          on ? list.filter((x) => x !== v) : [...list, v],
                          `${label} ${on ? 'off' : 'on'}`,
                        )
                      }
                      className={cn(
                        'h-7 rounded-md border px-2 text-[12px]',
                        on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : f.kind === 'boolean' ? (
              <SimpleSelect
                aria-label={f.label}
                value={value ? 'yes' : 'no'}
                disabled={disabled}
                onValueChange={(v) => set(v === 'yes', v === 'yes' ? 'yes' : 'no')}
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
              />
            ) : (
              <SimpleSelect
                aria-label={f.label}
                value={String(value)}
                disabled={disabled}
                onValueChange={(v) => set(v, f.options?.[v] ?? v)}
                options={Object.entries(f.options ?? {}).map(([v, label]) => ({ value: v, label }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LengthInput({
  label,
  valueMm,
  placeholderMm,
  unit,
  onCommit,
  onReset,
  disabled,
  edited,
  testId,
}: {
  label: string;
  valueMm: number;
  placeholderMm?: number;
  unit: Unit;
  onCommit: (mm: number) => void;
  onReset?: () => void;
  disabled?: boolean;
  edited?: boolean;
  testId?: string;
}) {
  const [text, setText] = useState(fmt(valueMm, unit));
  useEffect(() => setText(fmt(valueMm, unit)), [valueMm, unit]);
  const commit = () => {
    const mm = parseLength(text, unit);
    if (mm === null) setText(fmt(valueMm, unit));
    else if (Math.abs(mm - valueMm) > 0.4) onCommit(Math.round(mm * 10) / 10);
  };
  return (
    <div className="grid grid-cols-[1fr_88px_20px] items-center gap-2 text-[12px]">
      <span className={cn(edited && 'font-semibold')}>{label}</span>
      <Input
        aria-label={label}
        className="h-7 text-right text-[12px]"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholderMm ? fmt(placeholderMm, unit) : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        data-testid={testId}
      />
      {edited && onReset ? (
        <button
          type="button"
          aria-label={`Reset ${label}`}
          title="Back to the size chart"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Body measurements (size chart + your changes), ease and finished lengths. */
export function MeasurementsForm({
  spec,
  onChange,
  unit,
  disabled,
}: {
  spec: PatternSpec;
  onChange: (next: PatternSpec, label: string) => void;
  unit: Unit;
  disabled?: boolean;
}) {
  const chart = specMeasurements(spec);
  const ctx = resolve(spec);
  const keys = measurementsForSpec(spec);
  const setBody = (key: BodyMeasurementKey, mm: number | null) => {
    const body = { ...spec.body };
    if (mm === null) delete body[key];
    else body[key] = mm;
    onChange(
      { ...spec, body },
      `${BODY_LABELS[key]} ${mm === null ? 'reset' : `${fmt(mm, unit)} ${unit}`}`,
    );
  };
  return (
    <div className="flex flex-col gap-3" data-testid="measurements-form">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Body ({unit}) — size {sizeLabel(spec)}
        </h3>
        {keys.map((key) => (
          <LengthInput
            key={key}
            label={BODY_LABELS[key]}
            valueMm={spec.body[key] ?? chart[key] ?? 0}
            unit={unit}
            disabled={disabled}
            edited={spec.body[key] !== undefined}
            onCommit={(mm) => setBody(key, mm)}
            onReset={() => setBody(key, null)}
            testId={`body-${key}`}
          />
        ))}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Ease and finish ({unit})
        </h3>
        {(['bust', 'waist', 'hip'] as const)
          .filter((k) => keys.includes(k))
          .map((k) => (
            <LengthInput
              key={k}
              label={`Ease at ${k === 'bust' ? 'bust / chest' : k}`}
              valueMm={ctx.ease[k]}
              unit={unit}
              disabled={disabled}
              edited={spec.ease[k] !== null}
              onCommit={(mm) =>
                onChange({ ...spec, ease: { ...spec.ease, [k]: mm } }, `Ease at ${k}`)
              }
              onReset={() =>
                onChange({ ...spec, ease: { ...spec.ease, [k]: null } }, `Ease at ${k} reset`)
              }
            />
          ))}
        <LengthInput
          label="Seam allowance"
          valueMm={spec.seamAllowanceMm}
          unit={unit}
          disabled={disabled}
          onCommit={(mm) =>
            onChange({ ...spec, seamAllowanceMm: Math.min(50, mm) }, 'Seam allowance')
          }
        />
        <LengthInput
          label="Hem allowance"
          valueMm={spec.hemAllowanceMm}
          unit={unit}
          disabled={disabled}
          onCommit={(mm) =>
            onChange({ ...spec, hemAllowanceMm: Math.min(100, mm) }, 'Hem allowance')
          }
        />
      </section>
    </div>
  );
}

export function ChecksList({ checks, unit }: { checks: readonly SeamCheck[]; unit: Unit }) {
  if (!checks.length)
    return <p className="text-[12px] text-muted-foreground">No seams to compare.</p>;
  return (
    <ul className="flex flex-col gap-1.5" data-testid="seam-checks">
      {checks.map((c) => (
        <li
          key={c.id}
          className="flex items-start gap-2 text-[12px]"
          data-status={c.status}
          title={c.hint}
        >
          {c.status === 'ok' ? (
            <CheckCircle2Icon
              className="mt-0.5 size-3.5 shrink-0 text-status-confirmed"
              aria-label="fits"
            />
          ) : c.status === 'warning' ? (
            <TriangleAlertIcon
              className="mt-0.5 size-3.5 shrink-0 text-status-needs-review"
              aria-label="check"
            />
          ) : (
            <CircleAlertIcon
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
              aria-label="does not fit"
            />
          )}
          <span className="flex-1">
            {c.label}
            <span className="block text-muted-foreground">
              {fmt(c.a, unit)} ↔ {fmt(c.b, unit)} {unit} · difference {c.difference > 0 ? '+' : ''}
              {fmt(c.difference, unit)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <div role="group" aria-label="Units" className="flex rounded-md border p-0.5">
      {(['cm', 'mm', 'in'] as const).map((u) => (
        <Button
          key={u}
          size="sm"
          variant="ghost"
          aria-pressed={unit === u}
          className={cn('h-6 px-2 text-xs', unit === u && 'bg-accent')}
          onClick={() => onChange(u)}
        >
          {u}
        </Button>
      ))}
    </div>
  );
}
