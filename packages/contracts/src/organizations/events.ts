import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const orgRef = { organizationId: z.uuid() };

export const OrganizationCreatedEvent = defineEvent(
  'organizations.organization_created',
  1,
  z.object({ ...orgRef, ownerUserId: z.uuid() }),
);
export const InvitationCreatedEvent = defineEvent(
  'organizations.invitation_created',
  1,
  z.object({ ...orgRef, invitationId: z.uuid() }),
);
export const InvitationAcceptedEvent = defineEvent(
  'organizations.invitation_accepted',
  1,
  z.object({ ...orgRef, invitationId: z.uuid(), membershipId: z.uuid(), userId: z.uuid() }),
);
export const InvitationCancelledEvent = defineEvent(
  'organizations.invitation_cancelled',
  1,
  z.object({ ...orgRef, invitationId: z.uuid() }),
);
export const MembershipSuspendedEvent = defineEvent(
  'organizations.membership_suspended',
  1,
  z.object({ ...orgRef, membershipId: z.uuid(), userId: z.uuid() }),
);
export const MembershipReactivatedEvent = defineEvent(
  'organizations.membership_reactivated',
  1,
  z.object({ ...orgRef, membershipId: z.uuid(), userId: z.uuid() }),
);
export const MembershipRevokedEvent = defineEvent(
  'organizations.membership_revoked',
  1,
  z.object({ ...orgRef, membershipId: z.uuid(), userId: z.uuid() }),
);
export const OwnershipTransferredEvent = defineEvent(
  'organizations.ownership_transferred',
  1,
  z.object({ ...orgRef, fromUserId: z.uuid(), toUserId: z.uuid() }),
);
