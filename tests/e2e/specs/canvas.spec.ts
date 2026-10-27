import { expect, type Page, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { setLength } from '../support/editor.js';
import { createOrganizationInOnboarding, submitSignIn } from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

async function openNewDesignInEditor(page: Page, name: string) {
  const email = await createVerifiedAccount(undefined, 'Canvas Designer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).first().click();
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Canvas test');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('tab', { name: 'Designs' }).click();
  await page.getByRole('button', { name: 'New design' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New design' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create design' }).click();
  await page.getByRole('link', { name: 'Open editor' }).click();
  await page.getByTestId('garment-canvas').waitFor();
}

const sleevePanel = (page: Page) =>
  page.locator(
    '[data-testid="garment-canvas"] [data-view="front"] path[data-element-id$=":front:panel"]',
    {
      has: page.locator('title', { hasText: /^Left sleeve$/ }),
    },
  );

test('the 2D flat is component-aware: click selects, edits redraw, zoom changes nothing (I16)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openNewDesignInEditor(page, 'Poplin flat');
  const canvas = page.getByTestId('garment-canvas');
  await expect(page.getByTestId('capability-badge')).toHaveText('Structured 2D (G2)');
  await expect(page.getByTestId('placeholder-chip')).toContainText('drawn with defaults');
  await expect(canvas.locator('svg[data-view-mode="split"] [data-view="back"]')).toHaveCount(1);

  // Click the left sleeve in the drawing → the hierarchy selects the same component (AC1).
  const sleeve = sleevePanel(page);
  const componentId = await sleeve.getAttribute('data-component-id');
  expect(componentId).toMatch(/^cmp_/);
  const at = await sleeve.evaluate((el) => {
    // A screen point inside this path that is not covered by another element.
    const path = el as SVGPathElement;
    const box = path.getBBox();
    const ctm = path.getScreenCTM()!;
    for (let i = 1; i < 20; i++)
      for (let j = 1; j < 20; j++) {
        const p = new DOMPoint(box.x + (box.width * i) / 20, box.y + (box.height * j) / 20);
        if (!path.isPointInFill(p)) continue;
        const s = p.matrixTransform(ctm);
        if (document.elementFromPoint(s.x, s.y) === path) return { x: s.x, y: s.y };
      }
    return null;
  });
  expect(at).not.toBeNull();
  await page.mouse.click(at!.x, at!.y);
  await expect(
    page
      .getByRole('tree', { name: 'Components' })
      .getByRole('treeitem', { name: 'Left sleeve', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    canvas
      .locator(`[data-highlight="selected"][data-component-id-highlight="${componentId}"]`)
      .first(),
  ).toBeAttached();
  await expect(page.getByText('1 selected')).toBeVisible();
  // Background click clears the selection.
  const canvasBox = (await canvas.boundingBox())!;
  await page.mouse.click(canvasBox.x + 20, canvasBox.y + canvasBox.height - 60);
  await expect(page.getByText('Nothing selected')).toBeVisible();

  // Zoom / fit never write to the design (AC6).
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/operations')) posts.push(r.url());
  });
  const zoom = page.getByTestId('zoom-level');
  const before = await zoom.textContent();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoom).not.toHaveText(before!);
  await page.getByRole('button', { name: 'Fit to view' }).click();
  await expect(zoom).toHaveText(before!);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(canvas.locator('svg[data-view-mode="back"] [data-view="front"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  expect(posts).toEqual([]);
  await expect(page.getByTestId('working-copy-badge')).toHaveText('Working copy · v1');

  // A property change redraws the flat deterministically, without AI (AC2).
  const d0 = await sleeve.getAttribute('d');
  await setLength(page, 'Left sleeve', 'Sleeve length', '30');
  await expect.poll(() => sleeve.getAttribute('d')).not.toBe(d0);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');
});

test('dev gallery renders every template variant', async ({ page }) => {
  const email = await createVerifiedAccount(undefined, 'Gallery Viewer');
  await page.goto('/sign-in');
  await submitSignIn(page, email);
  await createOrganizationInOnboarding(page);
  await page.goto('/dev/garment-gallery');
  const items = page.getByTestId('gallery-item');
  await expect(items).toHaveCount(8);
  for (const item of await items.all())
    expect(await item.locator('path').count()).toBeGreaterThan(15);
  // Visual smoke: kept as an attachment for review, not compared pixel by pixel (SPEC-007 §25.2).
  await test.info().attach('garment-gallery', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
