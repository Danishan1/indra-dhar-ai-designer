import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { selectInTree } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

async function openEditor(page: Page) {
  const email = await createVerifiedAccount(undefined, 'Checking Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Checks');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Checked shirt');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByTestId('garment-canvas').waitFor();
}

test('a blocking design-structure finding appears, navigates to the part and disappears when fixed (I20)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openEditor(page);
  const tree = page.getByRole('tree', { name: 'Components' });
  const cuffId = await tree
    .getByRole('treeitem', { name: 'Left cuff', exact: true })
    .getAttribute('data-component-id');

  // The panel always says what it is (and what it is not).
  await page.getByRole('tab', { name: /^Validation/ }).click();
  const panel = page.getByTestId('validation-panel');
  await expect(panel.getByTestId('validation-scope')).toHaveText('Design structure validation');
  await expect(panel).toContainText('not production readiness');
  await expect(panel).toContainText('design-structure@1.0.0');
  await expect(panel.getByTestId('validation-filter-blocking')).toContainText('Blocking 0');

  // Make it invalid: a sleeveless sleeve that still has a cuff.
  await selectInTree(page, 'Left sleeve');
  await page
    .getByTestId('component-properties')
    .getByRole('combobox', { name: 'Sleeve type', exact: true })
    .click();
  await page.getByRole('option', { name: 'Sleeveless' }).click();

  const finding = panel.locator(
    '[data-testid="validation-finding"][data-rule-id="dependency.cuff_requires_sleeve"]',
  );
  await expect(finding).toBeVisible({ timeout: 15_000 });
  await expect(finding).toHaveAttribute('data-kind', 'blocking');
  await expect(finding).toContainText('Blocking');
  await expect(finding).toContainText('sleeveless');
  await expect(finding).toContainText('→ Remove Left cuff');
  await expect(panel.getByTestId('validation-filter-blocking')).toContainText('Blocking 1');
  // Shown on the drawing and in the tree, by the component's stable id.
  await expect(page.locator(`[data-finding-marker="${cuffId}"]`).first()).toBeAttached();
  await expect(
    tree.getByRole('treeitem', { name: 'Left cuff', exact: true }).getByTestId('tree-finding'),
  ).toHaveAttribute('data-kind', 'blocking');

  // Click to navigate (FR-EDT-120).
  await finding.getByRole('button', { name: 'Show Left cuff' }).click();
  await expect(page.getByTestId('properties-title')).toHaveText('Left cuff');
  await expect(page.getByTestId('component-findings')).toContainText('sleeveless');

  // Fix it: remove the cuff. The finding disappears after the automatic re-check.
  await tree.getByRole('treeitem', { name: 'Left cuff', exact: true }).hover();
  await page.getByRole('button', { name: 'Actions for Left cuff' }).click();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  await expect(panel.locator('[data-rule-id="dependency.cuff_requires_sleeve"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(panel.getByTestId('validation-filter-blocking')).toContainText('Blocking 0');
  await expect(page.locator(`[data-finding-marker="${cuffId}"]`)).toHaveCount(0);
});
