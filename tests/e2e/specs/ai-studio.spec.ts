import { expect, type Locator, test } from '@playwright/test';

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
  await expect(page.getByTestId('start-pattern')).toBeDisabled();
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
  await page.getByTestId('category-points').click();
  await page.getByTestId('tool-point').click();
  await canvas.getByTestId('path-node').first().click();
  const nx = page.getByTestId('node-x');
  await expect(nx).toBeVisible();
  await nx.fill('-2');
  await nx.press('Enter');
  await expect(nx).toHaveValue('-2.0');

  // Resize and rotate a piece.
  await page.getByTestId('category-select').click();
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas.getByTestId('node-layer')).toHaveCount(0);
  await item('Sleeve band').click();
  const width = page.getByTestId('piece-input-width');
  await width.fill('30');
  await width.press('Enter');
  await expect(dim('Sleeve band', 'width')).toHaveText('30.0 cm');
  await page.getByTestId('rotate-right').click();
  await expect(dim('Sleeve band', 'height')).toHaveText('30.0 cm');
  // The select tool never shows or edits points.
  await expect(canvas.getByTestId('node-layer')).toHaveCount(0);

  // True-size outputs.
  await page.getByTestId('category-view').click();
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

test('AI studio: a shirt + shorts sketch becomes a co-ord set with every bottom detail (ADR-061)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = await createVerifiedAccount(undefined, 'Sam Sets');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Sets');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name: 'boys-set.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
  await page.getByLabel('Garment', { exact: true }).click();
  await page.getByRole('option', { name: 'Set: top + bottom (co-ord)' }).click();
  await page.getByTestId('analyze-button').click();

  // Pass 1 (who, sections, garments) and pass 2 (checklist per garment) on the review page.
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('sketch-classification')).toContainText('child (about 8 years)');
  await expect(page.getByTestId('sketch-garments')).toContainText('shorts');
  const shorts = page.getByTestId('garment-shorts');
  await expect(shorts.getByLabel('Belt loops')).toContainText('6');
  await expect(shorts.getByLabel('Closure')).toContainText('Fly zip');
  await expect(shorts.getByLabel('Pockets', { exact: true })).toContainText('Slant');
  await expect(shorts.getByTestId('unsure-backPockets')).toBeVisible();
  const preview = page.getByTestId('pattern-preview');
  await expect(preview.locator('[data-piece-name="Belt loop strip"]')).toBeVisible();
  await expect(preview.locator('[data-piece-name="Skirt front"]')).toHaveCount(0);
  await page.getByLabel('Design name').fill('Boys set');
  await page.getByTestId('create-patterns-button').click();

  // Editor: pieces grouped by garment; the set's style per garment.
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('piece-list-garment')).toHaveText(['Shirt', 'Shorts']);
  for (const name of [
    'Button placket',
    'Waistband',
    'Fly facing',
    'Side front (pocket facing)',
    'Back patch pocket',
  ])
    await expect(page.getByTestId('piece-list-item').filter({ hasText: name })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Style' }).click();
  await page.getByTestId('garment-shorts').getByLabel('Belt loops').click();
  await page.getByRole('option', { name: 'None' }).click();
  await expect(
    page.getByTestId('piece-list-item').filter({ hasText: 'Belt loop strip' }),
  ).toHaveCount(0);
  // Look preview of a set: a line sketch draws each garment on its own (cost per garment).
  await page.getByTestId('look-button').click();
  const dialog = page.getByRole('dialog', { name: 'Preview the look' });
  await dialog.getByTestId('look-kind-sketch').click();
  await expect(dialog.getByTestId('look-kind-sketch')).toContainText('shirt, shorts');
  await expect(dialog.getByTestId('look-cost')).toHaveText('2 AI images');
  await dialog.getByTestId('look-pick-back').click();
  await expect(dialog.getByTestId('look-cost')).toHaveText('4 AI images');
  await dialog.getByTestId('look-kind-model').click();
  await expect(dialog.getByTestId('look-cost')).toHaveText('2 AI images');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('pattern editor tools: categories, scale, spread at lines, size by measurement, seams, notches, rotate, arrange, panels (ADR-062)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const email = await createVerifiedAccount(undefined, 'Tia Tools');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Tools');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name: 'shorts.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
  await page.getByLabel('Garment', { exact: true }).click();
  await page.getByRole('option', { name: 'Shirt', exact: false }).first().click();
  await page.getByTestId('analyze-button').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Design name').fill('Tool test');
  await page.getByTestId('create-patterns-button').click();
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });

  const canvas = page.getByTestId('pattern-canvas');
  const cad = page.getByTestId('pattern-cad');
  const item = (name: string) => page.getByTestId('piece-list-item').filter({ hasText: name });
  const dim = (name: string, which: 'width' | 'height') =>
    canvas.locator(`[data-piece-name="${name}"] [data-testid="piece-${which}"]`);
  const num = async (name: string, which: 'width' | 'height') =>
    parseFloat((await dim(name, which).textContent()) ?? '0');
  await page.getByTestId('zoom-fit').click();

  // Categories show their tools in the rail; keyboard shortcuts switch category too.
  await page.getByTestId('category-points').click();
  await expect(page.getByTestId('tool-rail')).toContainText('');
  await expect(page.getByTestId('tool-add-point')).toBeVisible();
  await expect(page.getByTestId('tool-scale')).toHaveCount(0);
  await cad.focus();
  await page.keyboard.press('s');
  await expect(page.getByTestId('tool-scale')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-options')).toContainText('Scale the whole piece');

  // Scale: a piece 30 → 40 cm wide by typing (proportional).
  await item('Back').first().click();
  await expect(canvas.getByTestId('scale-box')).toBeVisible();
  const w0 = await num('Back', 'width');
  const h0 = await num('Back', 'height');
  await page.getByTestId('scale-width').fill(String(w0 + 10));
  await page.getByTestId('scale-width').press('Enter');
  await expect(dim('Back', 'width')).toHaveText(`${(w0 + 10).toFixed(1)} cm`);
  expect(await num('Back', 'height')).toBeGreaterThan(h0 + 5);
  // Undo returns it.
  await cad.focus();
  await page.keyboard.press('Control+z');
  await expect(dim('Back', 'width')).toHaveText(`${w0.toFixed(1)} cm`);

  // Lengthen at two lines: the amount is shared between them.
  await page.getByTestId('tool-lengthen').click();
  const box = (await canvas.locator('[data-piece-name="Back"]').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.7);
  await expect(page.getByTestId('spread-bar')).toContainText('2 lines');
  await page.getByTestId('spread-amount').fill('4');
  await page.getByTestId('spread-amount').press('Enter');
  await expect(dim('Back', 'height')).toHaveText(`${(h0 + 4).toFixed(1)} cm`);
  // Switching tools cancels a spread in progress.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.5);
  await expect(page.getByTestId('spread-bar')).toBeVisible();
  await page.getByTestId('tool-scale').click();
  await expect(page.getByTestId('spread-bar')).toHaveCount(0);

  // Size by measurement: back width +4 cm by changing the chest measurement → front follows.
  await page.getByTestId('tool-fit').click();
  const fw0 = await num('Front', 'width');
  const bw0 = await num('Back', 'width');
  await page.getByTestId('fit-target').fill(String(bw0 + 4));
  await page.getByTestId('fit-apply').click();
  await expect(page.getByTestId('fit-result')).toContainText('now');
  await expect.poll(() => num('Back', 'width')).toBeGreaterThan(bw0 + 3.4);
  expect(await num('Front', 'width')).toBeGreaterThan(fw0 + 2);

  // Point on the Back's seam line: hover along the bottom until the outline marker shows.
  const clickOutline = async () => {
    const b2 = (await canvas.locator('[data-piece-name="Back"] path').first().boundingBox())!;
    for (const f of [0.998, 0.995, 0.99, 0.985, 0.98, 1, 0.975, 0.97]) {
      await page.mouse.move(b2.x + b2.width * 0.5, b2.y + b2.height * f);
      if (await canvas.getByTestId('outline-hover').count()) {
        await page.mouse.down();
        await page.mouse.up();
        return true;
      }
    }
    return false;
  };
  await page.getByTestId('category-select').click();
  await item('Back').first().click();

  // Seam tool: click a seam, set its allowance.
  await page.getByTestId('category-mark').click();
  await page.getByTestId('tool-seam').click();
  expect(await clickOutline()).toBe(true);
  await expect(page.getByTestId('seam-bar')).toBeVisible();
  await expect(canvas.getByTestId('seam-highlight')).toHaveCount(1);
  await page.getByTestId('seam-allowance').fill('25');
  await page.getByTestId('seam-allowance').press('Tab');
  await expect(page.getByTestId('seam-bar')).toBeVisible();

  // Notch tool: add a notch on the back.
  await page.getByTestId('tool-notch').click();
  await expect(page.getByTestId('seam-bar')).toHaveCount(0);
  const notches0 = await canvas.locator('[data-piece-name="Back"] [data-testid="notch"]').count();
  expect(await clickOutline()).toBe(true);
  await expect(canvas.locator('[data-piece-name="Back"] [data-testid="notch"]')).toHaveCount(
    notches0 + 1,
  );

  // Rotate by typing an angle.
  await page.getByTestId('category-transform').click();
  await page.getByTestId('tool-rotate').click();
  const bw = await num('Back', 'width');
  await page.getByTestId('rotate-input').fill('90');
  await page.getByTestId('rotate-input').press('Enter');
  await expect.poll(() => num('Back', 'height')).toBeCloseTo(bw, 0);
  await page.getByTestId('rail-rotate-left').click();
  await expect.poll(() => num('Back', 'width')).toBeCloseTo(bw, 0);

  // Arrange: pack on 150 cm fabric (one undo step).
  await page.getByTestId('category-arrange').click();
  await expect(canvas.getByTestId('fabric-band')).toBeVisible();
  await expect(page.getByTestId('pack-length')).toContainText('cm');
  await page.getByTestId('arrange-pack').click();

  // Right panel: history, changes, validation, sketch are back.
  await page.locator('#pattern-right-tab-changes').click();
  await expect(page.getByTestId('changes-panel')).toContainText(/Pack pieces|changes/);
  await page.locator('#pattern-right-tab-history').click();
  await expect(page.getByText('R001').first()).toBeVisible();
  await page.locator('#pattern-right-tab-checks').click();
  await page.locator('#pattern-right-tab-references').click();
  await expect(page.getByTestId('references-panel').locator('img')).toBeVisible();
  await page.locator('#pattern-right-tab-pattern').click();
  await expect(page.getByRole('tab', { name: 'Sizes' })).toBeVisible();
});

