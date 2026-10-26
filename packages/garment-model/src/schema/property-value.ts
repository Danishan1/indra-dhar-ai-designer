import { z } from 'zod';

import { GarmentModelError } from '../errors.js';
import {
  isAiSource,
  isValuelessStatus,
  valueSourceTypeSchema,
  valueStatusSchema,
  type ValueSourceType,
} from '../status.js';
import { unitSchema } from '../units.js';

export const PROPERTY_KEY_PATTERN =
  /^(appearance|construction|dimension|material|placement|production|simulation|ext)\.[a-z][a-z0-9_]{0,63}$/;
/** SPEC-003 §9.5 namespaces plus `ext.*` for registered/unregistered extension properties (PROP-004). */
export const PropertyNamespaces = [
  'appearance',
  'construction',
  'dimension',
  'material',
  'placement',
  'production',
  'simulation',
  'ext',
] as const;
export const propertyKeySchema = z.string().regex(PROPERTY_KEY_PATTERN, {
  message: 'Property keys look like "dimension.sleeve_length" (namespace.name, lowercase)',
});

/** A reference to the evidence behind a value (SPEC-003 §9.3). */
export const sourceRefSchema = z.object({
  sourceType: valueSourceTypeSchema,
  entityId: z.string().trim().min(1).max(200).nullable().default(null),
  revisionId: z.string().trim().min(1).max(200).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

// ── Value shapes per data type ───────────────────────────────────────────────

export const PropertyDataTypes = [
  'enum',
  'number',
  'boolean',
  'color',
  'text',
  'composition',
  'reference',
  'dimension',
] as const;
export type PropertyDataType = (typeof PropertyDataTypes)[number];

export const colorValueSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Use a #RRGGBB colour' });

export const compositionValueSchema = z
  .array(
    z.object({
      fiber: z.string().trim().min(1).max(60),
      percent: z.number().gt(0).max(100),
    }),
  )
  .min(1)
  .refine((parts) => Math.abs(parts.reduce((sum, p) => sum + p.percent, 0) - 100) < 0.01, {
    message: 'Fibre percentages must add up to 100',
  });
export type Composition = z.infer<typeof compositionValueSchema>;

export const referenceValueSchema = z.object({
  entityType: z.string().trim().min(1).max(60),
  entityId: z.string().trim().min(1).max(200),
  revisionId: z.string().trim().min(1).max(200).nullable().default(null),
});

/** Value schema for each data type; `enum` additionally needs the allowed set (see registry). */
export const dataTypeValueSchemas: Record<PropertyDataType, z.ZodType> = {
  enum: z.string().trim().min(1).max(80),
  number: z.number().finite(),
  boolean: z.boolean(),
  color: colorValueSchema,
  text: z.string().max(2000),
  composition: compositionValueSchema,
  reference: referenceValueSchema,
  dimension: z.number().finite().min(0),
};

// ── The PropertyValue envelope ───────────────────────────────────────────────

export const propertyValueSchema = z
  .object({
    /** `null` means "no value" — never a silently invented default (PROP-005). */
    value: z.json().nullable(),
    unit: unitSchema.nullable().default(null),
    status: valueStatusSchema,
    sourceType: valueSourceTypeSchema.default('none'),
    sourceRefs: z.array(sourceRefSchema).default([]),
    /** Informational only: a score never turns inferred into confirmed (§9.2). */
    confidence: z.number().min(0).max(1).nullable().default(null),
    reviewRequired: z.boolean().default(false),
    confirmedBy: z.string().trim().min(1).max(200).nullable().default(null),
    confirmedAt: z.iso.datetime().nullable().default(null),
  })
  .superRefine((pv, ctx) => {
    const valueless = isValuelessStatus(pv.status);
    if (valueless && pv.value !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `A ${pv.status} property has no value`,
      });
    }
    if (!valueless && pv.value === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `A ${pv.status} property needs a value`,
      });
    }
    if (pv.status === 'confirmed' && (pv.confirmedBy === null || pv.confirmedAt === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmedBy'],
        message: 'A confirmed property records who confirmed it and when',
      });
    }
    if (pv.sourceType === 'none' && !valueless) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceType'],
        message: 'A property with a value says where it came from',
      });
    }
  });
export type PropertyValue = z.infer<typeof propertyValueSchema>;
export type PropertyValueInput = z.input<typeof propertyValueSchema>;

// ── Constructors and rules ───────────────────────────────────────────────────

/** A property with no usable value (the default for every new design property). */
export function missingValue(overrides: Partial<PropertyValue> = {}): PropertyValue {
  return {
    value: null,
    unit: null,
    status: 'missing',
    sourceType: 'none',
    sourceRefs: [],
    confidence: null,
    reviewRequired: true,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides,
  };
}

export function notApplicableValue(): PropertyValue {
  return missingValue({ status: 'not_applicable', reviewRequired: false });
}

/** A template-suggested value: `proposed`, flagged for review, never confirmed (PROP-005). */
export function proposedFromTemplate(
  value: PropertyValue['value'],
  unit: PropertyValue['unit'] = null,
): PropertyValue {
  return {
    value,
    unit,
    status: 'proposed',
    sourceType: 'template',
    sourceRefs: [{ sourceType: 'template', entityId: null, revisionId: null, note: null }],
    confidence: null,
    reviewRequired: true,
    confirmedBy: null,
    confirmedAt: null,
  };
}

/** A value from a person typing it in: confirmed straight away, attributed. */
export function userValue(
  value: NonNullable<PropertyValue['value']>,
  confirmation: Confirmation,
  unit: PropertyValue['unit'] = null,
): PropertyValue {
  return {
    value,
    unit,
    status: 'confirmed',
    sourceType: 'user_input',
    sourceRefs: [
      {
        sourceType: 'user_input',
        entityId: confirmation.confirmedBy,
        revisionId: null,
        note: null,
      },
    ],
    confidence: null,
    reviewRequired: false,
    confirmedBy: confirmation.confirmedBy,
    confirmedAt: confirmation.confirmedAt,
  };
}

export const isConfirmed = (pv: Pick<PropertyValue, 'status'>): boolean =>
  pv.status === 'confirmed';

export interface Confirmation {
  /** The person (user id) who explicitly confirmed. Never a job, model or service id. */
  confirmedBy: string;
  confirmedAt: string;
}

/**
 * Moves a value to `confirmed`. Refuses without an explicit, attributed human confirmation
 * (PROP-007, §9.2): confidence scores and AI sources alone can never confirm a value.
 * The original source and refs stay on the record; who confirmed it and when is added.
 */
export function promote(pv: PropertyValue, confirmation: Confirmation): PropertyValue {
  if (isValuelessStatus(pv.status) || pv.value === null) {
    throw new GarmentModelError('PROMOTION_REFUSED', 'There is no value to confirm');
  }
  const by = confirmation.confirmedBy?.trim();
  if (!by) {
    throw new GarmentModelError(
      'PROMOTION_REFUSED',
      'Confirming a value needs the person who confirms it',
    );
  }
  if (Number.isNaN(Date.parse(confirmation.confirmedAt))) {
    throw new GarmentModelError('PROMOTION_REFUSED', 'Confirming a value needs a valid timestamp');
  }
  return {
    ...pv,
    status: 'confirmed',
    reviewRequired: false,
    confirmedBy: by,
    confirmedAt: confirmation.confirmedAt,
  };
}

/** True when a value came only from a model and no person has looked at it. */
export function isUnreviewedAi(pv: PropertyValue): boolean {
  return isAiSource(pv.sourceType as ValueSourceType) && pv.status !== 'confirmed';
}
