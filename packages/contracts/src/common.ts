import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Money: integer minor units + ISO 4217 currency (docs/plan/02-conventions.md §4). Never floats. */
export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof moneySchema>;

/** Actor of an action (audit, events). */
export const actorTypeSchema = z.enum([
  'human',
  'service',
  'system',
  'platform_operator',
  'anonymous',
]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const actorSchema = z.object({ type: actorTypeSchema, id: z.string().nullable() });
export type Actor = z.infer<typeof actorSchema>;
