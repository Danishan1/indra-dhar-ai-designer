import { createHash, createHmac, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url (43 chars) — for email links (FR-SEC-012). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Hash used for `verification_tokens.identifier` — identical to Better Auth's "hashed" storage
 * (SHA-256, base64url, no padding), so our tokens and its reset tokens share one scheme.
 */
export function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('base64url');
}

/** Keyed hash of an IP address: lets us correlate sessions without storing raw IPs. */
export function hashIp(secret: string, ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('base64url').slice(0, 32);
}

/** Short, non-reversible reference for logs/audit when no user id exists (unknown email). */
export function emailRef(secret: string, email: string): string {
  return createHmac('sha256', secret).update(`email:${email}`).digest('base64url').slice(0, 16);
}
