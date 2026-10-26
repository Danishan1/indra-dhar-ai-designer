import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('browse the library, create a lace artifact, add a revision, deactivate it (I13)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await createVerifiedAccount(undefined, 'Lib Rarian');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  await page.getByRole('link', { name: 'Library' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();

  // Built-in items, by category, with previews.
  await page.getByRole('tab', { name: 'Collars' }).click();
  const collar = page.getByTestId('artifact-card').filter({ hasText: 'Point collar' });
  await expect(collar).toBeVisible();
  await expect(collar).toContainText('Built-in');
  const img = collar.getByRole('img', { name: 'Point collar' });
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  // Create a private lace artifact.
  await page.getByRole('button', { name: 'New artifact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New artifact' });
  await dialog.getByLabel('Name').fill('Our scalloped lace');
  await dialog.getByLabel('Preferred regions').fill('hem');
  await dialog.getByRole('button', { name: 'Create artifact' }).click();
  await expect(page.getByText(/Created LAC-\d{4}/)).toBeVisible();
  const drawer = page.getByRole('dialog').filter({ hasText: 'Our scalloped lace' });
  await expect(drawer.getByTestId('artifact-revision')).toHaveCount(1);
  await expect(drawer).toContainText('Not specified — this is a design asset');

  // New immutable revision.
  await drawer.getByRole('button', { name: 'New revision' }).click();
  const revise = page.getByRole('dialog', { name: /New revision of Our scalloped lace/ });
  await revise.getByLabel('Allowed regions').fill('hem, opening');
  await revise.getByLabel('What changed').fill('Only hems and openings');
  await revise.getByRole('button', { name: 'Save revision' }).click();
  await expect(page.getByText(/Saved LAC-\d{4}-R002/)).toBeVisible();
  await expect(drawer.getByTestId('artifact-revision')).toHaveCount(2);
  await expect(drawer.getByTestId('artifact-revision').first()).toContainText(
    'Only hems and openings',
  );

  // Deactivate: hidden from browsing unless asked for.
  await drawer.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('Deactivated', { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Lace' }).click();
  await expect(
    page.getByTestId('artifact-card').filter({ hasText: 'Our scalloped lace' }),
  ).toHaveCount(0);
  await page.getByLabel('Show deactivated').check();
  await expect(
    page.getByTestId('artifact-card').filter({ hasText: 'Our scalloped lace' }),
  ).toBeVisible();
});
