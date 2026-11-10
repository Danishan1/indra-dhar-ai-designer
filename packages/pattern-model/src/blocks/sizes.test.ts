import { patternSpecSchema } from '@ai-designer/garment-model';
import { describe, expect, it } from 'vitest';

import { draftedDimension } from './levers.js';
import {
  convertSize,
  defaultSizeFor,
  measurementsFor,
  sizeLabel,
  sizesFor,
  specForSize,
  specMeasurements,
} from './sizes.js';

describe('size standards (ADR-067)', () => {
  it('lists sizes per standard and audience', () => {
    expect(sizesFor('women', 'uk')).toContain('12');
    expect(sizesFor('women', 'us')[0]).toBe('0');
    expect(sizesFor('women', 'eu')).toContain('40');
    expect(sizesFor('men', 'uk')).toEqual(['34', '36', '38', '40', '42', '44', '46', '48']);
    expect(sizesFor('boys', 'uk')[0]).toBe('2-3y');
    expect(sizesFor('girls', 'us')).toContain('4T');
    expect(sizesFor('boys', 'eu')).toContain('128');
    expect(defaultSizeFor('men', 'eu')).toBe('50');
  });

  it('UK, US and EU labels of the same body are the same measurements', () => {
    const uk12 = measurementsFor('women', '12', 'uk');
    expect(measurementsFor('women', '8', 'us')).toEqual(uk12);
    expect(measurementsFor('women', '40', 'eu')).toEqual(uk12);
    expect(uk12).toMatchObject({ bust: 910, waist: 730, hip: 970 });
    // Other measurements follow the body chart, in between the letter sizes.
    expect(uk12.across_back!).toBeGreaterThan(330);
    expect(uk12.across_back!).toBeLessThan(360);
    expect(measurementsFor('men', '40', 'uk').bust).toBe(1016);
    expect(measurementsFor('boys', '7-8y', 'uk').height).toBe(1280);
    expect(measurementsFor('boys', '128', 'eu').bust).toBe(measurementsFor('boys', '8y').bust);
  });

  it('converts between standards and labels sizes', () => {
    expect(convertSize('women', { system: 'intl', size: 'M' }, { system: 'uk' })).toBe('12');
    expect(convertSize('boys', { system: 'intl', size: '8y' }, { system: 'us' })).toBe('8');
    expect(sizeLabel({ size: '12', sizeSystem: 'uk' })).toBe('UK 12');
    expect(sizeLabel({ size: 'M' })).toBe('M');
  });

  it('custom charts fill what they do not give from the body chart', () => {
    const chart = {
      id: 'c1',
      name: 'Brand boys',
      audience: 'boys' as const,
      sizes: [
        { label: 'S', body: { height: 1160, bust: 610 } },
        { label: 'M', body: { height: 1280, bust: 660 } },
      ],
    };
    const m = measurementsFor('boys', 'M', 'custom', chart);
    expect(m).toMatchObject({ height: 1280, bust: 660 });
    expect(m.waist).toBe(measurementsFor('boys', '8y').waist);
    expect(sizesFor('boys', 'custom', chart)).toEqual(['S', 'M']);
  });

  it('grades a design to other sizes, keeping the designer changes', () => {
    const spec = patternSpecSchema.parse({
      family: 'top',
      audience: 'women',
      size: '12',
      sizeSystem: 'uk',
      style: { topType: 'shirt' },
      body: {
        back_length:
          specMeasurements({ audience: 'women', size: '12', sizeSystem: 'uk' }).back_length! + 20,
      },
    });
    const s16 = specForSize(spec, '16');
    const chart16 = measurementsFor('women', '16', 'uk');
    expect(s16.body.back_length).toBe(chart16.back_length! + 20);
    expect(draftedDimension(s16, 'back', 'width')!).toBeGreaterThan(
      draftedDimension(spec, 'back', 'width')!,
    );
  });
});
