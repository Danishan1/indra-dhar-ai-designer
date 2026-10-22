import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newId } from '@ai-designer/db';
import { type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startTestApp } from '../app-factory.js';
import { TestClient } from '../helpers/http-client.js';
import { tokenFromLink, waitForEmail } from '../helpers/mailpit.js';

function readAll(dir: string): string {
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .map((p) => (statSync(p).isDirectory() ? readAll(p) : readFileSync(p, 'utf8')))
    .join('\n');
}

describe('auth flows never log secrets (TR-SEC-023 subset, AC2)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const logDir = mkdtempSync(join(tmpdir(), 'aid-logs-'));

  beforeAll(async () => {
    ({ app, baseUrl } = await startTestApp({
      LOG_LEVEL: 'debug',
      LOG_TO_FILE: 'true',
      LOG_DIR: logDir,
    }));
  });

  afterAll(async () => {
    await app.close();
    rmSync(logDir, { recursive: true, force: true });
  });

  it('passwords, email tokens and session cookies do not appear in log files', async () => {
    const password = `Secret-${newId()}`;
    const newPassword = `Newer-${newId()}`;
    const email = `logs-${newId()}@example.com`;
    const client = new TestClient(baseUrl);
    await client.post('/v1/auth/register', { email, password, displayName: 'Logs' });
    const verifyToken = tokenFromLink(
      (await waitForEmail(email, /confirm/i)).text,
      '/verify-email',
    );
    await client.post('/v1/auth/verify-email', { token: verifyToken });
    await client.post('/v1/auth/login', { email, password: 'wrong password but long' });
    await client.post('/v1/auth/login', { email, password });
    const session = client.cookies.get('__Host-aid_session') ?? '';
    expect(session).not.toBe('');
    await client.get('/v1/me');
    await client.post('/v1/auth/password/forgot', { email });
    const resetToken = tokenFromLink(
      (await waitForEmail(email, /reset your password/i)).text,
      '/reset-password',
    );
    await client.post('/v1/auth/password/reset', { token: resetToken, newPassword });
    await new Promise((r) => setTimeout(r, 500)); // let file streams flush

    const logs = readAll(logDir);
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of [
      password,
      newPassword,
      verifyToken,
      resetToken,
      session,
      session.split('.')[0] ?? 'x',
    ]) {
      expect(logs.includes(secret)).toBe(false);
    }
  });
});
