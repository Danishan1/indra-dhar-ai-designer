import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  decodeCursor,
  defineEvent,
  encodeCursor,
  ErrorCodes,
  ErrorHttpStatus,
  errorEnvelopeSchema,
  formatDisplayId,
  formatRevisionId,
  parseDisplayId,
  parseEvent,
} from './index.js';

describe('error catalog', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of Object.values(ErrorCodes))
      expect(ErrorHttpStatus[code]).toBeGreaterThanOrEqual(400);
  });

  it('validates the envelope', () => {
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } })
        .success,
    ).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({ error: { code: 'NOPE', message: 'x', requestId: 'r' } })
        .success,
    ).toBe(false);
  });
});

describe('display ids', () => {
  it('formats and parses', () => {
    expect(formatDisplayId('PRJ', 123)).toBe('PRJ-000123');
    expect(formatDisplayId('SLV', 7)).toBe('SLV-0007');
    expect(formatRevisionId('DSN-000456', 3)).toBe('DSN-000456-R003');
    expect(parseDisplayId('DSN-000456-R003')).toEqual({ prefix: 'DSN', number: 456, revision: 3 });
    expect(parseDisplayId('hello')).toBeNull();
  });
});

describe('events', () => {
  const Ev = defineEvent('demo.happened', 2, z.object({ n: z.number() }));
  const base = {
    eventId: '0192f2a4-7c1e-7d3a-8b2f-1a2b3c4d5e6f',
    occurredAt: new Date().toISOString(),
    organizationId: null,
    actor: { type: 'system' as const, id: null },
    correlationId: null,
    causationId: null,
  };

  it('parses matching type/version and validates payload', () => {
    expect(
      parseEvent(Ev, { ...base, type: 'demo.happened', schemaVersion: 2, payload: { n: 1 } })
        .payload.n,
    ).toBe(1);
    expect(() =>
      parseEvent(Ev, { ...base, type: 'demo.happened', schemaVersion: 1, payload: { n: 1 } }),
    ).toThrow(/version/);
    expect(() =>
      parseEvent(Ev, { ...base, type: 'demo.happened', schemaVersion: 2, payload: { n: 'x' } }),
    ).toThrow();
  });
});

describe('cursors', () => {
  it('round-trips and rejects garbage', () => {
    expect(decodeCursor(encodeCursor({ id: 'a', t: 1 }))).toEqual({ id: 'a', t: 1 });
    expect(decodeCursor('%%%')).toBeNull();
  });
});
