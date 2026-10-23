import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

const orgRef = { organizationId: z.uuid() };

/** Role assignments of a membership changed (consumers invalidate authorization caches). */
export const RoleAssignmentChangedEvent = defineEvent(
  'authorization.role_assignment_changed',
  1,
  z.object({
    ...orgRef,
    membershipId: z.uuid(),
    userId: z.uuid(),
    added: z.array(z.string()),
    removed: z.array(z.string()),
  }),
);
export const ResourceGrantCreatedEvent = defineEvent(
  'authorization.resource_grant_created',
  1,
  z.object({ ...orgRef, grantId: z.uuid(), resourceType: z.string(), resourceId: z.uuid() }),
);
export const ResourceGrantRevokedEvent = defineEvent(
  'authorization.resource_grant_revoked',
  1,
  z.object({ ...orgRef, grantId: z.uuid(), resourceType: z.string(), resourceId: z.uuid() }),
);
