import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { setLength } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

async function openEditor(page: Page) {
  const email = await createVerifiedAccount(undefined, 'History Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('History');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Versioned shirt');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByTestId('garment-canvas').waitFor();
}

const saved = (page: Page) =>
  expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');

async function commit(page: Page, description: string, expectChange: RegExp) {
  await page.getByTestId('commit-button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Commit a new revision' });
  await expect(dialog.getByTestId('commit-changes')).toContainText(expectChange);
  await dialog.getByLabel('Description (optional)').fill(description);
  await dialog.getByRole('button', { name: 'Commit revision' }).click();
  await expect(dialog).toBeHidden();
}

test('commit, history, compare, view and restore revisions (I19)', async ({ page }) => {
  test.setTimeout(180_000);
  await openEditor(page);
  const latest = page.getByTestId('latest-revision-badge');
  await expect(latest).toHaveText('Latest R001');

  // R002: longer sleeves. The working copy is autosaved, but only a commit makes a revision.
  await setLength(page, 'Left sleeve', 'Sleeve length', '64');
  await saved(page);
  await expect(page.getByTestId('working-copy-badge')).toContainText('changed');
  await expect(latest).toHaveText('Latest R001');
  await commit(page, 'Longer sleeves', /Left sleeve: Sleeve length set to 640 mm/);
  await expect(latest).toHaveText('Latest R002');
  await expect(page.getByTestId('working-copy-badge')).not.toContainText('changed');

  // R003: shorter again.
  await setLength(page, 'Left sleeve', 'Sleeve length', '58');
  await saved(page);
  await commit(page, 'Shorter sleeves', /Sleeve length set to 580 mm/);
  await expect(latest).toHaveText('Latest R003');

  // History: newest first, author, summary, lineage.
  await page
    .getByRole('tablist', { name: 'Right panel' })
    .getByRole('tab', { name: 'History' })
    .click();
  const items = page.getByTestId('revision-item');
  await expect(items.getByTestId('revision-label')).toHaveText(['R003', 'R002', 'R001']);
  await expect(items.first()).toContainText('Latest');
  await expect(items.first()).toContainText('History Designer');
  await expect(items.first()).toContainText('Shorter sleeves');
  await expect(items.first()).toContainText('After R002');
  await expect(page.getByTestId('history-working-copy')).toContainText('Committed');

  // Compare R001 with R003: the sleeve change is listed and highlighted; panels say which is which.
  await items.nth(2).getByRole('button', { name: 'Compare R001' }).click();
  const compare = page.getByTestId('compare-view');
  // The editing panels are out of the way while comparing.
  await expect(page.getByTestId('garment-canvas')).toBeHidden();
  await compare.getByRole('combobox', { name: 'Compare to' }).click();
  await page.getByRole('option', { name: /^R003/ }).click();
  await expect(compare.getByTestId('compare-a-label')).toHaveText('A · R001');
  await expect(compare.getByTestId('compare-b-label')).toHaveText('B · R003');
  const entry = compare.getByTestId('diff-entry').filter({ hasText: 'Sleeve length' });
  await expect(entry).toContainText('580 mm');
  const sleeveId = await entry.getAttribute('data-component-id');
  await expect(
    compare.locator(`[data-testid="compare-b"] [data-changed-component="${sleeveId}"]`).first(),
  ).toBeAttached();
  // Overlay with an opacity slider.
  await compare.getByRole('radio', { name: 'Overlay' }).click();
  await expect(compare.getByTestId('overlay-a')).toBeAttached();
  await expect(compare.getByTestId('overlay-b')).toBeAttached();
  await compare.getByRole('button', { name: 'Back to editing' }).click();
  await expect(page.getByTestId('garment-canvas')).toBeVisible();

  // View R002 read-only.
  await items.nth(1).getByRole('button', { name: 'View R002' }).click();
  const banner = page.getByTestId('revision-banner');
  await expect(banner).toContainText('Viewing R002 (read-only)');
  await expect(banner).toContainText('Integrity verified');
  await expect(page.getByTestId('revision-flat')).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('revision-view')).toHaveCount(0);

  // Restore R001: a new working state; history is untouched.
  await items.nth(2).getByRole('button', { name: 'Restore R001' }).click();
  const restore = page.getByRole('dialog', { name: 'Restore R001 to the working copy?' });
  await restore.getByRole('button', { name: 'Restore R001' }).click();
  await expect(restore).toBeHidden();
  await expect(page.getByTestId('restored-badge')).toHaveText('Restored from R001');
  await expect(items.getByTestId('revision-label')).toHaveText(['R003', 'R002', 'R001']);

  // Commit R004: after R003, restored from R001.
  await commit(page, 'Back to the original', /Sleeve length/);
  await expect(latest).toHaveText('Latest R004');
  await expect(page.getByTestId('restored-badge')).toHaveCount(0);
  await expect(items.getByTestId('revision-label')).toHaveText(['R004', 'R003', 'R002', 'R001']);
  await expect(items.first()).toContainText('After R003');
  await expect(items.first()).toContainText('restored from R001');
});
