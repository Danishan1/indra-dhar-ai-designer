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
  // Guesses are marked for checking (ADR-060).
  await expect(page.getByTestId('unsure-closure')).toBeVisible();
  const preview = page.getByTestId('pattern-preview');
  await expect(preview.locator('[data-piece-name="Peter Pan collar"]')).toBeVisible();
  await expect(
    preview.locator('[data-piece-name="Bodice front"] [data-testid="piece-width"]'),
  ).toContainText('cm');
  // Same drawing as the editor: cutting lines, fold marks, seams dimensioned.
  await expect(
    preview.locator('[data-piece-name="Bodice front"] [data-testid="cut-line"]'),
  ).toHaveCount(1);
  await expect(
    preview.locator('[data-piece-name="Bodice front"] [data-testid="fold-mark"]'),
  ).toHaveCount(1);
  await expect(
    preview.locator('[data-piece-name="Bodice front"] [data-testid="edge-label-shoulder"]'),
  ).toContainText('shoulder');
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
  await expect(page.getByTestId('workflow-steps')).toContainText('Patterns');
  expect(await page.getByTestId('piece-list-item').count()).toBeGreaterThan(6);
  // CAD view: real-scale rulers, true-size zoom.
  const canvas = page.getByTestId('pattern-canvas');
  await expect(page.getByTestId('ruler-top')).toBeVisible();
  await expect(page.getByTestId('ruler-left')).toBeVisible();
  await page.getByTestId('zoom-actual').click();
  await expect(page.getByTestId('pattern-cad')).toHaveAttribute('data-zoom', '100');
  await page.getByTestId('zoom-fit').click();
  const item = (name: string) => page.getByTestId('piece-list-item').filter({ hasText: name });
  const dim = (name: string, which: 'width' | 'height') =>
    canvas.locator(`[data-piece-name="${name}"] [data-testid="piece-${which}"]`);
  await item('Bodice back').click();
  const backWidth = dim('Bodice back', 'width');
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
  await expect(item('Peter Pan collar')).toHaveCount(0);
  await expect(item('Front neck facing')).toHaveCount(1);

  // Lengthen the skirt front by 5 cm across a line (slash and spread).
  await item('Skirt front').click();
  await page.getByRole('tab', { name: 'Piece' }).click();
  const h0 = parseFloat((await dim('Skirt front', 'height').textContent()) ?? '0');
  await page.getByTestId('spread-input').fill('5');
  await page.getByTestId('spread-numeric-apply').click();
  await expect(dim('Skirt front', 'height')).toHaveText(`${(h0 + 5).toFixed(1)} cm`);
  await expect(item('Skirt front')).toContainText('edited');
  await expect(page.getByTestId('edited-banner')).toBeVisible();

  // Set a seam to an exact length.
  const side = page.getByTestId('edge-side');
  const s0 = parseFloat(await side.inputValue());
  await side.fill((s0 + 1).toFixed(1));
  await side.press('Enter');
  await expect(side).toHaveValue((s0 + 1).toFixed(1));

  // Per-seam allowance: a deeper hem; the fold edge has none.
  const hemSa = page.getByTestId('edge-sa-hem');
  await expect(hemSa).toHaveValue('30');
  await hemSa.fill('40');
  await hemSa.press('Tab');
  await expect(
    canvas.locator('[data-piece-name="Skirt front"] [data-testid="edge-label-hem"]'),
  ).toContainText('SA 4');
  await expect(page.getByTestId('piece-edges')).toContainText('fold');

  // Direct point editing: select a point, type its exact X.
  await page.getByTestId('tool-point').click();
  await canvas.getByTestId('path-node').first().click();
  const nx = page.getByTestId('node-x');
  await expect(nx).toBeVisible();
  await nx.fill('-2');
  await nx.press('Enter');
  await expect(nx).toHaveValue('-2.0');

  // Resize and rotate a piece.
  await page.getByTestId('tool-select').click();
  await item('Sleeve band').click();
  const width = page.getByTestId('piece-input-width');
  await width.fill('30');
  await width.press('Enter');
  await expect(dim('Sleeve band', 'width')).toHaveText('30.0 cm');
  await page.getByTestId('rotate-right').click();
  await expect(dim('Sleeve band', 'height')).toHaveText('30.0 cm');
  await expect(canvas.getByTestId('node-layer')).toBeVisible();

  // True-size outputs.
  const [dxf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-dxf').click(),
  ]);
  expect(dxf.suggestedFilename()).toMatch(/\.dxf$/);
  await page.getByRole('tab', { name: 'Fit' }).click();
  await expect(page.getByTestId('seam-checks')).toBeVisible();

  // 4. Tech pack: the edits are committed as R002 in the same step.
  await page.getByTestId('techpack-button').click();
  await expect(page.getByTestId('techpack-uncommitted')).toBeVisible();
  await expect(page.getByTestId('techpack-commit-first')).toBeChecked();
  await expect(page.getByTestId('generate-techpack')).toHaveText('Commit R002 and generate');
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
  await expect(frame.getByRole('heading', { name: 'Cutting layout — main' })).toBeVisible();
  await expect(frame.getByText('hem 40 mm').first()).toBeVisible();
  if (process.env.PDF_CHROMIUM_PATH || process.env.E2E_EXPECT_PDF) {
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-pdf').click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^TPK-\d+-R002\.pdf$/);
  }
});
