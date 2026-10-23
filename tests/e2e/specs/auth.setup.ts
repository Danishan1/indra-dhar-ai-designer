import { expect, test as setup } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

export const STORAGE_STATE = '.auth/user.json';

/**
 * Signs in once through the UI, creates the user's first organization in onboarding and saves the
 * session for the signed-in specs.
 */
setup('sign in a test user with an organization', async ({ page }) => {
  await resetRateLimits();
  const email = await createVerifiedAccount();
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  await page.context().storageState({ path: STORAGE_STATE });
});
