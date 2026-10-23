import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  hotp,
  normalizeRecoveryCode,
  timeStep,
  totpAt,
  verifyTotp,
} from './totp.js';

describe('TOTP (RFC 6238)', () => {
  // RFC 6238 Appendix B test secret "12345678901234567890" (SHA-1).
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC test vectors (6-digit truncation)', () => {
    expect(totpAt(secret, 59_000)).toBe('287082');
    expect(totpAt(secret, 1_111_111_109_000)).toBe('081804');
    expect(totpAt(secret, 1_234_567_890_000)).toBe('005924');
    expect(totpAt(secret, 2_000_000_000_000)).toBe('279037');
  });

  it('round-trips base32 and matches HOTP vectors', () => {
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224');
  });

  it('accepts ±1 step of clock skew, rejects older codes', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), { nowMs: now })).toBe(
      timeStep(now) - 1,
    );
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), { nowMs: now })).toBe(
      timeStep(now) + 1,
    );
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, '000000', { nowMs: now })).toBeNull();
  });

  it('refuses replay of a step already used', () => {
    const now = 1_700_000_000_000;
    const code = totpAt(secret, now);
    const step = verifyTotp(secret, code, { nowMs: now });
    expect(step).toBe(timeStep(now));
    expect(verifyTotp(secret, code, { nowMs: now, lastUsedStep: step })).toBeNull();
  });

  it('generates distinct recovery codes in a typeable format', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(normalizeRecoveryCode(' K7M2P-9XQ4T ')).toBe('k7m2p9xq4t');
  });
});
