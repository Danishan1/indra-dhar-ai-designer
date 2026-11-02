import { createSecretCipher, type SecretCipher } from '@ai-designer/secrets';
import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../config/app-config.js';

/**
 * Envelope encryption for secrets at rest (ADR-007, minimal version introduced in I08): each
 * secret gets a random data key (AES-256-GCM); the data key is wrapped by the master key from
 * `SECRETS_MASTER_KEY`. `context` is bound as additional authenticated data, so a ciphertext copied
 * to another row/purpose fails to decrypt. The cipher lives in `@ai-designer/secrets` so the worker
 * can read organization AI provider keys (ADR-057). I22 adds key rotation (new `kid`).
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger('Secrets');
  private readonly cipher: SecretCipher;

  constructor(config: AppConfig) {
    this.cipher = createSecretCipher({
      masterKey: config.env.SECRETS_MASTER_KEY,
      devSecret: config.env.BETTER_AUTH_SECRET,
    });
    if (this.cipher.development)
      // Outside production only (env validation requires the key in production).
      this.logger.warn(
        'SECRETS_MASTER_KEY not set — using a development key derived from BETTER_AUTH_SECRET',
      );
  }

  encrypt(plaintext: string, context: string): string {
    return this.cipher.encrypt(plaintext, context);
  }

  decrypt(ciphertext: string, context: string): string {
    return this.cipher.decrypt(ciphertext, context);
  }
}
