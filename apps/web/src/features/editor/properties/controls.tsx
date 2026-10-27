'use client';

import type { PropertyDefinition, PropertyValue } from '@ai-designer/garment-model';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  type DisplayLengthUnit,
  enumLabel,
  enumOptions,
  formatForInput,
  parseInput,
  summarize,
} from './value-input';

export interface ControlProps {
  def: PropertyDefinition;
  pv: PropertyValue | undefined;
  unit: DisplayLengthUnit;
  disabled: boolean;
  /** Called with a validated value; returns false if the change was refused. */
  onCommit: (value: unknown, unit: string | null) => void;
  /** Local validation error to show (cleared on next commit). */
  onInvalid: (message: string | null) => void;
  describedBy?: string;
  invalid?: boolean;
}

/**
 * Control factory: property definition → control (NFR-EDT-009: new categories need no UI code).
 * Text-like controls commit on Enter or blur (one operation per edit, not per keystroke); choices
 * commit immediately.
 */
export function PropertyControl(props: ControlProps) {
  const { def } = props;
  switch (def.ui.control === 'select' || def.dataType === 'enum' ? 'select' : def.dataType) {
    case 'select':
      return <EnumControl {...props} />;
    case 'dimension':
    case 'number':
    case 'text':
      return <TextLikeControl {...props} />;
    case 'color':
      return <ColorControl {...props} />;
    case 'boolean':
      return <BooleanControl {...props} />;
    case 'composition':
      return <CompositionControl {...props} />;
    default:
      return (
        <span className="text-[12px] text-muted-foreground" data-readonly>
          {summarize(def, props.pv, props.unit)}
        </span>
      );
  }
}

function commitParsed(props: ControlProps, raw: unknown) {
  const parsed = parseInput(props.def, raw, props.unit);
  if (!parsed.ok) {
    props.onInvalid(parsed.message);
    return;
  }
  props.onInvalid(null);
  props.onCommit(parsed.value, parsed.unit);
}

function EnumControl(props: ControlProps) {
  const { def, pv, disabled } = props;
  const current = typeof pv?.value === 'string' ? pv.value : '';
  return (
    <SimpleSelect
      aria-label={def.label}
      value={current}
      disabled={disabled}
      placeholder="Not set"
      className="h-7 text-[13px]"
      onValueChange={(v) => v !== current && commitParsed(props, v)}
      options={enumOptions(def).map((v) => ({ value: v, label: enumLabel(v) }))}
      {...(props.describedBy ? { 'aria-describedby': props.describedBy } : {})}
      {...(props.invalid ? { 'aria-invalid': true } : {})}
    />
  );
}

function TextLikeControl(props: ControlProps) {
  const { def, pv, unit, disabled } = props;
  const initial = formatForInput(def, pv, unit);
  const [text, setText] = useState(initial);
  // Server state changed (undo, another person) → show it unless the person is typing.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(initial);
  }, [initial, editing]);
  const commit = () => {
    setEditing(false);
    if (text.trim() === initial) return props.onInvalid(null);
    commitParsed(props, text);
  };
  const numeric = def.dataType !== 'text';
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={def.label}
        value={text}
        disabled={disabled}
        inputMode={numeric ? 'decimal' : 'text'}
        placeholder="Not set"
        className={cn('h-7 text-[13px]', numeric && 'tabular-nums')}
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        onFocus={() => setEditing(true)}
        onChange={(e) => {
          setEditing(true);
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setText(initial);
            setEditing(false);
            props.onInvalid(null);
          }
        }}
      />
      {def.dataType === 'dimension' ? (
        <span className="w-6 text-[11px] text-muted-foreground">{unit}</span>
      ) : def.unitKind === 'mass_area' ? (
        <span className="w-6 text-[11px] text-muted-foreground">gsm</span>
      ) : null}
    </div>
  );
}

function ColorControl(props: ControlProps) {
  const { def, pv, disabled } = props;
  const current = typeof pv?.value === 'string' ? pv.value : '';
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={`${def.label} picker`}
        value={current || '#ffffff'}
        disabled={disabled}
        className="h-7 w-8 cursor-pointer rounded border bg-transparent p-0.5 disabled:cursor-not-allowed"
        // `change` fires when the picker closes: one operation per choice.
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => e.target.value !== current && commitParsed(props, e.target.value)}
      />
      <Input
        aria-label={`${def.label} code`}
        value={text}
        disabled={disabled}
        placeholder="#RRGGBB"
        className="h-7 w-24 font-mono text-[12px]"
        aria-invalid={props.invalid || undefined}
        aria-describedby={props.describedBy}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== current && commitParsed(props, text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (text !== current) commitParsed(props, text);
          }
        }}
      />
    </div>
  );
}

function BooleanControl(props: ControlProps) {
  const { def, pv, disabled } = props;
  const value = pv?.value === true;
  return (
    <input
      type="checkbox"
      aria-label={def.label}
      checked={value}
      disabled={disabled}
      className="size-4"
      onChange={(e) => commitParsed(props, e.target.checked)}
    />
  );
}

interface Part {
  fiber: string;
  percent: string;
}

/** Fibre composition: rows of fibre + percent; must add up to 100 before it is saved. */
function CompositionControl(props: ControlProps) {
  const { def, pv, disabled } = props;
  const id = useId();
  const stored = Array.isArray(pv?.value)
    ? (pv.value as { fiber: string; percent: number }[]).map((p) => ({
        fiber: p.fiber,
        percent: String(p.percent),
      }))
    : [];
  const [parts, setParts] = useState<Part[]>(stored.length ? stored : [{ fiber: '', percent: '' }]);
  const total = parts.reduce((s, p) => s + (Number(p.percent) || 0), 0);
  const save = () =>
    commitParsed(
      props,
      parts
        .filter((p) => p.fiber.trim())
        .map((p) => ({ fiber: p.fiber.trim(), percent: Number(p.percent) })),
    );
  return (
    <div className="flex flex-col gap-1" role="group" aria-label={def.label}>
      {parts.map((p, i) => (
        <div key={`${id}-${String(i)}`} className="flex items-center gap-1">
          <Input
            aria-label={`Fibre ${i + 1}`}
            value={p.fiber}
            disabled={disabled}
            placeholder="cotton"
            className="h-7 flex-1 text-[13px]"
            onChange={(e) =>
              setParts(parts.map((x, j) => (j === i ? { ...x, fiber: e.target.value } : x)))
            }
          />
          <Input
            aria-label={`Percent ${i + 1}`}
            value={p.percent}
            disabled={disabled}
            inputMode="decimal"
            className="h-7 w-14 text-[13px] tabular-nums"
            onChange={(e) =>
              setParts(parts.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))
            }
          />
          <span className="text-[11px] text-muted-foreground">%</span>
          <button
            type="button"
            aria-label={`Remove fibre ${i + 1}`}
            disabled={disabled || parts.length === 1}
            className="text-muted-foreground disabled:opacity-40"
            onClick={() => setParts(parts.filter((_, j) => j !== i))}
          >
            <Trash2Icon className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-xs"
          disabled={disabled}
          onClick={() => setParts([...parts, { fiber: '', percent: '' }])}
        >
          <PlusIcon /> Fibre
        </Button>
        <span
          className={cn(
            'text-[11px]',
            Math.abs(total - 100) < 0.01 ? 'text-muted-foreground' : 'text-status-missing',
          )}
        >
          Total {total}%
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-6 px-2 text-xs"
          disabled={disabled}
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
