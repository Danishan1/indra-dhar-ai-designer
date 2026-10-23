import { z } from 'zod';

import { meSchema } from './schemas.js';

/** A 6-digit TOTP code (spaces allowed while typing, stripped). */
export const totpCodeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'));

/** Recovery codes are shown as `xxxxx-xxxxx`; dashes/spaces/case are ignored. */
export const recoveryCodeSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]+/g, '').toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9]{10}$/, 'Enter a recovery code like abcde-12345'));

/** Login answers with the user, or asks for the second factor (two-phase login, I08). */
export const loginResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authenticated'), user: meSchema }),
  z.object({
    status: z.literal('mfa_required'),
    methods: z.array(z.enum(['totp', 'recovery_code'])),
  }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const mfaVerifyRequestSchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({ recoveryCode: recoveryCodeSchema }),
]);
export type MfaVerifyRequest = z.input<typeof mfaVerifyRequestSchema>;

export const mfaStatusSchema = z.object({
  totpEnabled: z.boolean(),
  totpConfirmedAt: z.string().nullable(),
  recoveryCodesRemaining: z.number().int(),
  /** Whether the current session completed a second factor. */
  sessionMfaVerified: z.boolean(),
});
export type MfaStatus = z.infer<typeof mfaStatusSchema>;

export const totpSetupResponseSchema = z.object({
  /** Base32 secret for manual entry. Shown once during setup only. */
  secret: z.string(),
  otpauthUri: z.string(),
});
export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;

export const totpConfirmRequestSchema = z.object({ code: totpCodeSchema });
export const recoveryCodesResponseSchema = z.object({ codes: z.array(z.string()) });
export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;

/** Disabling needs the password AND a current code — never just an email link (FR-SEC-039). */
export const totpDisableRequestSchema = z.object({
  password: z.string().min(1).max(128),
  code: totpCodeSchema,
});
export type TotpDisableRequest = z.input<typeof totpDisableRequestSchema>;

/** Step-up: a TOTP code when MFA is enrolled, otherwise the password. */
export const stepUpRequestSchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({ password: z.string().min(1).max(128) }),
]);
export type StepUpRequest = z.input<typeof stepUpRequestSchema>;
export const stepUpResponseSchema = z.object({ stepUpAt: z.string() });

export const sessionInfoSchema = z.object({
  id: z.uuid(),
  deviceLabel: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
  mfaVerified: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
export const sessionsResponseSchema = z.object({ items: z.array(sessionInfoSchema) });
export const sessionIdParamsSchema = z.object({ sessionId: z.uuid() });
export const revokeOthersResponseSchema = z.object({ revoked: z.number().int() });

/** Details of a STEP_UP_REQUIRED / MFA_REQUIRED error (for the web dialog). */
export const stepUpErrorDetailsSchema = z.object({
  reason: z.string().optional(),
  method: z.enum(['totp', 'password']).optional(),
  maxAgeMinutes: z.number().optional(),
  enrolled: z.boolean().optional(),
});
