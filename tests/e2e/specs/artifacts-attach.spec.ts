import { randomUUID } from 'node:crypto';

import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { selectInTree } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

const LACE = {
  compatibleTargetTypes: ['sleeve', 'hem', 'cuff'],
  allowedPlacementRegions: ['hem', 'opening', 'edge'],
  preferredPlacementRegions: ['hem'],
  repeatable: true,
  placementModes: ['follow_boundary'],
  shapeParams: { kind: 'border', params: { pattern: 'scallop', widthMm: 20 } },
};

async function openEditor(page: Page) {
  const email = await createVerifiedAccount(undefined, 'Lace Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  const orgName = await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Lace');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill('Lace shirt');
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByTestId('garment-canvas').waitFor();
  return orgName;
}

/** Calls the API with the page's session (same-origin proxy; mutations need Origin). */
async function api(page: Page, method: 'GET' | 'POST', path: string, data?: unknown) {
  const origin = new URL(page.url()).origin;
  const res = await page.request.fetch(path, {
    method,
    ...(data !== undefined ? { data } : {}),
    headers: { origin, 'idempotency-key': randomUUID() },
  });
  expect(res.ok(), `${method} ${path} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<Record<string, unknown>>;
}

const saved = (page: Page) =>
  expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
const leftTab = (page: Page, name: 'Parts' | 'Library') =>
  page.getByRole('tablist', { name: 'Left panel' }).getByRole('tab', { name }).click();
const componentId = (page: Page, name: string) =>
  page
    .getByRole('tree', { name: 'Components' })
    .getByRole('treeitem', { name, exact: true })
    .getAttribute('data-component-id');

test('attach lace to the left sleeve hem, place it, and update a pinned revision explicitly (I18)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const orgName = await openEditor(page);
  const leftSleeve = (await componentId(page, 'Left sleeve'))!;
  const rightSleeve = (await componentId(page, 'Right sleeve'))!;

  // Library tab: what fits the selected sleeve, then attach the built-in lace (pins R001).
  await selectInTree(page, 'Left sleeve');
  await leftTab(page, 'Library');
  const library = page.getByTestId('editor-library');
  await library.getByRole('searchbox', { name: 'Search the library' }).fill('Scalloped lace');
  const card = library.getByTestId('library-card').filter({ hasText: 'Scalloped lace border' });
  await expect(card.locator('[data-fit]')).toHaveAttribute('data-fit', /compatible|review/);
  await card.getByRole('button', { name: 'Attach Scalloped lace border to Left sleeve' }).click();
  await saved(page);

  // The flat shows the lace on that sleeve; the properties panel shows the exact revision.
  await expect(
    page.locator(`[data-layer="trims"][data-component-id="${leftSleeve}"]`).first(),
  ).toBeAttached();
  const binding = page.getByTestId('artifact-binding').first();
  await expect(binding).toContainText('Scalloped lace border');
  await expect(binding.getByTestId('binding-revision')).toHaveText(/-R001$/);

  // Placement: region select + scale/offset, saved through update_placement.
  const placement = binding.getByTestId('placement-controls');
  await expect(placement).toContainText('component local');
  const scale = placement.getByRole('textbox', { name: 'Scale' });
  await scale.fill('1.5');
  await scale.press('Enter');
  await saved(page);
  await expect(scale).toHaveValue('1.5');
  const offset = placement.getByRole('textbox', { name: 'Offset' });
  await offset.fill('5000');
  await offset.press('Enter');
  await expect(placement.getByText('Between -1000 and 1000')).toBeVisible();
  await offset.fill('');

  // An organization lace with one revision, dropped onto the right sleeve in the drawing.
  const orgs = (await api(page, 'GET', '/v1/orgs')) as { items: { id: string; name: string }[] };
  const orgId = orgs.items.find((o) => o.name === orgName)!.id;
  const house = await api(page, 'POST', `/v1/orgs/${orgId}/artifacts`, {
    category: 'lace',
    name: 'House lace',
    scope: 'organization',
    definition: LACE,
  });
  await library.getByRole('searchbox', { name: 'Search the library' }).fill('House lace');
  const houseCard = library.getByTestId('library-card').filter({ hasText: 'House lace' });
  await expect(houseCard).toBeVisible();
  await houseCard.dragTo(
    page.locator(`[data-role="panel"][data-component-id="${rightSleeve}"]`).first(),
  );
  await saved(page);
  await expect(
    page.locator(`[data-layer="trims"][data-component-id="${rightSleeve}"]`).first(),
  ).toBeAttached();

  // A newer revision never changes the design by itself…
  await api(page, 'POST', `/v1/orgs/${orgId}/artifacts/${String(house.id)}/revisions`, {
    expectedCurrentRevisionId: house.currentRevisionId,
    definition: { ...LACE, shapeParams: { kind: 'border', params: { widthMm: 30 } } },
    changeNote: 'Wider',
  });
  await page.reload();
  await page.getByTestId('garment-canvas').waitFor();
  await selectInTree(page, 'Right sleeve');
  const houseBinding = page.getByTestId('artifact-binding').filter({ hasText: 'House lace' });
  await expect(houseBinding.getByTestId('binding-revision')).toHaveText(/-R001$/);
  // …it is offered as an explicit update.
  await houseBinding.getByRole('button', { name: 'Update to R002' }).click();
  await saved(page);
  await expect(houseBinding.getByTestId('binding-revision')).toHaveText(/-R002$/);
  await expect(houseBinding.getByRole('button', { name: 'Update to R002' })).toHaveCount(0);

  // Undo puts the old pin back.
  await page.keyboard.press('Control+z');
  await saved(page);
  await expect(houseBinding.getByTestId('binding-revision')).toHaveText(/-R001$/);
});
