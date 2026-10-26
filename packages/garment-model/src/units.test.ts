import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assertUnitOfKind, convertLength, roundTo, toCanonicalLength, unitKind } from './units.js';

describe('units', () => {
  it('converts lengths deterministically', () => {
    expect(convertLength(1, 'in', 'mm')).toBe(25.4);
    expect(convertLength(58, 'cm', 'mm')).toBe(580);
    expect(convertLength(580, 'mm', 'in')).toBe(22.8346);
    expect(toCanonicalLength(22, 'in')).toEqual({ value: 558.8, unit: 'mm' });
  });

  it('round-trips mm → cm → mm and mm → in → mm within display precision', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20000 }), (hundredths) => {
        const mm = hundredths / 100;
        expect(
          Math.abs(convertLength(convertLength(mm, 'mm', 'cm'), 'cm', 'mm') - mm),
        ).toBeLessThanOrEqual(0.005);
        expect(
          Math.abs(convertLength(convertLength(mm, 'mm', 'in'), 'in', 'mm') - mm),
        ).toBeLessThanOrEqual(0.0026);
      }),
    );
  });

  it('rounds half away from zero and never returns -0', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(Object.is(roundTo(-0.0001, 2), 0)).toBe(true);
  });

  it('rejects non-finite numbers', () => {
    expect(() => convertLength(Number.NaN, 'mm', 'cm')).toThrow(/finite/);
    expect(() => roundTo(Number.POSITIVE_INFINITY, 2)).toThrow();
  });

  it('requires a unit of the right kind for physical dimensions (PROP-003)', () => {
    expect(() => assertUnitOfKind(null, 'length', 'Sleeve length')).toThrow(/needs a unit/);
    expect(() => assertUnitOfKind('gsm', 'length', 'Sleeve length')).toThrow(/not a length unit/);
    expect(assertUnitOfKind('mm', 'length', 'Sleeve length')).toBe('mm');
    expect(unitKind('gsm')).toBe('mass_area');
  });
});
