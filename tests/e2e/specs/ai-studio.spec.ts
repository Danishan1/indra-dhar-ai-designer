import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

/**
 * The AI studio flow (ADR-058) with the offline fake provider (no real AI calls in tests):
 * sketch → AI reading → pattern review → pattern editor (pieces with dimensions, sizes, style,
 * resize) → commit → tech pack generated from the patterns. The worker started by the Playwright
 * config runs the analysis and tech pack jobs.
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

test('AI studio: sketch → patterns → pattern editor → tech pack (ADR-058)', async ({ page }) => {
  test.setTimeout(240_000);
  const email = await createVerifiedAccount(undefined, 'Ava Studio');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('AI demo');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).waitFor();

  // 1. Start from a sketch; the other starts are announced but not available yet.
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await expect(page.getByTestId('start-sketch')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('start-photo')).toBeDisabled();
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name: 'party-dress.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
  await page.getByLabel('For').click();
  await page.getByRole('option', { name: 'Girls' }).click();
  await page.getByLabel('Size').click();
  await page.getByRole('option', { name: '8y' }).click();
  await page.getByTestId('analyze-button').click();

  // 2. Review: what the AI read, options it set, live pattern preview with dimensions and checks.
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('sketch-reading')).toContainText('Bow at the back waist');
  const preview = page.getByTestId('pattern-preview');
  await expect(preview.locator('[data-piece-name="Peter Pan collar"]')).toBeVisible();
  await expect(
    preview.locator('[data-piece-name="Bodice front"] [data-testid="piece-width"]'),
  ).toContainText('cm');
  await page.getByLabel('Skirt shape').click();
  await page.getByRole('option', { name: 'Full circle' }).click();
  await expect(preview.locator('[data-piece-name="Skirt front"]')).toBeVisible();
  await page.getByLabel('Design name').fill('Party dress');
  await page.getByTestId('create-patterns-button').click();

  // 3. Pattern editor: pieces only, sketch on the side.
  const workspace = page.getByTestId('pattern-workspace');
  await expect(workspace).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Party dress' })).toBeVisible();
  await expect(page.getByTestId('reference-panel').locator('img')).toBeVisible();
  expect(await page.getByTestId('piece-list-item').count()).toBeGreaterThan(6);
  const canvas = page.getByTestId('pattern-canvas');
  const backWidth = canvas.locator('[data-piece-name="Bodice back"] [data-testid="piece-width"]');
  const w0 = (await backWidth.textContent()) ?? '';

  // Change a body measurement: the pattern is redrafted.
  await page.getByRole('tab', { name: 'Sizes' }).click();
  const bust = page.getByTestId('body-bust');
  await bust.fill(String(Number(await bust.inputValue()) + 8));
  await bust.press('Enter');
  await expect(backWidth).not.toHaveText(w0);

  // Change a style option: parts are added / removed.
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.getByLabel('Collar', { exact: true }).click();
  await page.getByRole('option', { name: 'None' }).click();
  await expect(
    page.getByTestId('piece-list-item').filter({ hasText: 'Peter Pan collar' }),
  ).toHaveCount(0);
  await expect(
    page.getByTestId('piece-list-item').filter({ hasText: 'Front neck facing' }),
  ).toHaveCount(1);

  // Resize one piece by hand: it is marked edited and kept on redrafts.
  await page.getByTestId('piece-list-item').filter({ hasText: 'Sleeve band' }).click();
  await page.getByRole('tab', { name: 'Piece' }).click();
  const width = page.getByTestId('piece-input-width');
  await width.fill('30');
  await width.press('Enter');
  await expect(
    page.getByTestId('piece-list-item').filter({ hasText: 'Sleeve band' }),
  ).toContainText('edited');
  await expect(page.getByTestId('edited-banner')).toBeVisible();
  await expect(
    canvas.locator('[data-piece-name="Sleeve band"] [data-testid="piece-width"]'),
  ).toHaveText('30.0 cm');
  await expect(canvas.getByTestId('piece-handles')).toBeVisible();
  await page.getByRole('tab', { name: 'Fit' }).click();
  await expect(page.getByTestId('seam-checks')).toBeVisible();

  // Commit so the tech pack documents the edited pattern.
  await page.getByTestId('commit-button').first().click();
  const commitDialog = page.getByRole('dialog', { name: 'Commit a new revision' });
  await commitDialog.getByRole('button', { name: 'Commit revision' }).click();
  await expect(commitDialog).toBeHidden();
  await expect(page.getByTestId('latest-revision-badge')).toHaveText('Latest R002');

  // 4. Tech pack generated from the patterns.
  await page.getByTestId('techpack-button').click();
  await page.getByTestId('generate-techpack').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Tech pack/ })).toBeVisible();
  await expect(page.getByTestId('techpack-document')).toBeVisible({ timeout: 120_000 });
  const frame = page.frameLocator('[data-testid="techpack-document"]');
  await expect(frame.getByRole('heading', { name: 'Pattern specification' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Seam fit checks' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Flat patterns' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: /Pattern piece — Bodice front/ })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Original reference' })).toBeVisible();
  await expect(frame.getByText('Sleeve band', { exact: false }).first()).toBeVisible();
  if (process.env.PDF_CHROMIUM_PATH || process.env.E2E_EXPECT_PDF) {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-pdf').click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^TPK-\d+-R002\.pdf$/);
  }
});
