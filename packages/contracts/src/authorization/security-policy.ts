import { z } from 'zod';

import { defineEvent } from '../events/envelope.js';

/**
 * Organization security policy (versioned; I08). Timeouts are bounded by the platform maxima
 * (SESSION_IDLE_TIMEOUT_MIN / SESSION_ABSOLUTE_TIMEOUT_H) — an org can only tighten them.
 */
export const securityPolicyConfigSchema = z.object({
  /** Every member needs an MFA-verified session for any access to the organization (FR-SEC-034). */
  requireMfa: z.boolean(),
  /** How recent the last second-factor check must be for step-up actions (FR-SEC-040). */
  stepUpMaxAgeMinutes: z.number().int().min(1).max(60),
  /** Idle timeout for this organization's requests; null = platform default. */
  sessionIdleMinutes: z.number().int().min(5).nullable(),
  /** Absolute session lifetime for this organization's requests; null = platform default. */
  sessionAbsoluteHours: z.number().int().min(1).nullable(),
  allowExternalSharing: z.boolean(),
  requireIndependentDesignApproval: z.boolean(),
  requireIndependentRelease: z.boolean(),
});
export type SecurityPolicyConfig = z.infer<typeof securityPolicyConfigSchema>;

export const DEFAULT_SECURITY_POLICY: SecurityPolicyConfig = {
  requireMfa: false,
  stepUpMaxAgeMinutes: 10,
  sessionIdleMinutes: null,
  sessionAbsoluteHours: null,
  allowExternalSharing: false,
  requireIndependentDesignApproval: false,
  requireIndependentRelease: false,
};

export const securityPolicySchema = z.object({
  version: z.number().int(),
  config: securityPolicyConfigSchema,
  updatedAt: z.string().nullable(),
  /** Platform maxima the org values must stay within. */
  limits: z.object({ sessionIdleMinutesMax: z.number(), sessionAbsoluteHoursMax: z.number() }),
});
export type SecurityPolicy = z.infer<typeof securityPolicySchema>;

export const updateSecurityPolicyRequestSchema = securityPolicyConfigSchema;
export type UpdateSecurityPolicyRequest = z.input<typeof updateSecurityPolicyRequestSchema>;

export const SecurityPolicyChangedEvent = defineEvent(
  'authorization.security_policy_changed',
  1,
  z.object({ organizationId: z.uuid(), version: z.number().int() }),
);
