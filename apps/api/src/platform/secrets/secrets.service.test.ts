import { describe, expect, it } from 'vitest';

import { AppConfig } from '../config/app-config.js';

import { SecretsService } from './secrets.service.js';

const config = (extra: Record<string, string> = {}) =>
  AppConfig.fromProcessEnv({
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:8333',
    S3_ACCESS_KEY_ID: 'a',
    S3_SECRET_ACCESS_KEY: 'b',
    BETTER_AUTH_SECRET: 'x'.repeat(40),
    LOG_LEVEL: 'silent',
    ...extra,
  });

describe('SecretsService (ADR-007)', () => {
  const secrets = new SecretsService(
    config({ SECRETS_MASTER_KEY: Buffer.alloc(32, 7).toString('base64') }),
  );

  it('round-trips and never stores the plaintext', () => {
    const ct = secrets.encrypt('JBSWY3DPEHPK3PXP', 'totp:user-1');
    expect(ct).not.toContain('JBSWY3DPEHPK3PXP');
    expect(secrets.decrypt(ct, 'totp:user-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(secrets.encrypt('same', 'c')).not.toBe(secrets.encrypt('same', 'c'));
  });

  it('binds the context: a ciphertext moved to another row does not decrypt', () => {
    const ct = secrets.encrypt('secret', 'totp:user-1');
    expect(() => secrets.decrypt(ct, 'totp:user-2')).toThrow();
  });

  it('rejects tampering and a different master key', () => {
    const ct = secrets.encrypt('secret', 'ctx');
    const other = new SecretsService(
      config({ SECRETS_MASTER_KEY: Buffer.alloc(32, 9).toString('base64') }),
    );
    expect(() => other.decrypt(ct, 'ctx')).toThrow();
    const env = JSON.parse(Buffer.from(ct, 'base64url').toString()) as { ct: string };
    const parts = env.ct.split('.');
    parts[1] = Buffer.from('tampered').toString('base64url');
    const bad = Buffer.from(JSON.stringify({ ...env, ct: parts.join('.') })).toString('base64url');
    expect(() => secrets.decrypt(bad, 'ctx')).toThrow();
  });

  it('requires the master key in production', () => {
    expect(() => config({ NODE_ENV: 'production' })).toThrow(/SECRETS_MASTER_KEY/);
  });
});
