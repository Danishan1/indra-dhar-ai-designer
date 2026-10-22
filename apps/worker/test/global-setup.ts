import { resetTestDatabase } from '@ai-designer/db/testing';

import { applyTestEnv } from './test-env.js';

/** Resets the test database (compose `test` profile, or AID_IT_DATABASE_URL) before the run. */
export async function setup(): Promise<void> {
  applyTestEnv();
  await resetTestDatabase(process.env.DATABASE_URL ?? '');
}
