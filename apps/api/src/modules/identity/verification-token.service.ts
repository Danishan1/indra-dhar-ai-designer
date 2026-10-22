import { newId } from '@ai-designer/db';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../platform/prisma/prisma.service.js';

import { hashIdentifier, randomToken } from './crypto.js';

export type OwnTokenPurpose = 'email-verification';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 3_600_000;

/**
 * Our single-use tokens in `verification_tokens` (shared with Better Auth's reset tokens):
 * identifier = SHA-256("<purpose>:<token>"), value = "<purpose>:<userId>". The raw token only
 * exists in the email (FR-SEC-012). Consumption is one atomic DELETE … RETURNING (FR-SEC-015).
 */
@Injectable()
export class VerificationTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a new token, invalidating earlier unused tokens of the same purpose for the user. */
  async issue(purpose: OwnTokenPurpose, userId: string, ttlMs: number): Promise<string> {
    const token = randomToken();
    const value = `${purpose}:${userId}`;
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({ where: { value } }),
      this.prisma.verificationToken.create({
        data: {
          id: newId(),
          identifier: hashIdentifier(`${purpose}:${token}`),
          value,
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  /** Returns the user id when the token is valid, unexpired and unused; consumes it. */
  async consume(purpose: OwnTokenPurpose, token: string): Promise<string | null> {
    const identifier = hashIdentifier(`${purpose}:${token}`);
    const rows = await this.prisma.$queryRaw<{ value: string; expired: boolean }[]>`
      DELETE FROM verification_tokens
      WHERE identifier = ${identifier} AND value LIKE ${`${purpose}:%`}
      RETURNING value, expires_at <= now() AS expired`;
    const row = rows[0];
    if (!row || row.expired) return null;
    return row.value.slice(purpose.length + 1);
  }
}
