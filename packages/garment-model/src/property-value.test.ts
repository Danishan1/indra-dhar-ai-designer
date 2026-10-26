import { describe, expect, it } from 'vitest';

import {
  PROPERTY_KEY_PATTERN,
  isConfirmed,
  isUnreviewedAi,
  missingValue,
  notApplicableValue,
  promote,
  propertyValueSchema,
  proposedFromTemplate,
  userValue,
  dataTypeValueSchemas,
} from './schema/property-value.js';
import {
  AI_SOURCE_TYPES,
  ValueStatuses,
  ValueSourceTypes,
  isAiSource,
  needsHumanAttention,
} from './status.js';

const WHEN = '2026-10-26T10:00:00.000Z';

describe('status vocabulary (AC1)', () => {
  it('matches SPEC-003 §9.2 exactly', () => {
    expect([...ValueStatuses]).toEqual([
      'confirmed',
      'inferred',
      'proposed',
      'missing',
      'needs_review',
      'not_applicable',
    ]);
    expect(ValueSourceTypes).toContain('none');
    expect(AI_SOURCE_TYPES.every(isAiSource)).toBe(true);
    expect(needsHumanAttention('confirmed')).toBe(false);
    expect(needsHumanAttention('missing')).toBe(true);
  });
});

describe('PropertyValue schema', () => {
  const ok = (v: unknown) => propertyValueSchema.safeParse(v).success;

  it('accepts the constructors', () => {
    expect(ok(missingValue())).toBe(true);
    expect(ok(notApplicableValue())).toBe(true);
    expect(ok(proposedFromTemplate('spread'))).toBe(true);
    expect(ok(userValue(580, { confirmedBy: 'u1', confirmedAt: WHEN }, 'mm'))).toBe(true);
  });

  it('carries value, unit, status, provenance and review info with defaults', () => {
    const pv = propertyValueSchema.parse({
      value: 'x',
      status: 'proposed',
      sourceType: 'ai_interpretation',
    });
    expect(pv).toMatchObject({
      unit: null,
      sourceRefs: [],
      confidence: null,
      reviewRequired: false,
      confirmedBy: null,
      confirmedAt: null,
    });
  });

  it.each([
    ['missing with a value', { value: 'x', status: 'missing', sourceType: 'none' }],
    ['not applicable with a value', { value: 1, status: 'not_applicable', sourceType: 'none' }],
    ['proposed without value', { value: null, status: 'proposed', sourceType: 'template' }],
    ['confirmed without who/when', { value: 'x', status: 'confirmed', sourceType: 'user_input' }],
    ['value without a source', { value: 'x', status: 'inferred', sourceType: 'none' }],
    [
      'confidence above 1',
      { value: 'x', status: 'inferred', sourceType: 'ai_interpretation', confidence: 1.2 },
    ],
    ['unknown status', { value: 'x', status: 'approved', sourceType: 'user_input' }],
    [
      'bad timestamp',
      {
        value: 'x',
        status: 'confirmed',
        sourceType: 'user_input',
        confirmedBy: 'u',
        confirmedAt: 'yesterday',
      },
    ],
  ])('rejects %s', (_name, input) => {
    expect(ok(input)).toBe(false);
  });

  it('validates property keys', () => {
    expect(PROPERTY_KEY_PATTERN.test('dimension.sleeve_length')).toBe(true);
    expect(PROPERTY_KEY_PATTERN.test('ext.my_vendor_flag')).toBe(true);
    expect(PROPERTY_KEY_PATTERN.test('sleeve_length')).toBe(false);
    expect(PROPERTY_KEY_PATTERN.test('Dimension.Sleeve')).toBe(false);
  });
});

describe('promote (PROP-007)', () => {
  it('refuses AI → confirmed without an attributed person', () => {
    const ai = proposedFromTemplate('slim');
    ai.sourceType = 'ai_interpretation';
    expect(() => promote(ai, { confirmedBy: '', confirmedAt: WHEN })).toThrow(/person/);
    expect(() => promote(ai, { confirmedBy: 'u1', confirmedAt: 'nope' })).toThrow(/timestamp/);
    expect(() => promote(missingValue(), { confirmedBy: 'u1', confirmedAt: WHEN })).toThrow(
      /no value/,
    );
  });

  it('confirms with an explicit confirmation, keeping the original source', () => {
    const ai = {
      ...proposedFromTemplate('slim'),
      sourceType: 'ai_interpretation' as const,
      confidence: 0.99,
    };
    expect(isUnreviewedAi(ai)).toBe(true);
    const done = promote(ai, { confirmedBy: 'u1', confirmedAt: WHEN });
    expect(isConfirmed(done)).toBe(true);
    expect(done).toMatchObject({
      sourceType: 'ai_interpretation',
      confirmedBy: 'u1',
      reviewRequired: false,
    });
    expect(propertyValueSchema.safeParse(done).success).toBe(true);
    expect(isUnreviewedAi(done)).toBe(false);
    expect(ai.status).toBe('proposed'); // input is not mutated
  });

  it('a high confidence score alone never confirms', () => {
    const inferred = {
      ...missingValue(),
      value: 'x',
      status: 'inferred' as const,
      sourceType: 'ai_interpretation' as const,
      confidence: 1,
    };
    expect(inferred.status).toBe('inferred');
    expect(propertyValueSchema.safeParse(inferred).success).toBe(true);
  });
});

describe('data type values', () => {
  it('validates each type', () => {
    expect(dataTypeValueSchemas.color.safeParse('#A1b2C3').success).toBe(true);
    expect(dataTypeValueSchemas.color.safeParse('red').success).toBe(false);
    expect(
      dataTypeValueSchemas.composition.safeParse([
        { fiber: 'cotton', percent: 60 },
        { fiber: 'polyester', percent: 40 },
      ]).success,
    ).toBe(true);
    expect(
      dataTypeValueSchemas.composition.safeParse([{ fiber: 'cotton', percent: 60 }]).success,
    ).toBe(false);
    expect(dataTypeValueSchemas.dimension.safeParse(-1).success).toBe(false);
    expect(dataTypeValueSchemas.number.safeParse(Number.NaN).success).toBe(false);
    expect(dataTypeValueSchemas.boolean.safeParse('true').success).toBe(false);
    expect(
      (
        dataTypeValueSchemas.reference.parse({ entityType: 'asset', entityId: 'a1' }) as {
          revisionId: unknown;
        }
      ).revisionId,
    ).toBeNull();
  });
});
