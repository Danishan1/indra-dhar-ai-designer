import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

/**
 * Size standards (ADR-067): an organization size chart in Settings, the standard picker in the
 * editor's Sizes tab, and a tech pack with a graded size range — with the offline fake provider.
 */

// 96×64 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAwElEQVR4nO3ZwQnDQADEQPejCtL9lZZ/IP6EsH4MXAVCK5/t67xyzncIFzrnVhGAAqhfVsKgAIpB/e9RY2IBFIMysVYXWg0KoBiUiaVBPfO7gkgHUAzKxNKg5j0W6QCKQZlY8+64KAZQDMrEmgfIy2oAxaBMLA1qHmORDqAYlIk1j46LYgDFoEyshxx/VgMoBmViaVDzHot0AMWgTKx5d1wUAygGZWLNA+RlNYBiUCaWBjWPsUgHUAzKxJpH5+O8ATZMYZYfMZ8kAAAAAElFTkSuQmCC',
  'base64',
);

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('size standards: a custom chart, the standard in the editor, a graded tech pack (ADR-067)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const email = await createVerifiedAccount(undefined, 'Sid Sizes');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  // 1. Settings → Size charts: start from UK girls' sizes, keep three.
  await page.goto('/settings/sizes');
  await expect(page.getByRole('heading', { level: 1, name: 'Size charts' })).toBeVisible();
  await page.getByTestId('new-size-chart').click();
  const editor = page.getByTestId('size-chart-editor');
  await editor.getByLabel('Name').fill('House girls');
  await editor.getByLabel('For').click();
  await page.getByRole('option', { name: 'Girls' }).click();
  await editor.getByLabel('Start from').click();
  await page.getByRole('option', { name: 'UK girls sizes' }).click();
  const rows = editor.getByTestId('size-chart-table').locator('tbody tr');
  await expect(rows.first().getByLabel('Size 1 label')).toHaveValue('2-3y');
  while ((await rows.count()) > 3) await rows.last().getByRole('button').click();
  await editor.getByLabel('Size 1 label').fill('S');
  await editor.getByLabel('Size 2 label').fill('M');
  await editor.getByLabel('Size 3 label').fill('L');
  await editor.getByTestId('save-size-chart').click();
  await expect(page.getByTestId('size-chart-list')).toContainText('House girls');
  await expect(page.getByTestId('size-chart-list')).toContainText('S, M, L');

  // 2. A girls' dress from a sketch.
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Sizes');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name: 'dress.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
  await page.getByLabel('Garment', { exact: true }).click();
  await page.getByRole('option', { name: 'Dress' }).click();
  await page.getByTestId('analyze-button').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Design name').fill('Sized dress');
  await page.getByTestId('create-patterns-button').click();
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });

  // 3. Sizes tab: switch the standard to UK (same body, UK label), then to the house chart.
  await page.getByRole('tab', { name: 'Sizes' }).click();
  const basics = page.getByTestId('garment-basics');
  await expect(basics.getByLabel('Size', { exact: true })).toContainText('8y');
  await basics.getByLabel('Size standard').click();
  await page.getByRole('option', { name: 'UK', exact: true }).click();
  await expect(basics.getByLabel('Size', { exact: true })).toContainText('7-8y');
  await expect(page.getByTestId('measurements-form')).toContainText('size UK 7-8y');
  await basics.getByLabel('Size standard').click();
  await page.getByRole('option', { name: 'House girls' }).click();
  await expect(page.getByTestId('measurements-form')).toContainText('House girls ·');
  await basics.getByLabel('Size standard').click();
  await page.getByRole('option', { name: 'UK', exact: true }).click();
  // The house chart only has the three smallest sizes, so the nearest UK size is small; pick 7-8y.
  await expect(basics.getByLabel('Size', { exact: true })).toContainText('4-5y');
  await basics.getByLabel('Size', { exact: true }).click();
  await page.getByRole('option', { name: '7-8y' }).click();

  // 4. Tech pack: UK, base 7-8y, graded 5-6y … 9-10y.
  await page.getByTestId('techpack-button').click();
  const sizing = page.getByTestId('techpack-sizing');
  await expect(sizing.getByLabel('Size standard')).toContainText('UK');
  await expect(sizing.getByLabel('Base size (patterns)')).toContainText('7-8y');
  await sizing.getByTestId('tp-size-5-6y').click();
  await sizing.getByTestId('tp-size-6-7y').click();
  await sizing.getByTestId('tp-size-8-9y').click();
  await sizing.getByTestId('tp-size-9-10y').click();
  await expect(page.getByTestId('tp-size-summary')).toContainText(
    'Size chart for 5 sizes (5-6y–9-10y), graded from the base size 7-8y.',
  );
  await page.getByTestId('generate-techpack').click();
  await expect(page.getByTestId('techpack-document')).toBeVisible({ timeout: 120_000 });
  const frame = page.frameLocator('[data-testid="techpack-document"]');
  await expect(frame.getByRole('heading', { name: 'Size chart — UK' })).toBeVisible();
  const grade = frame.locator('table.grade').first();
  await expect(grade.locator('thead th')).toHaveText([
    'Point of measure (cm)',
    '5-6y',
    '6-7y',
    '7-8y',
    '8-9y',
    '9-10y',
  ]);
  await expect(grade.locator('th.base')).toHaveText('7-8y');
  await expect(frame.locator('.cover')).toContainText('UK 5-6y–9-10y');
});
