import { z } from 'zod';

import { GarmentModelError } from './errors.js';

/**
 * Units (ADR-020): millimetres are the canonical length unit. Physical dimensions always carry a unit
 * (PROP-003); conversions are deterministic and rounded to a fixed precision per unit.
 */
export const Units = ['mm', 'cm', 'in', 'gsm', 'deg', 'percent'] as const;
export const unitSchema = z.enum(Units);
export type Unit = z.infer<typeof unitSchema>;

export const LengthUnits = ['mm', 'cm', 'in'] as const;
export type LengthUnit = (typeof LengthUnits)[number];
export const lengthUnitSchema = z.enum(LengthUnits);

export type UnitKind = 'length' | 'mass_area' | 'angle' | 'percentage';

const KIND_OF: Record<Unit, UnitKind> = {
  mm: 'length',
  cm: 'length',
  in: 'length',
  gsm: 'mass_area',
  deg: 'angle',
  percent: 'percentage',
};

export const CANONICAL_LENGTH_UNIT: LengthUnit = 'mm';

/** Millimetres per unit. Exact by definition (1 in = 25.4 mm). */
const MM_PER: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/** Decimal places kept after conversion (display/storage precision). */
export const LENGTH_PRECISION: Record<LengthUnit, number> = { mm: 2, cm: 3, in: 4 };

export function unitKind(unit: Unit): UnitKind {
  return KIND_OF[unit];
}

export function isLengthUnit(unit: Unit | null | undefined): unit is LengthUnit {
  return unit === 'mm' || unit === 'cm' || unit === 'in';
}

/** Rounds half away from zero to `places` decimals without binary-float surprises. */
export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) {
    throw new GarmentModelError('INVALID_VALUE', `Cannot round non-finite number ${String(value)}`);
  }
  const factor = 10 ** places;
  const scaled = Math.abs(value) * factor;
  const rounded = Math.round(Number((scaled + Number.EPSILON * scaled).toPrecision(15)));
  const result = (Math.sign(value) * rounded) / factor;
  return result === 0 ? 0 : result;
}

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (!Number.isFinite(value)) {
    throw new GarmentModelError(
      'INVALID_VALUE',
      `Length must be a finite number, got ${String(value)}`,
    );
  }
  if (from === to) return value;
  return roundTo((value * MM_PER[from]) / MM_PER[to], LENGTH_PRECISION[to]);
}

export interface Measured {
  value: number;
  unit: LengthUnit;
}

/** Converts a length to canonical millimetres. */
export function toCanonicalLength(value: number, unit: LengthUnit): Measured {
  return { value: convertLength(value, unit, CANONICAL_LENGTH_UNIT), unit: CANONICAL_LENGTH_UNIT };
}

/** Throws if a physical dimension is given without a unit of the expected kind (PROP-003). */
export function assertUnitOfKind(
  unit: Unit | null | undefined,
  kind: UnitKind,
  what: string,
): Unit {
  if (unit === null || unit === undefined) {
    throw new GarmentModelError('INVALID_UNIT', `${what} needs a unit (${kind})`);
  }
  if (unitKind(unit) !== kind) {
    throw new GarmentModelError('INVALID_UNIT', `${what}: unit "${unit}" is not a ${kind} unit`);
  }
  return unit;
}
