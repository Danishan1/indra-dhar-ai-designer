import { randomUUID } from 'node:crypto';

import { totpCode } from '@ai-designer/test-utils';
import { expect, type Page } from '@playwright/test';

import { E2E_PASSWORD } from './accounts.js';

export function uniqueOrgName(prefix = 'E2E Org'): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

/** Fills the sign-in form (the page must already show it). */
export async function submitSignIn(page: Page, email: string, password = E2E_PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** A new user without an organization lands on onboarding; create one there. */
export async function createOrganizationInOnboarding(page: Page, name = uniqueOrgName()) {
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole('heading', { name: /^Welcome/ })).toBeVisible();
  await page.getByLabel('Organization name').fill(name);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(
    page.getByRole('button', { name: `Organization: ${name}. Switch organization` }),
  ).toBeVisible();
  return name;
}

/**
 * Turns on two-step verification through Settings → Your security and returns the TOTP secret
 * (read from the "setup key" shown for manual entry). Leaves the page on the security settings.
 */
export async function enrollMfaInUi(page: Page): Promise<{ secret: string; lastCode: string }> {
  await page.goto('/settings/security');
  await page.getByRole('button', { name: 'Set up authenticator app' }).click();
  const dialog = page.getByRole('dialog');
  const secret = ((await dialog.getByTestId('totp-secret').textContent()) ?? '').trim();
  const code = totpCode(secret);
  await dialog.getByLabel('Code from the app').fill(code);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(dialog.getByTestId('recovery-codes')).toBeVisible();
  await dialog.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(page.getByRole('heading', { name: 'Two-step verification is on' })).toBeVisible();
  return { secret, lastCode: code };
}
