import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('create a design from the shirt template, change it, save a revision, compare and restore (I12)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await createVerifiedAccount(undefined, 'Dev Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  // A project to hold the design.
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Summer shirts');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Summer shirts' })).toBeVisible();

  // New design from the woven shirt template.
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Oxford');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Oxford' })).toBeVisible();
  await expect(page.getByText('Same as the latest revision')).toBeVisible();

  // Change the draft (developer JSON view) and save it.
  const editor = page.getByLabel('Design state (JSON)');
  const text = await editor.inputValue();
  expect(text).toContain('"Shirt body"');
  await editor.fill(text.replace('"Shirt body"', '"Main body"'));
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await expect(page.getByTestId('uncommitted')).toBeVisible();

  // Save it as revision R002.
  await page.getByLabel('Revision note').fill('Renamed the body');
  await page.getByRole('button', { name: 'Save as revision' }).click();
  await expect(page.getByText(/Saved DSN-\d+-R002/)).toBeVisible();

  // History: two revisions; compare R002 with R001.
  await page.getByRole('tab', { name: 'History' }).click();
  await expect(page.getByTestId('revision-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Compare with previous' }).click();
  await expect(page.getByTestId('compare-summary')).toContainText(
    'Renamed Shirt body to Main body',
  );

  // Restore R001 into the draft — history is kept.
  const r001 = page.getByTestId('revision-row').filter({ hasText: 'R001' });
  await r001.getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText(/R001 is now the draft/)).toBeVisible();
  await expect(page.getByTestId('revision-row')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Draft' }).click();
  await expect(page.getByText('Restored from an earlier revision')).toBeVisible();
  expect(await page.getByLabel('Design state (JSON)').inputValue()).toContain('"Shirt body"');
});
