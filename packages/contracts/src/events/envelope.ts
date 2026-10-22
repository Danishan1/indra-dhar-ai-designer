import { z } from 'zod';

import { actorSchema, isoDateTimeSchema } from '../common.js';

/**
 * Versioned domain-event envelope (SPEC-006 §15, SPEC-004 EVT-005). Events carry references and
 * minimal data — never secrets or full confidential content (SPEC-004 EVT-004).
 */
export const eventEnvelopeSchema = z.object({
  eventId: z.uuid(),
  type: z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9_]*)+$/, 'dotted lower-case event type'),
  schemaVersion: z.number().int().min(1),
  occurredAt: isoDateTimeSchema,
  organizationId: z.uuid().nullable(),
  actor: actorSchema,
  correlationId: z.string().nullable(),
  causationId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

export type EventEnvelope<P = Record<string, unknown>> = Omit<
  z.infer<typeof eventEnvelopeSchema>,
  'payload'
> & {
  payload: P;
};

export interface EventDefinition<P extends z.ZodType> {
  type: string;
  schemaVersion: number;
  payload: P;
}

/** Declares an event type with its payload schema; consumers validate with `parseEvent`. */
export function defineEvent<P extends z.ZodType>(
  type: string,
  schemaVersion: number,
  payload: P,
): EventDefinition<P> {
  return { type, schemaVersion, payload };
}

export function parseEvent<P extends z.ZodType>(
  def: EventDefinition<P>,
  envelope: EventEnvelope<unknown>,
): EventEnvelope<z.infer<P>> {
  if (envelope.type !== def.type)
    throw new Error(`Expected event ${def.type}, got ${envelope.type}`);
  if (envelope.schemaVersion !== def.schemaVersion) {
    throw new Error(
      `Unsupported ${def.type} schema version ${envelope.schemaVersion} (expected ${def.schemaVersion})`,
    );
  }
  return { ...envelope, payload: def.payload.parse(envelope.payload) };
}
