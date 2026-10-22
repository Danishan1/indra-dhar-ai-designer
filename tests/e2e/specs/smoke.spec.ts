import { expect, test } from '@playwright/test';

test.describe('M1 walking skeleton', () => {
  test('app shell renders navigation, top bar and home content', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation');
    await expect(page.getByRole('complementary', { name: 'Main navigation' })).toBeVisible();
    for (const label of [
      'Home',
      'Projects',
      'Library',
      'Billing',
      'Settings',
      'Admin',
      'System status',
    ]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('keyboard focus is visible on sidebar items', async ({ page }) => {
    await page.goto('/');
    const link = page.getByRole('navigation').getByRole('link', { name: 'Projects' });
    await link.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  test('system status page shows every dependency as operational (web → API)', async ({ page }) => {
    await page.goto('/system');
    await expect(page.getByTestId('overall-status')).toHaveText('All systems operational');
    for (const name of ['Database', 'Queue & cache (Redis)', 'Object storage']) {
      const row = page.getByTestId(`status-${name}`);
      await expect(row).toHaveAttribute('data-status', 'ok');
      // Status is conveyed by text, not only by color (FR-EDT-129).
      await expect(row).toContainText('Operational');
    }
  });

  test('command palette opens with the keyboard and navigates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('heading', { name: 'Home' }).waitFor();
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByPlaceholder('Search pages…');
    await expect(input).toBeVisible();
    await input.fill('system');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/system$/);
  });

  test('placeholder pages explain when the feature arrives', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText('This area is built in iteration I10')).toBeVisible();
  });
});

test('API errors surface as a friendly toast with a support reference', async ({ page }) => {
  await page.goto('/system');
  await page.getByTestId('overall-status').waitFor();
  await page.getByRole('button', { name: 'Trigger test error' }).click();
  const toast = page.locator('[data-sonner-toast]').first();
  await expect(toast).toContainText('Some of the information is not valid');
  await expect(toast).toContainText(/Reference: [0-9a-f-]{36}/);
  await expect(toast.getByRole('button', { name: 'Copy reference' })).toBeVisible();
});
