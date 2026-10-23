import { newId } from '@ai-designer/db';
import { totpCode } from '@ai-designer/test-utils';

import { TestClient } from './http-client.js';
import { tokenFromLink, waitForEmail } from './mailpit.js';

export const TEST_PASSWORD = 'correct horse battery staple';

export const newEmail = (prefix = 'it') => `${prefix}-${newId()}@example.com`;

/**
 * Registers, verifies (via Mailpit) and signs in a new user; returns its client. With `mfa`
 * (default) the user also enrols an authenticator app, so the session is MFA-verified and fresh
 * for step-up — privileged actions require that since I08.
 */
export async function signedInUser(
  baseUrl: string,
  email = newEmail(),
  displayName = 'Test User',
  options: { mfa?: boolean } = {},
): Promise<{
  client: TestClient;
  email: string;
  totpSecret: string | null;
  recoveryCodes: string[];
}> {
  const client = new TestClient(baseUrl);
  const reg = await client.post('/v1/auth/register', {
    email,
    password: TEST_PASSWORD,
    displayName,
  });
  if (reg.status !== 202) throw new Error(`register ${reg.status}`);
  const token = tokenFromLink(
    (await waitForEmail(email, /confirm your email/i)).text,
    '/verify-email',
  );
  if ((await client.post('/v1/auth/verify-email', { token })).status !== 200)
    throw new Error('verify failed');
  if ((await client.post('/v1/auth/login', { email, password: TEST_PASSWORD })).status !== 200)
    throw new Error('login failed');
  if (options.mfa === false) return { client, email, totpSecret: null, recoveryCodes: [] };
  const { secret, recoveryCodes } = await enrollTotp(client);
  return { client, email, totpSecret: secret, recoveryCodes };
}

/** Enrols TOTP for the signed-in client (setup → confirm). */
export async function enrollTotp(
  client: TestClient,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await client.post('/v1/me/mfa/totp/setup');
  if (setup.status !== 200) throw new Error(`totp setup ${setup.status}`);
  const { secret } = (await setup.json()) as { secret: string };
  const confirm = await client.post('/v1/me/mfa/totp/confirm', { code: totpCode(secret) });
  if (confirm.status !== 200)
    throw new Error(`totp confirm ${confirm.status} ${await confirm.text()}`);
  const { codes } = (await confirm.json()) as { codes: string[] };
  return { secret, recoveryCodes: codes };
}
