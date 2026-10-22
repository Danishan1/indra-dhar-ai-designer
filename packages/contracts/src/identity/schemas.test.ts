import { describe, expect, it } from 'vitest';

import { emailSchema, passwordSchema, registerRequestSchema } from './schemas.js';

describe('identity schemas', () => {
  it('normalizes emails without provider rewriting (FR-SEC-002)', () => {
    expect(emailSchema.parse('  Ada.Lovelace+x@Example.COM ')).toBe('ada.lovelace+x@example.com');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('enforces the password policy (12–128, not only spaces)', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse(' '.repeat(12)).success).toBe(false);
    expect(passwordSchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(passwordSchema.safeParse('twelve chars').success).toBe(true);
  });

  it('trims display names', () => {
    expect(
      registerRequestSchema.parse({
        email: 'a@b.co',
        password: 'x'.repeat(12),
        displayName: '  Ada ',
      }).displayName,
    ).toBe('Ada');
  });
});
