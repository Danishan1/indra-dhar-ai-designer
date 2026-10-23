import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../config/app-config.js';

const ALG = 'aes-256-gcm';
const FORMAT = 'v1';

interface Envelope {
  /** format version */
  v: typeof FORMAT;
  /** master key id (for rotation) */
  kid: string;
  /** data key wrapped by the master key: iv.ciphertext.tag (base64url) */
  wk: string;
  /** payload encrypted with the data key: iv.ciphertext.tag (base64url) */
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

/**
 * Envelope encryption for secrets at rest (ADR-007, minimal version introduced in I08): each
 * secret gets a random data key (AES-256-GCM); the data key is wrapped by the master key from
 * `SECRETS_MASTER_KEY`. `context` is bound as additional authenticated data, so a ciphertext copied
 * to another row/purpose fails to decrypt. I22 adds key rotation (new `kid`) and provider keys.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger('Secrets');
  private readonly masterKey: Buffer;
  private readonly kid: string;

  constructor(config: AppConfig) {
    const configured = config.env.SECRETS_MASTER_KEY;
    if (configured) {
      this.masterKey = Buffer.from(configured, 'base64');
      this.kid = 'k1';
    } else {
      // Outside production only (env validation requires the key in production).
      this.masterKey = Buffer.from(
        hkdfSync('sha256', config.env.BETTER_AUTH_SECRET, 'aid-secrets', 'dev-master-key', 32),
      );
      this.kid = 'dev';
      this.logger.warn(
        'SECRETS_MASTER_KEY not set — using a development key derived from BETTER_AUTH_SECRET',
      );
    }
  }

  encrypt(plaintext: string, context: string): string {
    const dataKey = randomBytes(32);
    const envelope: Envelope = {
      v: FORMAT,
      kid: this.kid,
      wk: seal(this.masterKey, dataKey, `${this.kid}:${context}`),
      ct: seal(dataKey, Buffer.from(plaintext, 'utf8'), context),
    };
    dataKey.fill(0);
    return Buffer.from(JSON.stringify(envelope)).toString('base64url');
  }

  decrypt(ciphertext: string, context: string): string {
    const envelope = JSON.parse(Buffer.from(ciphertext, 'base64url').toString('utf8')) as Envelope;
    if (envelope.v !== FORMAT) throw new Error('unsupported secret format');
    if (envelope.kid !== this.kid)
      throw new Error(`secret encrypted with unknown key "${envelope.kid}"`);
    const dataKey = open(this.masterKey, envelope.wk, `${envelope.kid}:${context}`);
    try {
      return open(dataKey, envelope.ct, context).toString('utf8');
    } finally {
      dataKey.fill(0);
    }
  }
}
