import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

// 96×64 red PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAwElEQVR4nO3ZwQnDQADEQPejCtL9lZZ/IP6EsH4MXAVCK5/t67xyzncIFzrnVhGAAqhfVsKgAIpB/e9RY2IBFIMysVYXWg0KoBiUiaVBPfO7gkgHUAzKxNKg5j0W6QCKQZlY8+64KAZQDMrEmgfIy2oAxaBMLA1qHmORDqAYlIk1j46LYgDFoEyshxx/VgMoBmViaVDzHot0AMWgTKx5d1wUAygGZWLNA+RlNYBiUCaWBjWPsUgHUAzKxJpH5+O8ATZMYZYfMZ8kAAAAAElFTkSuQmCC',
  'base64',
);

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('upload a PNG on the Files page and see its thumbnail once checked (I09)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = await createVerifiedAccount(undefined, 'Fay Files');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);

  await page.getByRole('link', { name: 'Files' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Files' })).toBeVisible();
  await expect(page.getByText('No files yet')).toBeVisible();

  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles({ name: 'front-sketch.png', mimeType: 'image/png', buffer: PNG });
  // The worker checks the file and makes the thumbnail.
  await expect(page.getByTestId('upload-status')).toContainText('Ready', { timeout: 45_000 });

  const card = page.getByTestId('asset-card').filter({ hasText: 'front-sketch.png' });
  await expect(card).toContainText('96×64');
  const img = card.getByRole('img', { name: 'front-sketch.png' });
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  // A disguised file is refused.
  await page
    .getByTestId('upload-dropzone')
    .locator('input[type=file]')
    .setInputFiles({
      name: 'not-really.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ this is not an image'),
    });
  await expect(page.getByTestId('upload-item').first()).toContainText('Failed');
});
