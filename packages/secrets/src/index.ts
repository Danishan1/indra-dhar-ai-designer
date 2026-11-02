import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for secrets at rest (ADR-007): each secret gets a random data key
 * (AES-256-GCM) wrapped by the master key. `context` is bound as additional authenticated data, so a
 * ciphertext copied to another row or purpose fails to decrypt. Shared by the API and the worker.
 */

const ALG = 'aes-256-gcm';
const FORMAT = 'v1';

interface Envelope {
  v: typeof FORMAT;
  kid: string;
  wk: string;
  ct: string;
}

function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [iv, ct, cipher.getAuthTag()].map((b) => b.toString('base64url')).join('.');
}

function open(key: Buffer, sealed: string, aad: string): Buffer {
  const [iv, ct, tag] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !ct || !tag) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export interface SecretCipher {
  readonly kid: string;
  readonly development: boolean;
  encrypt(plaintext: string, context: string): string;
  decrypt(ciphertext: string, context: string): string;
}

/**
 * `masterKey` (base64, 32 bytes) from `SECRETS_MASTER_KEY`; without it (development only) a key is
 * derived from `devSecret` (`BETTER_AUTH_SECRET`) so the API and the worker agree.
 */
export function createSecretCipher(input: {
  masterKey?: string | undefined;
  devSecret?: string | undefined;
}): SecretCipher {
  let masterKey: Buffer;
  let kid: string;
  if (input.masterKey) {
    masterKey = Buffer.from(input.masterKey, 'base64');
    kid = 'k1';
  } else {
    if (!input.devSecret)
      throw new Error('SECRETS_MASTER_KEY (or BETTER_AUTH_SECRET in development) is required');
    masterKey = Buffer.from(
      hkdfSync('sha256', input.devSecret, 'aid-secrets', 'dev-master-key', 32),
    );
    kid = 'dev';
  }
  return {
    kid,
    development: kid === 'dev',
    encrypt(plaintext, context) {
      const dataKey = randomBytes(32);
      const envelope: Envelope = {
        v: FORMAT,
        kid,
        wk: seal(masterKey, dataKey, `${kid}:${context}`),
        ct: seal(dataKey, Buffer.from(plaintext, 'utf8'), context),
      };
      dataKey.fill(0);
      return Buffer.from(JSON.stringify(envelope)).toString('base64url');
    },
    decrypt(ciphertext, context) {
      const envelope = JSON.parse(
        Buffer.from(ciphertext, 'base64url').toString('utf8'),
      ) as Envelope;
      if (envelope.v !== FORMAT) throw new Error('unsupported secret format');
      if (envelope.kid !== kid)
        throw new Error(`secret encrypted with unknown key "${envelope.kid}"`);
      const dataKey = open(masterKey, envelope.wk, `${envelope.kid}:${context}`);
      try {
        return open(dataKey, envelope.ct, context).toString('utf8');
      } finally {
        dataKey.fill(0);
      }
    },
  };
}
