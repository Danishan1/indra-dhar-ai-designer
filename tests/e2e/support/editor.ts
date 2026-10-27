import type { Page } from '@playwright/test';

/** Selects a component by name in the hierarchy tree (I17). */
export async function selectInTree(page: Page, name: string) {
  await page
    .getByRole('tree', { name: 'Components' })
    .getByRole('treeitem', { name, exact: true })
    .click();
}

/** Sets a length through the properties panel (lengths are shown in cm by default). */
export async function setLength(page: Page, component: string, label: string, cm: string) {
  await selectInTree(page, component);
  const input = page
    .getByTestId('component-properties')
    .getByRole('textbox', { name: label, exact: true });
  await input.fill(cm);
  await input.press('Enter');
}
