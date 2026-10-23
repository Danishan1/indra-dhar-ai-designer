import type { TenantFixtureDeps } from '@ai-designer/test-utils';
import type { Redis } from 'ioredis';

import { newEmail, signedInUser } from '../integration/helpers/accounts.js';
import { tokenFromLink, waitForEmail } from '../integration/helpers/mailpit.js';

/** Tenant fixture dependencies backed by the real API + test Mailpit. */
export function fixtureDeps(baseUrl: string): TenantFixtureDeps {
  return {
    baseUrl,
    newEmail,
    signUp: async (email, displayName) => (await signedInUser(baseUrl, email, displayName)).client,
    invitationToken: async (email) =>
      tokenFromLink((await waitForEmail(email, /invitation to join/i)).text, '/invitations/accept'),
  };
}

export async function clearRateLimits(redis: Redis): Promise<void> {
  const keys = await redis.keys('aid:rl:*');
  if (keys.length) await redis.del(...keys);
}

export const json = async <T>(res: Response) => (await res.json()) as T;
