import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';

import { InvitationService } from './invitation.service.js';
import { InvitationsController, OrgInvitationsController } from './invitations.controller.js';
import { MembersController } from './members.controller.js';
import { OrganizationsDirectory } from './membership-directory.service.js';
import { MembershipService } from './membership.service.js';
import { OrganizationService } from './organization.service.js';
import { OrganizationsMailService } from './organizations-mail.service.js';
import { OrganizationsController } from './organizations.controller.js';

/**
 * Organizations (SS-01): tenants, memberships, invitations, ownership continuity (I06). Owns the
 * organizations, workspaces, memberships, membership_roles and invitations tables; registers the
 * membership directory and `membership` / `invitation` resource resolvers for the PDP (I07). User
 * profiles come from IdentityModule's AccountService (never from the users table directly).
 */
@Module({
  imports: [IdentityModule],
  controllers: [
    OrganizationsController,
    MembersController,
    OrgInvitationsController,
    InvitationsController,
  ],
  providers: [
    OrganizationService,
    MembershipService,
    InvitationService,
    OrganizationsMailService,
    OrganizationsDirectory,
  ],
})
export class OrganizationsModule {}