test('look preview: the garment drawn from the patterns, kept with its revision (ADR-064)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const email = await createVerifiedAccount(undefined, 'Lola Looks');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Looks');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name: 'shorts.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
  await page.getByLabel('Garment', { exact: true }).click();
  await page.getByRole('option', { name: 'Shirt', exact: false }).first().click();
  await page.getByTestId('analyze-button').click();
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Design name').fill('Look test');
  await page.getByTestId('create-patterns-button').click();
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('zoom-fit').click();
  const cards = page.getByTestId('look-card');
  const turnBack = async () => {
    await page.getByTestId('piece-list-item').filter({ hasText: 'Back' }).first().click();
    await page.getByTestId('category-transform').click();
    await page.getByTestId('rail-rotate-right').click();
  };
  const drawLook = async (note: string, pick: (dialog: Locator) => Promise<void>) => {
    await page.getByTestId('look-button').click();
    const dialog = page.getByRole('dialog', { name: 'Preview the look' });
    await expect(dialog.getByTestId('look-uncommitted')).toBeVisible();
    await pick(dialog);
    await dialog.getByTestId('look-note').fill(note);
    await dialog.getByTestId('look-generate').click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
  };

  // Before any look: the tab explains the button.
  await page.locator('#pattern-right-tab-looks').click();
  await expect(page.getByTestId('looks-empty')).toBeVisible();

  // Edit the patterns, preview a line sketch (front + back only; each image costs): the changes
  // are committed first and exactly those drawings are made.
  await turnBack();
  await drawLook('first try', async (dialog) => {
    // Nothing to draw until the kind of look is chosen; its views then appear.
    await expect(dialog.getByTestId('look-views')).toHaveCount(0);
    await expect(dialog.getByTestId('look-generate')).toBeDisabled();
    await dialog.getByTestId('look-kind-sketch').click();
    await expect(dialog.getByTestId('look-pick-left')).toHaveCount(0);
    await expect(dialog.getByTestId('look-pick-front')).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByTestId('look-cost')).toHaveText('1 AI image');
    await dialog.getByTestId('look-pick-front').click();
    await expect(dialog.getByTestId('look-generate')).toBeDisabled();
    await dialog.getByTestId('look-pick-back').click();
    await dialog.getByTestId('look-pick-front').click();
    await expect(dialog.getByTestId('look-cost')).toHaveText('2 AI images');
    await expect(dialog.getByTestId('look-generate')).toHaveText('Draw 2 images');
  });
  await expect(page.locator('#pattern-right-tab-looks')).toHaveAttribute('aria-selected', 'true');
  await expect(cards).toHaveCount(1);
  const first = cards.first();
  for (const view of ['front', 'back'])
    await expect(first.getByTestId(`look-view-${view}`)).toBeVisible({ timeout: 90_000 });
  await expect(first.locator('figcaption')).toHaveText(['Front', 'Back']);
  await expect(first.getByTestId('look-kind')).toHaveText('line sketch');
  await expect(first).toContainText('patterns R002');
  await expect(first).toContainText('first try');
  await expect(first.getByTestId('look-current')).toBeVisible();
  await first.getByTestId('look-view-back').click();
  await expect(page.getByTestId('look-viewer')).toContainText('Back view');
  await page.keyboard.press('Escape');

  // Another change and another look: newest first; the first look keeps its own patterns.
  await turnBack();
  // On a model: all four sides.
  await drawLook('second try', async (dialog) => {
    await dialog.getByTestId('look-kind-model').click();
    await dialog.getByTestId('look-pick-all').click();
    await expect(dialog.getByTestId('look-cost')).toHaveText('4 AI images');
  });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('second try');
  for (const view of ['front', 'back', 'left', 'right'])
    await expect(cards.first().getByTestId(`look-view-${view}`)).toBeVisible({ timeout: 90_000 });
  await expect(cards.first()).toContainText('patterns R003');
  await expect(cards.first().getByTestId('look-kind')).toHaveText('on a model');
  const older = cards.nth(1);
  await expect(older.getByTestId('look-current')).toHaveCount(0);

  // Go back to the patterns of the first look.
  await older.getByTestId('look-restore').click();
  await page.getByRole('button', { name: /^Restore/ }).click();
  await expect(older.getByTestId('look-restored')).toBeVisible({ timeout: 15_000 });
});
