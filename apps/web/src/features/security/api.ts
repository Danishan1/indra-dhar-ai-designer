import {
  auditSearchResponseSchema,
  mfaStatusSchema,
  recoveryCodesResponseSchema,
  revokeOthersResponseSchema,
  securityPolicySchema,
  sessionsResponseSchema,
  totpSetupResponseSchema,
  type TotpDisableRequest,
  type UpdateSecurityPolicyRequest,
} from '@ai-designer/contracts';

import { apiRequest } from '@/lib/api/client';

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export interface AuditFilters {
  eventType?: string;
  outcome?: string;
  actorId?: string;
  resourceType?: string;
  from?: string;
  to?: string;
}

export const securityApi = {
  mfa: (signal?: AbortSignal) =>
    apiRequest('/v1/me/mfa', { schema: mfaStatusSchema, ...withSignal(signal) }),
  totpSetup: () =>
    apiRequest('/v1/me/mfa/totp/setup', { method: 'POST', schema: totpSetupResponseSchema }),
  totpConfirm: (code: string) =>
    apiRequest('/v1/me/mfa/totp/confirm', {
      method: 'POST',
      body: { code },
      schema: recoveryCodesResponseSchema,
    }),
  totpDisable: (body: TotpDisableRequest) =>
    apiRequest('/v1/me/mfa/totp/disable', { method: 'POST', body }),
  regenerateRecoveryCodes: () =>
    apiRequest('/v1/me/mfa/recovery-codes/regenerate', {
      method: 'POST',
      schema: recoveryCodesResponseSchema,
    }),
  sessions: (signal?: AbortSignal) =>
    apiRequest('/v1/me/sessions', { schema: sessionsResponseSchema, ...withSignal(signal) }),
  revokeSession: (sessionId: string) =>
    apiRequest(`/v1/me/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    apiRequest('/v1/me/sessions/revoke-others', {
      method: 'POST',
      schema: revokeOthersResponseSchema,
    }),
  securityPolicy: (orgId: string, signal?: AbortSignal) =>
    apiRequest(`/v1/orgs/${encodeURIComponent(orgId)}/security-policy`, {
      schema: securityPolicySchema,
      ...withSignal(signal),
    }),
  updateSecurityPolicy: (orgId: string, body: UpdateSecurityPolicyRequest) =>
    apiRequest(`/v1/orgs/${encodeURIComponent(orgId)}/security-policy`, {
      method: 'PUT',
      body,
      schema: securityPolicySchema,
    }),
  auditEvents: (orgId: string, filters: AuditFilters, cursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '50');
    return apiRequest(`/v1/orgs/${encodeURIComponent(orgId)}/audit-events?${params.toString()}`, {
      schema: auditSearchResponseSchema,
      ...withSignal(signal),
    });
  },
};
