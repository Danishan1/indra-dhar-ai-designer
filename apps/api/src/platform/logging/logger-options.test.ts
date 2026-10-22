import { Writable } from 'node:stream';

import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { REDACT_PATHS, resolveRequestId } from './logger-options.js';

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' } }, stream);
  return { logger, lines };
}

describe('log redaction (TECH §3.11, FR-SEC-181)', () => {
  it('masks credentials, tokens and auth headers', () => {
    const { logger, lines } = capture();
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc123', cookie: 'sid=zzz', accept: 'json' } },
        user: { password: 'hunter2', apiKey: 'sk-live-1', name: 'Asha' },
        provider: { credentials: { secret: 'deep-secret' } },
        session: { token: 'tok-1' },
      },
      'test',
    );
    const out = lines.join('');
    for (const secret of ['abc123', 'zzz', 'hunter2', 'sk-live-1', 'deep-secret', 'tok-1']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('Asha');
    expect(out).toContain('[REDACTED]');
    expect(JSON.parse(out).level).toBe(30);
  });
});

describe('resolveRequestId', () => {
  it('keeps a valid inbound UUID', () => {
    const id = '0192f2a4-7c1e-7d3a-8b2f-1a2b3c4d5e6f';
    expect(resolveRequestId(id)).toBe(id);
  });

  it('generates a new id for missing or invalid values', () => {
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('<script>')).not.toBe('<script>');
  });
});
