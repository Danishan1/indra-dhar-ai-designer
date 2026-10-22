import { describe, expect, it } from 'vitest';

import { canTransition } from './account.service.js';
import { hashIdentifier, hashIp, randomToken } from './crypto.js';
import { hashPassword, needsRehash, verifyPassword } from './password-hasher.js';

describe('identity primitives', () => {
  it('generates unpredictable 256-bit tokens and hashes identifiers deterministically', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(hashIdentifier(`x:${a}`)).toBe(hashIdentifier(`x:${a}`));
    expect(hashIdentifier(`x:${a}`)).not.toContain(a);
  });

  it('keys IP hashes with the secret and never returns the raw IP', () => {
    expect(hashIp('s1', '203.0.113.9')).not.toBe(hashIp('s2', '203.0.113.9'));
    expect(hashIp('s1', '203.0.113.9')).not.toContain('203');
    expect(hashIp('s1', null)).toBeNull();
  });

  it('hashes with argon2id and verifies; detects weaker parameters', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword({ hash, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash, password: 'wrong' })).toBe(false);
    expect(await verifyPassword({ hash: 'scrypt:abc', password: 'x' })).toBe(false);
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(true);
  });

  it('only allows controlled account state transitions (FR-SEC-006)', () => {
    expect(canTransition('pending_verification', 'active')).toBe(true);
    expect(canTransition('active', 'suspended')).toBe(true);
    expect(canTransition('deleted_or_anonymized', 'active')).toBe(false);
    expect(canTransition('pending_verification', 'suspended')).toBe(false);
  });
});
