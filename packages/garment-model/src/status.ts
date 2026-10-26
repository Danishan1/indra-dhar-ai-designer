import { z } from 'zod';

/** SPEC-003 §9.2 — the complete status vocabulary. Do not add values without a spec change. */
export const ValueStatuses = [
  'confirmed',
  'inferred',
  'proposed',
  'missing',
  'needs_review',
  'not_applicable',
] as const;
export const valueStatusSchema = z.enum(ValueStatuses);
export type ValueStatus = z.infer<typeof valueStatusSchema>;

/** Where a value came from (SPEC-003 §9.3). `none` is only valid for missing/not_applicable values. */
export const ValueSourceTypes = [
  'none',
  'user_input',
  'template',
  'uploaded_reference',
  'specification_document',
  'artifact_revision',
  'ai_interpretation',
  'ai_generation',
  'imported_data',
  'measurement_record',
  'external_system',
] as const;
export const valueSourceTypeSchema = z.enum(ValueSourceTypes);
export type ValueSourceType = z.infer<typeof valueSourceTypeSchema>;

/** Sources produced by a model; they can never establish a confirmed value on their own. */
export const AI_SOURCE_TYPES: readonly ValueSourceType[] = ['ai_interpretation', 'ai_generation'];

export function isAiSource(sourceType: ValueSourceType): boolean {
  return AI_SOURCE_TYPES.includes(sourceType);
}

/** Statuses that carry no value. */
export function isValuelessStatus(status: ValueStatus): boolean {
  return status === 'missing' || status === 'not_applicable';
}

/** Statuses that still need a person before the value may be used for approval or production. */
export function needsHumanAttention(status: ValueStatus): boolean {
  return (
    status === 'proposed' ||
    status === 'inferred' ||
    status === 'needs_review' ||
    status === 'missing'
  );
}
