import { randomUUID } from 'node:crypto';

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
