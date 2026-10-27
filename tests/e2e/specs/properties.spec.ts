import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { selectInTree, setLength } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

async function openEditor(page: Page) {
  const email = await createVerifiedAccount(undefined, 'Properties Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Props');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Oxford props');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByTestId('garment-canvas').waitFor();
}

const panel = (page: Page) => page.getByTestId('component-properties');
const saved = (page: Page) =>
  expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');

test('hierarchy, contextual properties, validation, review and bulk edit (I17)', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openEditor(page);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') requests.push(new URL(r.url()).pathname);
  });

  // AC1: every component, including repeated ones, is in the tree.
  const tree = page.getByRole('tree', { name: 'Components' });
  for (const name of [
    'Shirt body',
    'Left sleeve',
    'Right sleeve',
    'Left cuff',
    'Right cuff',
    'Collar',
  ])
    await expect(tree.getByRole('treeitem', { name, exact: true })).toBeVisible();
  await expect(page.getByTestId('design-properties')).toBeVisible();

  // Tree → canvas → panel stay in sync.
  await selectInTree(page, 'Left sleeve');
  const item = tree.getByRole('treeitem', { name: 'Left sleeve', exact: true });
  await expect(item).toHaveAttribute('aria-selected', 'true');
  const id = await item.getAttribute('data-component-id');
  await expect(
    page.locator(`[data-highlight="selected"][data-component-id-highlight="${id}"]`).first(),
  ).toBeAttached();
  await expect(page.getByTestId('properties-title')).toHaveText('Left sleeve');
  // AC2: only properties of a sleeve.
  await expect(panel(page).locator('[data-property="dimension.sleeve_length"]')).toBeVisible();
  await expect(panel(page).locator('[data-property="construction.collar_type"]')).toHaveCount(0);

  // AC3: an invalid value is refused before anything is sent.
  const length = panel(page).getByRole('textbox', { name: 'Sleeve length', exact: true });
  const before = requests.length;
  await length.fill('-5');
  await length.press('Enter');
  await expect(panel(page).getByRole('alert')).toContainText('A length cannot be negative');
  await page.waitForTimeout(700);
  expect(requests.length).toBe(before);
  await length.press('Escape');

  // A change redraws the flat; undo restores it (AC6: no AI involved — only operations are posted).
  const sleevePath = page.locator(`[data-view="front"] path[data-element-id="${id}:front:panel"]`);
  const d0 = await sleevePath.getAttribute('d');
  await setLength(page, 'Left sleeve', 'Sleeve length', '30');
  await expect.poll(() => sleevePath.getAttribute('d')).not.toBe(d0);
  await saved(page);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => sleevePath.getAttribute('d')).toBe(d0);
  await saved(page);

  // AC4/AC5: statuses are text + icon; confirming is an explicit, attributed operation.
  const sleeveType = panel(page).locator('[data-property="construction.sleeve_type"]');
  await expect(sleeveType.locator('[data-status="proposed"]').first()).toBeVisible();
  await sleeveType.getByRole('button', { name: /Sleeve type: proposed/ }).click();
  await expect(page.getByTestId('provenance-source')).toHaveText('Template suggestion');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(sleeveType.locator('[data-status="confirmed"]').first()).toBeVisible();
  await saved(page);
  await sleeveType.getByRole('button', { name: /Sleeve type: confirmed/ }).click();
  await expect(page.getByTestId('provenance-confirmed')).toContainText('by you');
  await page.keyboard.press('Escape');

  // Dependency rules: a short sleeve has no cuff; the set cuff type is listed as a conflict.
  await setLength(page, 'Left sleeve', 'Sleeve length', '25');
  await saved(page);
  await selectInTree(page, 'Left cuff');
  const cuffType = panel(page).locator('[data-property="construction.cuff_type"]');
  await expect(cuffType).toContainText('Short sleeves');
  await expect(page.getByRole('region', { name: 'Conflicting values' })).toContainText('Cuff type');

  // Keyboard navigation in the tree.
  await tree.getByRole('treeitem', { name: 'Left cuff', exact: true }).focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('properties-title')).not.toHaveText('Left cuff');

  // AC7: lock is an editing aid — it disables the fields, the drawing stays the same.
  await selectInTree(page, 'Right sleeve');
  const right = tree.getByRole('treeitem', { name: 'Right sleeve', exact: true });
  const rightId = await right.getAttribute('data-component-id');
  const rightPath = page.locator(
    `[data-view="front"] path[data-element-id="${rightId}:front:panel"]`,
  );
  const rd = await rightPath.getAttribute('d');
  await right.hover();
  await page.getByRole('button', { name: 'Lock Right sleeve' }).click();
  await expect(page.getByTestId('locked-note')).toBeVisible();
  await expect(
    panel(page).getByRole('textbox', { name: 'Sleeve length', exact: true }),
  ).toBeDisabled();
  await saved(page);
  expect(await rightPath.getAttribute('d')).toBe(rd);
  await right.hover();
  await page.getByRole('button', { name: 'Unlock Right sleeve' }).click();
  await saved(page);

  // Bulk edit both sleeves, after confirming the scope.
  await selectInTree(page, 'Left sleeve');
  await tree
    .getByRole('treeitem', { name: 'Right sleeve', exact: true })
    .click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('properties-title')).toHaveText('2 components');
  await expect(page.getByTestId('bulk-edit')).toContainText('Left sleeve, Right sleeve');
  await expect(
    panel(page).getByRole('textbox', { name: 'Sleeve length', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Edit all 2' }).click();
  const both = panel(page).getByRole('textbox', { name: 'Sleeve length', exact: true });
  await both.fill('60');
  await both.press('Enter');
  await saved(page);
  await selectInTree(page, 'Right sleeve');
  await expect(
    panel(page).getByRole('textbox', { name: 'Sleeve length', exact: true }),
  ).toHaveValue('60');

  // Nothing but design operations was written (no AI call).
  expect(requests.every((p) => p.endsWith('/operations') || p.includes('/client-logs'))).toBe(true);
});
