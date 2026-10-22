import { expect, test } from '@playwright/test';

import { E2E_PASSWORD, resetRateLimits, uniqueEmail } from '../support/accounts.js';
import { linkFrom, waitForEmailText } from '../support/mailpit.js';

// These run signed out (own empty storage state).
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('sign up → confirm email → sign in → sign out (AC1)', async ({ page }) => {
  const email = uniqueEmail('signup');
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprojects$/);

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Sam Signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  await page.goto(linkFrom(await waitForEmailText(email, /confirm your email/i), '/verify-email'));
  await expect(page.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not the right password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Incorrect email or password')).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-aid_session');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/system');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fsystem$/);
});

test('returnTo brings the user back after sign-in and ignores external URLs', async ({ page }) => {
  const { createVerifiedAccount } = await import('../support/accounts.js');
  const email = await createVerifiedAccount();
  await page.goto('/sign-in?returnTo=https://evil.example/phish');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.context().clearCookies();
  await page.goto('/library');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test('forgot password → reset → sign in with the new password', async ({ page }) => {
  const { createVerifiedAccount } = await import('../support/accounts.js');
  const email = await createVerifiedAccount();
  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.waitForLoadState('networkidle'); // dev server compiles the page on first visit
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If this address has an account')).toBeVisible();

  await page.goto(
    linkFrom(await waitForEmailText(email, /reset your password/i), '/reset-password'),
  );
  const newPassword = 'a fresh new passphrase';
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Confirm new password').fill(newPassword);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Password changed. Sign in with your new password.')).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
});
