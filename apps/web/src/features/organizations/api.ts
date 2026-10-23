import {
  acceptInvitationResponseSchema,
  effectivePermissionsSchema,
  myPermissionsResponseSchema,
  type OrgRoleKey,
  rolesResponseSchema,
  type CreateInvitationRequest,
  invitationPreviewSchema,
  invitationSchema,
  invitationsResponseSchema,
  memberSchema,
  membersResponseSchema,
  myOrganizationSchema,
  myOrganizationsResponseSchema,
  type TransferOwnershipRequest,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const org = (orgId: string) => `/v1/orgs/${encodeURIComponent(orgId)}`;

export const orgsApi = {
  mine: (signal?: AbortSignal) =>
    apiRequest('/v1/orgs', {
      schema: myOrganizationsResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  create: (name: string) =>
    apiRequest('/v1/orgs', { method: 'POST', body: { name }, schema: myOrganizationSchema }),
  rename: (orgId: string, name: string) =>
    apiRequest(org(orgId), { method: 'PATCH', body: { name }, schema: myOrganizationSchema }),
  members: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/members`, {
      schema: membersResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  memberAction: (
    orgId: string,
    membershipId: string,
    action: 'suspend' | 'reactivate' | 'revoke',
  ) =>
    apiRequest(`${org(orgId)}/members/${encodeURIComponent(membershipId)}/${action}`, {
      method: 'POST',
      schema: memberSchema,
    }),
  invitations: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/invitations`, {
      schema: invitationsResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  invite: (orgId: string, body: CreateInvitationRequest) =>
    apiRequest(`${org(orgId)}/invitations`, { method: 'POST', body, schema: invitationSchema }),
  cancelInvitation: (orgId: string, invitationId: string) =>
    apiRequest(`${org(orgId)}/invitations/${encodeURIComponent(invitationId)}/cancel`, {
      method: 'POST',
    }),
  resendInvitation: (orgId: string, invitationId: string) =>
    apiRequest(`${org(orgId)}/invitations/${encodeURIComponent(invitationId)}/resend`, {
      method: 'POST',
      schema: invitationSchema,
    }),
  updateMemberRoles: (orgId: string, membershipId: string, roles: OrgRoleKey[]) =>
    apiRequest(`${org(orgId)}/members/${encodeURIComponent(membershipId)}/roles`, {
      method: 'PUT',
      body: { roles },
      schema: memberSchema,
    }),
  effectivePermissions: (orgId: string, membershipId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/members/${encodeURIComponent(membershipId)}/effective-permissions`, {
      schema: effectivePermissionsSchema,
      ...(signal ? { signal } : {}),
    }),
  roles: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`${org(orgId)}/roles`, {
      schema: rolesResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  myPermissions: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`/v1/me/permissions?orgId=${encodeURIComponent(orgId)}`, {
      schema: myPermissionsResponseSchema,
      ...(signal ? { signal } : {}),
    }),
  transferOwnership: (orgId: string, body: TransferOwnershipRequest) =>
    apiRequest(`${org(orgId)}/ownership-transfer`, { method: 'POST', body }),
  previewInvitation: (token: string) =>
    apiRequest('/v1/invitations/preview', {
      method: 'POST',
      body: { token },
      schema: invitationPreviewSchema,
    }),
  acceptInvitation: (token: string) =>
    apiRequest('/v1/invitations/accept', {
      method: 'POST',
      body: { token },
      schema: acceptInvitationResponseSchema,
    }),
};
