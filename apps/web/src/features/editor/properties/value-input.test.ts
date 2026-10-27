import {
  defaultCatalog,
  missingValue,
  proposedFromTemplate,
  type PropertyDefinition,
} from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { formatForInput, formatLength, parseInput, summarize } from './value-input';

const def = (key: string) => defaultCatalog.properties.get(key) as PropertyDefinition;

describe('property value input', () => {
  it('formats lengths in the display unit and round-trips', () => {
    const pv = proposedFromTemplate(640, 'mm');
    expect(formatLength(pv, 'mm')).toBe('640');
    expect(formatLength(pv, 'cm')).toBe('64');
    expect(formatLength(pv, 'in')).toBe('25.197');
    expect(formatLength(proposedFromTemplate(25.4, 'in'), 'mm')).toBe('645.2');
    for (const unit of ['mm', 'cm', 'in'] as const) {
      const shown = formatLength(pv, unit);
      const parsed = parseInput(def('dimension.sleeve_length'), shown, unit);
      expect(parsed.ok).toBe(true);
      if (parsed.ok)
        expect(formatLength(proposedFromTemplate(parsed.value as number, unit as 'mm'), 'mm')).toBe(
          '640',
        );
    }
    expect(formatForInput(def('dimension.sleeve_length'), missingValue(), 'cm')).toBe('');
  });

  it('rejects invalid values before submission (AC3)', () => {
    expect(parseInput(def('dimension.sleeve_length'), '-3', 'cm')).toMatchObject({ ok: false });
    expect(parseInput(def('dimension.sleeve_length'), 'abc', 'cm')).toMatchObject({
      ok: false,
      message: 'Enter a number',
    });
    expect(parseInput(def('dimension.sleeve_length'), '9000', 'mm')).toMatchObject({ ok: false });
    expect(parseInput(def('dimension.sleeve_length'), '64,5', 'cm')).toEqual({
      ok: true,
      value: 64.5,
      unit: 'cm',
    });
    expect(parseInput(def('construction.button_count'), '3.5', 'mm')).toMatchObject({
      ok: false,
      message: 'Enter a whole number',
    });
    expect(parseInput(def('construction.button_count'), '41', 'mm')).toMatchObject({
      ok: false,
      message: 'At most 40',
    });
    expect(parseInput(def('construction.button_count'), '6', 'mm')).toEqual({
      ok: true,
      value: 6,
      unit: null,
    });
    expect(parseInput(def('material.gsm'), '180', 'mm')).toEqual({
      ok: true,
      value: 180,
      unit: 'gsm',
    });
    expect(parseInput(def('construction.cuff_type'), 'french', 'mm')).toMatchObject({ ok: true });
    expect(parseInput(def('construction.cuff_type'), 'velcro', 'mm')).toMatchObject({ ok: false });
    expect(parseInput(def('appearance.color'), '#AA00ff', 'mm')).toEqual({
      ok: true,
      value: '#aa00ff',
      unit: null,
    });
    expect(parseInput(def('appearance.color'), 'red', 'mm')).toMatchObject({ ok: false });
    expect(parseInput(def('appearance.color'), '', 'mm')).toMatchObject({ ok: false });
    expect(
      parseInput(def('material.composition'), [{ fiber: 'cotton', percent: 60 }], 'mm'),
    ).toMatchObject({ ok: false });
    expect(
      parseInput(
        def('material.composition'),
        [
          { fiber: 'cotton', percent: 60 },
          { fiber: 'polyester', percent: 40 },
        ],
        'mm',
      ),
    ).toMatchObject({ ok: true });
    expect(parseInput(def('material.fabric_ref'), 'x', 'mm')).toMatchObject({ ok: false });
  });

  it('summarizes values for read-only display', () => {
    expect(
      summarize(def('construction.cuff_type'), proposedFromTemplate('barrel_single_button'), 'mm'),
    ).toBe('Barrel single button');
    expect(summarize(def('dimension.sleeve_length'), proposedFromTemplate(640, 'mm'), 'cm')).toBe(
      '64 cm',
    );
    expect(
      summarize(
        def('material.composition'),
        proposedFromTemplate([{ fiber: 'cotton', percent: 100 }]),
        'mm',
      ),
    ).toBe('100% cotton');
    expect(summarize(def('appearance.color'), missingValue(), 'mm')).toBe('—');
  });
});
