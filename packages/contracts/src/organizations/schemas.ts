import { z } from 'zod';

import { emailSchema, emailTokenSchema } from '../identity/schemas.js';

/**
 * Placeholder role catalog (I06). I07 replaces the placeholder checks with the permission catalog;
 * the keys stay. Ownership is never granted by invitation — only by ownership transfer.
 */
export const OrgRoleKeys = ['organization_owner', 'organization_admin', 'designer'] as const;
export const orgRoleKeySchema = z.enum(OrgRoleKeys);
export type OrgRoleKey = z.infer<typeof orgRoleKeySchema>;
export const InvitableRoleKeys = ['organization_admin', 'designer'] as const;
export const invitableRoleKeySchema = z.enum(InvitableRoleKeys);

export const OrgRoleLabels: Record<OrgRoleKey, string> = {
  organization_owner: 'Owner',
  organization_admin: 'Admin',
  designer: 'Designer',
};

export const OrganizationStatuses = ['active', 'suspended', 'deleted'] as const;
export const MembershipStatuses = ['invited', 'active', 'suspended', 'revoked', 'expired'] as const;
export const membershipStatusSchema = z.enum(MembershipStatuses);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export const InvitationStatuses = ['pending', 'accepted', 'cancelled', 'expired'] as const;
export const invitationStatusSchema = z.enum(InvitationStatuses);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, { message: 'Use at least 2 characters' })
  .max(80);

export const createOrganizationRequestSchema = z.object({ name: organizationNameSchema });
export type CreateOrganizationRequest = z.input<typeof createOrganizationRequestSchema>;
export const updateOrganizationRequestSchema = z.object({ name: organizationNameSchema });
export type UpdateOrganizationRequest = z.input<typeof updateOrganizationRequestSchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  displayId: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.enum(OrganizationStatuses),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

/** One of "my organizations": the org plus my membership in it. */
export const myOrganizationSchema = organizationSchema.extend({
  membership: z.object({
    id: z.uuid(),
    status: membershipStatusSchema,
    roles: z.array(orgRoleKeySchema),
  }),
});
export type MyOrganization = z.infer<typeof myOrganizationSchema>;
export const myOrganizationsResponseSchema = z.object({ items: z.array(myOrganizationSchema) });

export const memberSchema = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  email: z.string(),
  status: membershipStatusSchema,
  roles: z.array(orgRoleKeySchema),
  joinedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  endReason: z.string().nullable(),
});
export type Member = z.infer<typeof memberSchema>;
export const membersResponseSchema = z.object({ items: z.array(memberSchema) });

export const createInvitationRequestSchema = z.object({
  email: emailSchema,
  role: invitableRoleKeySchema,
});
export type CreateInvitationRequest = z.input<typeof createInvitationRequestSchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  roles: z.array(orgRoleKeySchema),
  status: invitationStatusSchema,
  invitedBy: z.object({ userId: z.uuid(), displayName: z.string() }),
  expiresAt: z.string(),
  createdAt: z.string(),
  lastSentAt: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;
export const invitationsResponseSchema = z.object({ items: z.array(invitationSchema) });

/** Tokens travel in request bodies (never URLs) so they do not end up in access logs. */
export const invitationTokenRequestSchema = z.object({ token: emailTokenSchema });

/** Public preview: only what the invitee needs to decide (no member list, no org id). */
export const invitationPreviewSchema = z.object({
  organizationName: z.string(),
  invitedByName: z.string(),
  email: z.string(),
  roles: z.array(orgRoleKeySchema),
  expiresAt: z.string(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationResponseSchema = z.object({ organization: myOrganizationSchema });

export const transferOwnershipRequestSchema = z.object({
  toMembershipId: z.uuid(),
  /** Explicit confirmation (FR-SEC-081): must equal the organization's current name. */
  confirmOrganizationName: z.string().min(1),
});
export type TransferOwnershipRequest = z.input<typeof transferOwnershipRequestSchema>;

export const orgIdParamsSchema = z.object({ orgId: z.uuid() });
export const orgMemberParamsSchema = z.object({ orgId: z.uuid(), membershipId: z.uuid() });
export const orgInvitationParamsSchema = z.object({ orgId: z.uuid(), invitationId: z.uuid() });
