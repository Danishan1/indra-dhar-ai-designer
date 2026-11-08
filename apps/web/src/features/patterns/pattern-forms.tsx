'use client';

import {
  type BodyMeasurementKey,
  type PatternAudience,
  type PatternFamily,
  type PatternSpec,
} from '@ai-designer/garment-model';
import {
  BODY_LABELS,
  defaultStyle,
  MEASUREMENTS_FOR_FAMILY,
  measurementsFor,
  resolve,
  type SeamCheck,
  sizesFor,
} from '@ai-designer/pattern-model';
import { CheckCircle2Icon, CircleAlertIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { AUDIENCE_LABEL, FAMILY_LABEL, fieldsFor, fmt, parseLength, type Unit } from './options';

/** Garment type, who it is for, size — changing the family resets the style to its defaults. */
export function GarmentBasics({
  spec,
  onChange,
  disabled,
}: {
  spec: PatternSpec;
  onChange: (next: PatternSpec, label: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="garment-basics">
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
            const sizes = sizesFor(audience);
            onChange(
              {
                ...spec,
                audience,
                size: sizes.includes(spec.size) ? spec.size : sizes[Math.floor(sizes.length / 2)]!,
                body: {},
              },
              `For: ${AUDIENCE_LABEL[audience]}`,
            );
          }}
          options={Object.entries(AUDIENCE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-[12px]">Size</Label>
        <SimpleSelect
          aria-label="Size"
          value={spec.size}
          disabled={disabled}
          onValueChange={(size) => onChange({ ...spec, size, body: {} }, `Size ${size}`)}
          options={sizesFor(spec.audience).map((s) => ({ value: s, label: s }))}
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
            {f.kind === 'boolean' ? (
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
  const chart = measurementsFor(spec.audience, spec.size);
  const ctx = resolve(spec);
  const keys = MEASUREMENTS_FOR_FAMILY[spec.family] ?? [];
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
          Body ({unit}) — size {spec.size}
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
