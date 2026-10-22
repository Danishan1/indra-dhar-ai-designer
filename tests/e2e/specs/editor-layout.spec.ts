import { expect, test } from '@playwright/test';

const REGIONS = ['header', 'toolbar', 'hierarchy', 'viewport', 'properties', 'operations'] as const;

test.describe('editor layout skeleton', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor/demo');
    await page.locator('[data-region="viewport"]').waitFor();
  });

  test('renders the six workspace regions', async ({ page }) => {
    for (const region of REGIONS) {
      await expect(page.locator(`[data-region="${region}"]`)).toBeVisible();
    }
  });

  test('panels collapse and expand without any data request', async ({ page }) => {
    const mutations: string[] = [];
    page.on('request', (req) => {
      if (req.method() !== 'GET' && !req.url().includes('/api/client-logs'))
        mutations.push(`${req.method()} ${req.url()}`);
    });

    const hierarchy = page.locator('[data-region="hierarchy"]');
    const toggle = page.getByRole('button', { name: 'Hierarchy panel' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(hierarchy).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(hierarchy).toBeVisible();

    // Keyboard shortcut toggles the properties panel (Alt+2).
    await page.locator('[data-region="viewport"]').click();
    await page.keyboard.press('Alt+2');
    await expect(page.locator('[data-region="properties"]')).toBeHidden();
    await page.keyboard.press('Alt+2');
    await expect(page.locator('[data-region="properties"]')).toBeVisible();

    expect(mutations).toEqual([]);
  });

  test('panel sizes survive a reload', async ({ page }) => {
    const handle = page.getByRole('separator', { name: 'Resize hierarchy panel' });
    const before = (await page.locator('[data-region="hierarchy"]').boundingBox())?.width ?? 0;
    await handle.focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    const after = (await page.locator('[data-region="hierarchy"]').boundingBox())?.width ?? 0;
    expect(after).toBeGreaterThan(before);
    await page.waitForTimeout(300);
    await page.reload();
    await page.locator('[data-region="viewport"]').waitFor();
    const reloaded = (await page.locator('[data-region="hierarchy"]').boundingBox())?.width ?? 0;
    expect(Math.abs(reloaded - after)).toBeLessThan(4);
  });

  test('value status legend never relies on color alone', async ({ page }) => {
    const badges = page.locator('[data-region="properties"] [data-status]');
    await expect(badges).toHaveCount(6);
    for (const badge of await badges.all()) {
      await expect(badge.locator('svg')).toHaveCount(1);
      expect((await badge.innerText()).trim().length).toBeGreaterThan(0);
    }
  });
});
