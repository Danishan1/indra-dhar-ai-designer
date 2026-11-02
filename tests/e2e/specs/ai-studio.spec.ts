import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { selectInTree } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

/**
 * The AI studio demo flow (ADR-056) with the offline fake provider (no real AI calls in tests):
 * images → analysis → review → structured design → editor (garment + pattern views) → tech pack.
 * The worker started by the Playwright config runs the analysis and tech pack jobs.
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

async function analyze(page: Page, projectUrl: string) {
  await page.goto(projectUrl);
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New design with AI' })).toBeVisible();
  const input = page.getByTestId('upload-dropzone').locator('input[type=file]');
  await input.setInputFiles([
    { name: 'shirt-sketch.png', mimeType: 'image/png', buffer: PNG },
    { name: 'blue-fabric.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(2, { timeout: 45_000 });
  await expect(page.getByLabel('What is blue-fabric.png?')).toContainText('Fabric swatch');
  await page.getByTestId('analyze-button').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
}

test('AI studio: images → analysis → design → patterns → tech pack (ADR-056)', async ({ page }) => {
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
  const projectUrl = page.url();

  // 1. Analyzer: components with images, estimates, library matches, fabrics.
  await analyze(page, projectUrl);
  const components = page.getByTestId('analysis-component');
  expect(await components.count()).toBeGreaterThan(8);
  // The built-in library already has a barrel cuff → reused, AI detail skipped.
  const cuff = components.filter({ hasText: 'Left cuff' });
  await expect(cuff.getByTestId('match-badge')).toHaveText(
    'Exact library match · Barrel cuff, one button',
  );
  const stand = components.filter({ hasText: 'Collar stand' });
  await expect(stand.getByTestId('match-badge')).toHaveText('New component');
  await expect(cuff).toContainText('cuff width: 65 mm (est.)');
  await expect(page.getByTestId('analysis-fabric')).toHaveCount(1);
  await page.getByLabel('Use for Chest pocket').click();
  await page.getByRole('option', { name: 'Leave it out' }).click();
  await page.getByLabel('Design name').fill('AI oxford shirt');
  await page.getByTestId('create-design-button').click();

  // 2. Editor: the editable reconstruction (vector artifacts), original, flat and patterns in sync.
  const recon = page.getByTestId('reconstruction-view');
  await expect(recon).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'AI oxford shirt' })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: 'Chest pocket', exact: true })).toHaveCount(0);
  await expect(recon.locator('path[data-component-id]').first()).toBeVisible();
  // Compare with the original upload.
  await page.getByTestId('compare-side').click();
  await expect(page.getByTestId('original-side')).toBeVisible();
  await page.getByTestId('compare-off').click();

  // Select the left cuff: shape + pattern; resizing the shape updates the measurement and pattern.
  await selectInTree(page, 'Left cuff');
  await expect(recon.getByTestId('shape-handles')).toBeVisible();
  const shape = page.getByTestId('shape-section');
  await expect(shape.getByTestId('shape-source').first()).toContainText(/Traced|template|guess/);
  await page.getByTestId('view-patterns').click();
  await page.getByTestId('patterns-selected').click();
  const card = page.getByTestId('pattern-piece-card').first();
  await expect(card).toBeVisible();
  const before = await card.locator('span').nth(1).innerText();
  const height = shape.getByTestId('shape-height').first();
  const h0 = Number(await height.inputValue());
  await height.fill(String(Math.round(h0 * 1.5)));
  await height.press('Enter');
  await expect(card.locator('span').nth(1)).not.toHaveText(before);
  await expect(page.getByTestId('component-properties')).toContainText(/Cuff width/);
  // Edit the pattern itself: seam allowance.
  const sa = card.getByRole('spinbutton', { name: 'Seam allowance (mm)' });
  await sa.fill('15');
  await sa.press('Enter');
  await expect(card).toContainText('Needs review');
  await page.getByTestId('view-flat').click();
  await page.getByTestId('garment-canvas').waitFor();

  // Commit so the tech pack documents the edited design.
  await page.getByTestId('commit-button').first().click();
  const commitDialog = page.getByRole('dialog', { name: 'Commit a new revision' });
  await commitDialog.getByRole('button', { name: 'Commit revision' }).click();
  await expect(commitDialog).toBeHidden();
  await expect(page.getByTestId('latest-revision-badge')).toHaveText('Latest R002');

  // 3. Tech pack for the latest committed revision (R002, with the edits).
  await page.getByTestId('techpack-button').click();
  await expect(page.getByTestId('presentation-presets')).toBeVisible();
  await page.getByTestId('generate-techpack').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Tech pack/ })).toBeVisible();
  const doc = page.getByTestId('techpack-document');
  await expect(doc).toBeVisible({ timeout: 120_000 });
  const frame = page.frameLocator('[data-testid="techpack-document"]');
  await expect(frame.getByRole('heading', { name: 'Bill of materials' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Flat patterns' })).toBeVisible();
  await expect(frame.getByRole('heading', { name: 'Original reference' })).toBeVisible();
  await expect(frame.getByText('Garment — front (final geometry)')).toBeVisible();
  await expect(frame.getByRole('heading', { name: /Pattern piece — Left cuff/ })).toBeVisible();
  await expect(page.getByTestId('print-browser')).toBeVisible();
  await expect(
    frame.getByRole('heading', { name: 'Missing or unconfirmed information' }),
  ).toBeVisible();
  await expect(frame.getByRole('heading', { level: 1, name: 'AI oxford shirt' })).toBeVisible();
  if (process.env.PDF_CHROMIUM_PATH || process.env.E2E_EXPECT_PDF) {
    await expect(page.getByTestId('download-pdf')).toBeVisible();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-pdf').click(),
    ]);
    expect(file.suggestedFilename()).toMatch(/^TPK-\d+-R002\.pdf$/);
  }

  // 4. Library reuse: analysing the same garment again reuses the saved components (AI skipped).
  await analyze(page, projectUrl);
  await expect(
    page
      .getByTestId('analysis-component')
      .filter({ hasText: 'Collar stand' })
      .getByTestId('match-badge'),
  ).toContainText('Exact library match');
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible();
  await expect(page.getByText(/reused from the library/)).toContainText(/[1-9]\d* reused/);
});
