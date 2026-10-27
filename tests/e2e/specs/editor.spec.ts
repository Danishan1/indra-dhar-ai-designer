import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

const saveStatus = (page: Page) => page.locator('[data-save-status]');

/** Debug panel (dev builds): one `set_property` through the real save pipeline. */
async function setSleeveLength(page: Page, mm: string) {
  const panel = page.getByRole('region', { name: 'Debug operations' });
  await panel.getByRole('combobox', { name: 'Debug component' }).click();
  await page.getByRole('option', { name: 'Left sleeve' }).click();
  await panel.getByRole('combobox', { name: 'Debug property' }).click();
  await page.getByRole('option', { name: 'sleeve length' }).click();
  await panel.getByLabel('Debug value').fill(mm);
  await panel.getByRole('button', { name: 'Apply operation' }).click();
}

test('editor: autosave, undo/redo through the server and conflict handling (I15)', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const email = await createVerifiedAccount(undefined, 'Editor Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Editor test');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Poplin');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Poplin' })).toBeVisible();

  // Open the editor workspace.
  await page.getByRole('link', { name: 'Open editor' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+\/designs\/[0-9a-f-]+$/);
  for (const region of ['header', 'toolbar', 'hierarchy', 'viewport', 'properties', 'status'])
    await expect(page.locator(`[data-region="${region}"]`)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Poplin' })).toBeVisible();
  // Working copy vs latest vs approved revision (AC8).
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v1');
  await expect(page.getByTestId('latest-revision-badge')).toHaveText('Latest R001');
  await expect(page.getByTestId('approved-revision-badge')).toHaveText('Not approved');
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'saved');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  // A change: optimistic, then "Saved" only after the server acknowledged (AC2, AC3).
  const acked = page.waitForResponse(
    (r) => r.url().endsWith('/operations') && r.request().method() === 'POST',
  );
  await setSleeveLength(page, '640');
  expect((await acked).status()).toBe(201);
  await expect(saveStatus(page)).toHaveAttribute('data-save-status', 'saved');
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v2 · changed');
  await expect(page.getByRole('list', { name: 'Undo history' })).toContainText('Set sleeve length');

  // Undo / redo are server operations (AC4); committed revisions stay untouched.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('working-copy-badge')).toHaveText(/Working copy · v3/);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
  // Keyboard redo from the workspace (not inside a field).
  await page.locator('[data-region="viewport"]').click();
  await page.keyboard.press('Control+Shift+Z');
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v4 · changed');
  await expect(page.getByTestId('latest-revision-badge')).toHaveText('Latest R001');

  // Shortcuts do not fire while typing (AC7): Ctrl+Z in a field does not undo.
  await page.getByLabel('Debug value').fill('650');
  await page.getByLabel('Debug value').press('Control+Z');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v4 · changed');

  // Two tabs on the same design: the stale one gets a conflict, never a silent overwrite (AC5).
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const page2 = await other.newPage();
  await page2.goto(page.url());
  await expect(page2.getByTestId('working-copy-badge')).toHaveText('Working copy · v4 · changed');
  await setSleeveLength(page, '700');
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v5 · changed');

  await setSleeveLength(page2, '720');
  const conflict = page2.getByRole('dialog', { name: 'This design changed elsewhere' });
  await expect(conflict).toBeVisible();
  await expect(saveStatus(page2)).toHaveAttribute('data-save-status', 'conflict');
  // Decide later: the conflict stays visible in the header.
  await conflict.getByRole('button', { name: 'Cancel' }).click();
  await expect(page2.getByRole('button', { name: 'Resolve' })).toBeVisible();
  await page2.getByRole('button', { name: 'Resolve' }).click();
  await conflict.getByRole('button', { name: 'Re-apply my changes' }).click();
  await expect(saveStatus(page2)).toHaveAttribute('data-save-status', 'saved');
  await expect(page2.getByTestId('working-copy-badge')).toHaveText('Working copy · v6 · changed');
  await other.close();
});

test('designs of archived projects open read-only in the editor', async ({ page }) => {
  test.setTimeout(90_000);
  const email = await createVerifiedAccount(undefined, 'Archivist');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Old line');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  await page.getByRole('dialog', { name: 'New design' }).getByLabel('Name').fill('Archived tee');
  await page.getByRole('button', { name: 'Create design' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Archived tee' })).toBeVisible();
  const editorUrl = await page.getByRole('link', { name: 'Open editor' }).getAttribute('href');
  const projectUrl = editorUrl!.replace(/\/designs\/.*$/, '');

  // Archive the project: its designs become read-only.
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Archive' }).click();
  await page
    .getByRole('dialog', { name: 'Archive this project?' })
    .getByRole('button', { name: 'Archive' })
    .click();
  await expect(page.getByText('Project archived')).toBeVisible();

  await page.goto(editorUrl!);
  await expect(page.getByTestId('read-only-badge')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Debug operations' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
