import { newId } from '@ai-designer/db';

import { TestClient } from './http-client.js';
import { tokenFromLink, waitForEmail } from './mailpit.js';

export const TEST_PASSWORD = 'correct horse battery staple';

export const newEmail = (prefix = 'it') => `${prefix}-${newId()}@example.com`;

/** Registers, verifies (via Mailpit) and signs in a new user; returns its client. */
export async function signedInUser(
  baseUrl: string,
  email = newEmail(),
  displayName = 'Test User',
): Promise<{ client: TestClient; email: string }> {
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
  return { client, email };
}
