import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { linkFrom, waitForEmailText } from '../support/mailpit.js';
import {
  createOrganizationInOnboarding,
  enrollMfaInUi,
  submitSignIn,
  uniqueOrgName,
} from '../support/ui.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('an owner demotes an admin to viewer: the UI hides admin actions and the API rejects them', async ({
  browser,
  baseURL,
}) => {
  const ownerEmail = await createVerifiedAccount(undefined, 'Olga Owner');
  const adminEmail = await createVerifiedAccount(undefined, 'Adam Admin');
  const orgName = uniqueOrgName('Roles Studio');

  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto('/sign-in');
  await submitSignIn(owner, ownerEmail);
  await createOrganizationInOnboarding(owner, orgName);
  // Changing roles is a privileged action: it needs two-step verification (I08).
  await enrollMfaInUi(owner);

  // Invite as Admin.
  await owner.goto('/settings/members');
  await owner.getByRole('button', { name: 'Invite' }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByLabel('Email').fill(adminEmail);
  await dialog.getByRole('combobox', { name: 'Role' }).click();
  // Themed list (not the browser's native one): role name + description per option.
  const adminOption = owner.getByRole('option', { name: /^Admin/ });
  await expect(adminOption).toContainText('Members, settings');
  await adminOption.click();
  await expect(dialog.getByRole('combobox', { name: 'Role' })).toHaveText(/Admin/);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(owner.getByText(`Invitation sent to ${adminEmail}`)).toBeVisible();

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await admin.goto(
    linkFrom(
      await waitForEmailText(adminEmail, new RegExp(`Invitation to join ${orgName}`)),
      '/invitations/accept',
    ),
  );
  await admin.getByRole('link', { name: `Sign in as ${adminEmail}` }).click();
  await submitSignIn(admin, adminEmail);
  await admin.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(admin.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  // As admin: settings are editable and members can be invited.
  await admin.goto('/settings');
  await expect(admin.getByLabel('Organization name')).toBeVisible();
  await admin.goto('/settings/members');
  await expect(admin.getByRole('button', { name: 'Invite' })).toBeVisible();

  // Owner changes the admin to Viewer through the role editor.
  await owner.reload();
  await owner.getByRole('button', { name: 'Actions for Adam Admin' }).click();
  await owner.getByRole('menuitem', { name: 'Edit roles' }).click();
  const roles = owner.getByRole('dialog');
  await expect(roles.getByLabel(/^Owner/)).toBeDisabled();
  await roles.getByLabel(/^Admin/).uncheck();
  await roles.getByLabel(/^Viewer/).check();
  await roles.getByRole('button', { name: 'Save roles' }).click();
  await expect(owner.getByText('Roles updated for Adam Admin')).toBeVisible();
  await expect(owner.getByTestId(`member-${adminEmail}`)).toContainText('Viewer');

  // The owner can review the member's effective permissions.
  await owner.getByRole('button', { name: 'Actions for Adam Admin' }).click();
  await owner.getByRole('menuitem', { name: 'View permissions' }).click();
  const perms = owner.getByTestId('effective-permissions');
  await expect(perms).toContainText('design.view');
  await expect(perms).not.toContainText('members.view');
  await owner.keyboard.press('Escape');

  // As viewer: admin actions are gone from the UI…
  await admin.goto('/settings/members');
  await expect(admin.getByText("You can't see the member list")).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Invite' })).toHaveCount(0);
  await admin.goto('/settings');
  await expect(admin.getByLabel('Organization name')).toHaveCount(0);
  await expect(admin.getByRole('link', { name: 'Members' })).toHaveCount(0);

  // …and the API rejects them regardless of the UI.
  const orgs = (await (await admin.request.get('/v1/orgs')).json()) as {
    items: { id: string; name: string }[];
  };
  const orgId = orgs.items.find((o) => o.name === orgName)?.id ?? '';
  const rename = await admin.request.patch(`/v1/orgs/${orgId}`, {
    data: { name: 'Taken over' },
    headers: { origin: baseURL ?? 'http://localhost:3000' },
  });
  expect(rename.status()).toBe(403);
  const list = await admin.request.get(`/v1/orgs/${orgId}/members`);
  expect(list.status()).toBe(403);

  await ownerCtx.close();
  await adminCtx.close();
});
