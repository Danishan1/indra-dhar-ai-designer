import { z } from 'zod';

/**
 * Email: trimmed + lowercased; no provider-specific rewriting such as dot-stripping (FR-SEC-002).
 * Accounts are never merged by email or display name (FR-SEC-009).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Enter a valid email address' }))
  .transform(normalizeEmail);

/** Password policy (FR-SEC-018): 12–128 characters, not only whitespace. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: `Use at least ${PASSWORD_MIN_LENGTH} characters` })
  .max(PASSWORD_MAX_LENGTH, { message: `Use at most ${PASSWORD_MAX_LENGTH} characters` })
  .refine((v) => v.trim().length > 0, { message: 'Password cannot be only spaces' });

export const displayNameSchema = z.string().trim().min(1, { message: 'Enter your name' }).max(80);

/** Opaque token from an email link (base64url, 43 chars for 32 bytes). */
export const emailTokenSchema = z.string().trim().min(16).max(256);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

/** Login does not apply the password policy (old passwords must still work). */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.object({ token: emailTokenSchema });
export const resendVerificationRequestSchema = z.object({ email: emailSchema });
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: emailTokenSchema,
  newPassword: passwordSchema,
});
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;

/** Generic response for operations that must not reveal whether an account exists (FR-SEC-014/024). */
export const acceptedResponseSchema = z.object({
  status: z.literal('accepted'),
  message: z.string(),
});
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;

export const AccountStatuses = [
  'pending_verification',
  'active',
  'suspended',
  'locked',
  'deletion_pending',
  'deleted_or_anonymized',
] as const;
export const accountStatusSchema = z.enum(AccountStatuses);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const meSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  status: accountStatusSchema,
  emailVerified: z.boolean(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const updateMeRequestSchema = z.object({ displayName: displayNameSchema });
export type UpdateMeRequest = z.input<typeof updateMeRequestSchema>;

export const sessionResponseSchema = z.object({ user: meSchema });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
