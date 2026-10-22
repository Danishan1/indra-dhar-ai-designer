import { describe, expect, it } from 'vitest';

import { redactSecrets } from './redact.js';

describe('redactSecrets', () => {
  it('replaces secret-looking keys at any depth without mutating input', () => {
    const input = {
      user: 'a',
      password: 'x',
      nested: { apiKey: 'k', list: [{ token: 't', ok: 1 }] },
      Authorization: 'B',
    };
    const out = redactSecrets(input);
    expect(out).toEqual({
      user: 'a',
      password: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', list: [{ token: '[REDACTED]', ok: 1 }] },
      Authorization: '[REDACTED]',
    });
    expect(input.password).toBe('x');
  });
});
