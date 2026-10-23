import { expect, test } from '@playwright/test';

import { createVerifiedAccount, resetRateLimits } from '../support/accounts.js';
import { linkFrom, waitForEmailText } from '../support/mailpit.js';
import { createOrganizationInOnboarding, submitSignIn, uniqueOrgName } from '../support/ui.js';

// Two people, each in their own signed-out browser context.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async () => {
  await resetRateLimits();
});

test('owner invites a designer who accepts, sees the org, and switches organizations (AC)', async ({
  browser,
}) => {
  const ownerEmail = await createVerifiedAccount(undefined, 'Olivia Owner');
  const designerEmail = await createVerifiedAccount(undefined, 'Dan Designer');
  const orgName = uniqueOrgName('Acme Apparel');

  // Owner: onboarding → members → invite.
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await owner.goto('/sign-in');
  await submitSignIn(owner, ownerEmail);
  await createOrganizationInOnboarding(owner, orgName);
  await owner.goto('/settings/members');
  await expect(owner.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
  await expect(owner.getByTestId(`member-${ownerEmail}`)).toContainText('Owner');
  await owner.getByRole('button', { name: 'Invite' }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.getByLabel('Email').fill(designerEmail);
  await dialog.getByRole('button', { name: 'Send invitation' }).click();
  await expect(owner.getByText(`Invitation sent to ${designerEmail}`)).toBeVisible();
  await owner.getByRole('tab', { name: 'Invitations' }).click();
  await expect(owner.getByTestId(`invitation-${designerEmail}`)).toContainText('pending', {
    ignoreCase: true,
  });

  // Designer: email link → sign in as the invited address → accept.
  const link = linkFrom(
    await waitForEmailText(designerEmail, new RegExp(`Invitation to join ${orgName}`)),
    '/invitations/accept',
  );
  const designerCtx = await browser.newContext();
  const designer = await designerCtx.newPage();
  await designer.goto(link);
  await expect(designer.getByRole('heading', { name: `Join ${orgName}` })).toBeVisible();
  await designer.getByRole('link', { name: `Sign in as ${designerEmail}` }).click();
  await submitSignIn(designer, designerEmail);
  await expect(designer).toHaveURL(/\/invitations\/accept\?token=/);
  await designer.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(
    designer.getByRole('button', { name: `Organization: ${orgName}. Switch organization` }),
  ).toBeVisible();
  await expect(designer.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

  // The designer sees the member list but cannot manage it.
  await designer.goto('/settings/members');
  await expect(designer.getByTestId(`member-${ownerEmail}`)).toBeVisible();
  await expect(designer.getByTestId(`member-${designerEmail}`)).toContainText('Designer');
  await expect(designer.getByRole('button', { name: 'Invite' })).toHaveCount(0);

  // The owner sees the new active member.
  await owner.reload();
  await expect(owner.getByTestId(`member-${designerEmail}`)).toContainText('Active', {
    ignoreCase: true,
  });

  // Designer creates their own organization, then switches back.
  const ownOrg = uniqueOrgName('Dan Studio');
  await designer
    .getByRole('button', { name: `Organization: ${orgName}. Switch organization` })
    .click();
  await designer.getByRole('menuitem', { name: 'Create organization' }).click();
  await designer.getByRole('dialog').getByLabel('Organization name').fill(ownOrg);
  await designer.getByRole('dialog').getByRole('button', { name: 'Create organization' }).click();
  await expect(
    designer.getByRole('button', { name: `Organization: ${ownOrg}. Switch organization` }),
  ).toBeVisible();
  await designer
    .getByRole('button', { name: `Organization: ${ownOrg}. Switch organization` })
    .click();
  await designer.getByRole('menuitem', { name: new RegExp(orgName) }).click();
  await expect(
    designer.getByRole('button', { name: `Organization: ${orgName}. Switch organization` }),
  ).toBeVisible();

  await ownerCtx.close();
  await designerCtx.close();
});
