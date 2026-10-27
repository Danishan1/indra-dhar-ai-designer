/**
 * Property value ↔ form input (I17): formatting for display in the person's length unit and
 * validation BEFORE an operation is sent (FR-EDT-030, PROP-002). The server validates again and
 * converts lengths to mm; nothing here invents a value.
 */
import {
  compositionValueSchema,
  convertLength,
  defaultCatalog,
  isEnumValueAllowed,
  isLengthUnit,
  type LengthUnit,
  type PropertyDefinition,
  type PropertyValue,
} from '@ai-designer/garment-model';

export const DISPLAY_LENGTH_UNITS = ['mm', 'cm', 'in'] as const satisfies readonly LengthUnit[];
export type DisplayLengthUnit = (typeof DISPLAY_LENGTH_UNITS)[number];

const DECIMALS: Record<DisplayLengthUnit, number> = { mm: 1, cm: 2, in: 3 };
/** Largest length accepted from the editor (a sanity bound, 5 m). */
const MAX_LENGTH_MM = 5000;

export type ParsedInput =
  { ok: true; value: unknown; unit: string | null } | { ok: false; message: string };

const round = (n: number, places: number) => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

/** A stored length (any unit) shown in `unit`, e.g. 640 mm → "64" cm. */
export function formatLength(pv: PropertyValue | undefined, unit: DisplayLengthUnit): string {
  if (!pv || typeof pv.value !== 'number') return '';
  const from = pv.unit && isLengthUnit(pv.unit) ? pv.unit : 'mm';
  return String(round(convertLength(pv.value, from, unit), DECIMALS[unit]));
}

/** Text for an input field (lengths in the display unit). */
export function formatForInput(
  def: PropertyDefinition,
  pv: PropertyValue | undefined,
  unit: DisplayLengthUnit,
): string {
  if (!pv || pv.value === null || pv.value === undefined) return '';
  if (def.dataType === 'dimension') return formatLength(pv, unit);
  if (typeof pv.value === 'string' || typeof pv.value === 'number') return String(pv.value);
  return '';
}

/** Read-only summary of any value (composition, references…). */
export function summarize(
  def: PropertyDefinition,
  pv: PropertyValue | undefined,
  unit: DisplayLengthUnit,
): string {
  if (!pv || pv.value === null) return '—';
  if (def.dataType === 'dimension') return `${formatLength(pv, unit)} ${unit}`;
  if (def.dataType === 'composition' && Array.isArray(pv.value))
    return (pv.value as { fiber: string; percent: number }[])
      .map((p) => `${p.percent}% ${p.fiber}`)
      .join(', ');
  if (def.dataType === 'reference' && typeof pv.value === 'object') return 'Linked artifact';
  if (def.dataType === 'enum' && typeof pv.value === 'string') return enumLabel(pv.value);
  if (typeof pv.value === 'boolean') return pv.value ? 'Yes' : 'No';
  return String(pv.value);
}

export const enumLabel = (v: string) => {
  const t = v.replaceAll('_', ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function enumOptions(def: PropertyDefinition, catalog = defaultCatalog): string[] {
  return [...(def.enumValues ?? []), ...(catalog.enumExtensions.get(def.key) ?? [])];
}

/** Validates what the person typed; returns the value/unit for `set_property` or a message. */
export function parseInput(
  def: PropertyDefinition,
  raw: unknown,
  unit: DisplayLengthUnit,
  catalog = defaultCatalog,
): ParsedInput {
  const text = typeof raw === 'string' ? raw.trim() : raw;
  if (text === '' || text === null || text === undefined)
    return { ok: false, message: 'Enter a value, or clear the property instead' };
  switch (def.dataType) {
    case 'dimension': {
      const n = typeof text === 'number' ? text : Number(String(text).replace(',', '.'));
      if (!Number.isFinite(n)) return { ok: false, message: 'Enter a number' };
      if (n < 0) return { ok: false, message: 'A length cannot be negative' };
      if (convertLength(n, unit, 'mm') > MAX_LENGTH_MM)
        return { ok: false, message: `That is longer than ${MAX_LENGTH_MM / 1000} m` };
      return { ok: true, value: n, unit };
    }
    case 'number': {
      const n = typeof text === 'number' ? text : Number(String(text).replace(',', '.'));
      if (!Number.isFinite(n)) return { ok: false, message: 'Enter a number' };
      if (def.key.endsWith('_count') && !Number.isInteger(n))
        return { ok: false, message: 'Enter a whole number' };
      if (def.min !== undefined && n < def.min)
        return { ok: false, message: `At least ${def.min}` };
      if (def.max !== undefined && n > def.max) return { ok: false, message: `At most ${def.max}` };
      return { ok: true, value: n, unit: def.unitKind === 'mass_area' ? 'gsm' : null };
    }
    case 'enum': {
      const v = String(text);
      if (!isEnumValueAllowed(catalog, def.key, v))
        return { ok: false, message: 'Choose one of the listed values' };
      return { ok: true, value: v, unit: null };
    }
    case 'color': {
      const v = String(text);
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return { ok: false, message: 'Use a colour like #1A2B3C' };
      return { ok: true, value: v.toLowerCase(), unit: null };
    }
    case 'boolean':
      if (typeof text !== 'boolean') return { ok: false, message: 'Choose yes or no' };
      return { ok: true, value: text, unit: null };
    case 'text': {
      const v = String(text);
      if (v.length > 2000) return { ok: false, message: 'At most 2000 characters' };
      return { ok: true, value: v, unit: null };
    }
    case 'composition': {
      const r = compositionValueSchema.safeParse(text);
      if (!r.success)
        return { ok: false, message: r.error.issues[0]?.message ?? 'Invalid composition' };
      return { ok: true, value: r.data, unit: null };
    }
    case 'reference':
      return {
        ok: false,
        message: 'Attach an artifact to set this (coming in the artifact panel)',
      };
  }
}
