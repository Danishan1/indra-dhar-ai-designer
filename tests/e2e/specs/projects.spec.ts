import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('create a project, edit it, archive it, find it under Archived, restore it (I10)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = await createVerifiedAccount(undefined, 'Pia Projects');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill('Linen shirt');
  await dialog.getByLabel('Season').fill('SS27');
  await dialog.getByRole('button', { name: 'Create project' }).click();

  // Lands on the new project with a display id and an Active badge.
  await expect(page.getByRole('heading', { level: 1, name: 'Linen shirt' })).toBeVisible();
  await expect(page.getByText(/PRJ-\d+/).first()).toBeVisible();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

  // Edit the details.
  await page.getByLabel('Brand').fill('Indradhar');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Project saved')).toBeVisible();

  // Archive with confirmation.
  await page.getByRole('button', { name: 'Archive' }).click();
  await page
    .getByRole('dialog', { name: 'Archive this project?' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(page.getByText('Project archived')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();

  // Archived projects are hidden from active work but findable.
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page.getByText('No projects yet')).toBeVisible();
  await page.getByRole('combobox', { name: 'Status' }).click();
  await page.getByRole('option', { name: 'Archived' }).click();
  const card = page.getByTestId('project-card').filter({ hasText: 'Linen shirt' });
  await expect(card).toBeVisible();

  // Restore it.
  await card.click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page
    .getByRole('dialog', { name: 'Restore this project?' })
    .getByRole('button', { name: 'Restore' })
    .click();
  await expect(page.getByText('Project restored')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
});
