import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';

import { linkFrom, waitForEmailText } from './mailpit.js';

export const E2E_PASSWORD = 'e2e passphrase long enough';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const WEB_ORIGIN = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

/** Clears local auth rate-limit counters (dev Redis) so repeated e2e runs are not throttled. */
export async function resetRateLimits(): Promise<void> {
  const redis = new Redis(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const keys = await redis.keys('aid:rl:*');
    if (keys.length) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

/** Creates and verifies an account through the API + Mailpit (fast path for test setup). */
export async function createVerifiedAccount(
  email = uniqueEmail(),
  displayName = 'E2E User',
): Promise<string> {
  const headers = { 'content-type': 'application/json', origin: WEB_ORIGIN };
  const reg = await fetch(`${API}/v1/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password: E2E_PASSWORD, displayName }),
  });
  if (reg.status !== 202) throw new Error(`register failed: ${reg.status}`);
  const link = linkFrom(await waitForEmailText(email, /confirm your email/i), '/verify-email');
  const token = new URL(link).searchParams.get('token');
  const verify = await fetch(`${API}/v1/auth/verify-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
  if (verify.status !== 200) throw new Error(`verify failed: ${verify.status}`);
  return email;
}
