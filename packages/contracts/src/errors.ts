import { z } from 'zod';

/**
 * Stable machine-readable error codes (docs/plan/02-conventions.md §5, SPEC-006 §14, SPEC-004 ERR-001).
 * Iterations add codes here in the same change that starts using them. Never rename a code.
 */
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  VALIDATION_BLOCKED: 'VALIDATION_BLOCKED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
  RETENTION_POLICY_BLOCKED: 'RETENTION_POLICY_BLOCKED',
  REVISION_NOT_FOUND: 'REVISION_NOT_FOUND',
  REVISION_NOT_APPROVED: 'REVISION_NOT_APPROVED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_NOT_ACTIVE: 'ACCOUNT_NOT_ACTIVE',
  TOKEN_INVALID_OR_EXPIRED: 'TOKEN_INVALID_OR_EXPIRED',
  LAST_OWNER_REQUIRED: 'LAST_OWNER_REQUIRED',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Default HTTP status per code (docs/plan/02-conventions.md §5). */
export const ErrorHttpStatus: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  CONCURRENT_MODIFICATION: 409,
  IDEMPOTENCY_CONFLICT: 409,
  VALIDATION_BLOCKED: 422,
  DEPENDENCY_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  UNSUPPORTED_CAPABILITY: 422,
  RETENTION_POLICY_BLOCKED: 409,
  REVISION_NOT_FOUND: 404,
  REVISION_NOT_APPROVED: 409,
  PAYLOAD_TOO_LARGE: 413,
  EMAIL_NOT_VERIFIED: 403,
  ACCOUNT_NOT_ACTIVE: 403,
  TOKEN_INVALID_OR_EXPIRED: 400,
  LAST_OWNER_REQUIRED: 409,
  INVITATION_EMAIL_MISMATCH: 403,
  INTERNAL_ERROR: 500,
};

export const errorCodeSchema = z.enum(Object.values(ErrorCodes) as [ErrorCode, ...ErrorCode[]]);

/** Uniform error envelope returned by every API error response. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Field-level validation issue placed in `details.issues` for VALIDATION_FAILED. */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
