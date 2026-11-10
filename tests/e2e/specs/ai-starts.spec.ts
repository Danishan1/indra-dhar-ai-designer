import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

/**
 * The other two ways to start (ADR-066), with the offline fake provider: a garment photo is redrawn
 * as a line sketch and read; a fabric gets garment suggestions, the chosen one is designed and
 * sketched, then read. Both end in the usual sketch review → pattern editor.
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

async function newDesignWithAi(page: Page, who: string, project: string) {
  const email = await createVerifiedAccount(undefined, who);
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill(project);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('link', { name: 'New design with AI' }).first().click();
}

async function upload(page: Page, name: string) {
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles([{ name, mimeType: 'image/png', buffer: PNG }]);
  await expect(page.getByTestId('analysis-input')).toHaveCount(1, { timeout: 45_000 });
}

test('from a garment photo: AI makes the line sketch, then the sketch flow (ADR-066)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newDesignWithAi(page, 'Pia Photo', 'Photos');
  await page.getByTestId('start-photo').click();
  await expect(page.getByTestId('start-photo')).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('heading', { name: '1. Your garment photo or design' }),
  ).toBeVisible();
  await upload(page, 'model-in-dress.png');
  await page.getByLabel('Garment', { exact: true }).click();
  await page.getByRole('option', { name: 'Dress' }).click();
  await expect(page.getByTestId('analyze-button')).toHaveText(/Make the line sketch and read it/);
  await page.getByTestId('analyze-button').click();

  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 60_000,
  });
  // The sketch the AI made comes first (it is what was read), then the photo.
  await expect(page.getByTestId('generated-sketch')).toContainText('Line sketch made by AI');
  await expect(page.getByTestId('upload')).toContainText('Your photo');
  await page.getByLabel('Design name').fill('From a photo');
  await page.getByTestId('create-patterns-button').click();
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });
});

test('from a fabric: suggestions, pick one, design + line sketch, then the sketch flow (ADR-066)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await newDesignWithAi(page, 'Fia Fabric', 'Fabrics');
  await page.getByTestId('start-fabric').click();
  await expect(page.getByRole('heading', { name: '2. Who is it for?' })).toBeVisible();
  // The sketch-only context is hidden; the wearer is chosen with buttons.
  await expect(page.getByLabel('Garment', { exact: true })).toBeHidden();
  await expect(page.getByTestId('fabric-for-auto')).toHaveAttribute('aria-checked', 'true');
  await upload(page, 'daisy-lawn.png');
  await expect(page.getByTestId('analyze-button')).toHaveText(/Suggest garments/);
  await page.getByTestId('analyze-button').click();

  // Step 1: the fabric reading, who it suits (AI decided) and the suggestions.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Garments for your fabric' }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('fabric-reading')).toContainText('navy');
  await expect(page.getByTestId('fabric-best-for')).toContainText('Best for girls');
  const suggestions = page.getByTestId('fabric-suggestion');
  await expect(suggestions).toHaveCount(4);
  await expect(page.getByTestId('fabric-design-button')).toHaveCount(0);
  await suggestions.filter({ hasText: 'Shirt and shorts set' }).click();
  await page.getByTestId('fabric-design-button').click();

  // Step 2: design in the fabric + its line sketch, read as a sketch → the usual review.
  await expect(page.getByRole('heading', { level: 1, name: /^Review/ })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByTestId('generated-sketch')).toBeVisible();
  await expect(page.getByTestId('generated-design')).toContainText('Design in your fabric');
  await expect(page.getByTestId('upload')).toContainText('Your fabric');
  await expect(page.getByTestId('sketch-garments')).toContainText('shorts');
  await page.getByLabel('Design name').fill('Daisy set');
  await page.getByTestId('create-patterns-button').click();
  await expect(page.getByTestId('pattern-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('piece-list')).toContainText('Shorts');
});
