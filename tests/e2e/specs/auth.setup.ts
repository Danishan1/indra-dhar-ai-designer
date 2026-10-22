import { expect, test as setup } from '@playwright/test';

import { createVerifiedAccount, E2E_PASSWORD, resetRateLimits } from '../support/accounts.js';

export const STORAGE_STATE = '.auth/user.json';

/** Signs in once through the UI and saves the session for the signed-in specs. */
setup('sign in a test user', async ({ page }) => {
  await resetRateLimits();
  const email = await createVerifiedAccount();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
