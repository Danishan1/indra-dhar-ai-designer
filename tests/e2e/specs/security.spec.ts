import { freshTotpCode } from '@ai-designer/test-utils';
import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, enrollMfaInUi, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('enrol two-step verification, sign out, sign in with a code, revoke the other session', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const email = await createVerifiedAccount(undefined, 'Mona MFA');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  const { secret, lastCode } = await enrollMfaInUi(page);

  // Sign out and back in: the password alone is not enough.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await submitSignIn(page, email);
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await page.getByLabel('Authentication code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('That code is not valid')).toBeVisible();
  const code = await freshTotpCode(secret, lastCode);
  await page.getByLabel('Authentication code').fill(code);
  await page.getByRole('button', { name: 'Verify' }).click();
  // Back where the user signed out from.
  await expect(page.getByRole('heading', { level: 1, name: 'Your security' })).toBeVisible();

  // A second device signs in too.
  const otherCtx = await browser.newContext();
  const other = await otherCtx.newPage();
  await other.goto('/sign-in');
  await submitSignIn(other, email);
  await other.getByLabel('Authentication code').fill(await freshTotpCode(secret, code));
  await other.getByRole('button', { name: 'Verify' }).click();
  await expect(other.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  // The first device sees both sessions and signs the other one out.
  await page.goto('/settings/security');
  await expect(page.getByTestId('session-row')).toHaveCount(2);
  await expect(page.getByTestId('session-row').filter({ hasText: 'This device' })).toHaveCount(1);
  await page
    .getByTestId('session-row')
    .filter({ hasNotText: 'This device' })
    .getByRole('button', { name: 'Sign out' })
    .click();
  await expect(page.getByText('Session signed out')).toBeVisible();
  await expect(page.getByTestId('session-row')).toHaveCount(1);

  await other.reload();
  await expect(other).toHaveURL(/\/sign-in/);

  // The audit log shows what happened.
  await page.goto('/settings/audit');
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
  await expect(page.getByTestId('audit-row').first()).toBeVisible();

  await ctx.close();
  await otherCtx.close();
});
