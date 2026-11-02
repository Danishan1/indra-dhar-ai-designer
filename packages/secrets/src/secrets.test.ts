import { describe, expect, it } from 'vitest';

import { createSecretCipher } from './index.js';

describe('secret cipher', () => {
  it('round-trips, binds the context and agrees between processes with the same key', () => {
    const a = createSecretCipher({ devSecret: 'dev-secret-dev-secret-dev-secret-1234' });
    const b = createSecretCipher({ devSecret: 'dev-secret-dev-secret-dev-secret-1234' });
    const ct = a.encrypt('AIza-key', 'ai-provider:org1:gemini');
    expect(ct).not.toContain('AIza');
    expect(b.decrypt(ct, 'ai-provider:org1:gemini')).toBe('AIza-key');
    expect(() => b.decrypt(ct, 'ai-provider:org2:gemini')).toThrow();
    const k = createSecretCipher({ masterKey: Buffer.alloc(32, 7).toString('base64') });
    expect(k.decrypt(k.encrypt('x', 'c'), 'c')).toBe('x');
  });
});
