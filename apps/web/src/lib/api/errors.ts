import { type ErrorCode, ErrorCodes } from '@ai-designer/contracts';

/** An API failure carrying the stable error code and the request id (for support). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly requestId: string | null,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 4xx: the request itself is wrong or not allowed — retrying will not help. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

/** User-facing wording per error code; the server message is shown only for validation detail. */
const FRIENDLY_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Some of the information is not valid. Please check and try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  PERMISSION_DENIED: 'You do not have permission to do that.',
  NOT_FOUND:
    'We could not find what you were looking for. It may have been removed or you may not have access.',
  CONFLICT: 'This conflicts with an existing item.',
  INVALID_STATE_TRANSITION: 'This action is not possible in the current state.',
  CONCURRENT_MODIFICATION:
    'Someone else changed this in the meantime. Reload to see the latest version.',
  IDEMPOTENCY_CONFLICT: 'This request was already submitted with different data.',
  VALIDATION_BLOCKED: 'Validation problems must be resolved first.',
  DEPENDENCY_UNAVAILABLE:
    'A required service is temporarily unavailable. Please try again shortly.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  QUOTA_EXCEEDED: 'Your plan limit has been reached.',
  UNSUPPORTED_CAPABILITY: 'This option is not supported here.',
  RETENTION_POLICY_BLOCKED: 'This item is protected by a retention policy.',
  REVISION_NOT_FOUND: 'That revision does not exist.',
  REVISION_NOT_APPROVED: 'That revision has not been approved yet.',
  PAYLOAD_TOO_LARGE: 'The upload or request is too large.',
  EMAIL_NOT_VERIFIED: 'Confirm your email address first.',
  ACCOUNT_NOT_ACTIVE:
    'This account cannot sign in. Contact support if you think this is a mistake.',
  TOKEN_INVALID_OR_EXPIRED: 'This link is invalid or has expired. Request a new one.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

export function friendlyMessage(code: ErrorCode): string {
  return FRIENDLY_MESSAGES[code] ?? FRIENDLY_MESSAGES.INTERNAL_ERROR ?? 'Unexpected error';
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && value in ErrorCodes;
}

/** Normalizes anything thrown into an ApiError (non-API errors become INTERNAL_ERROR). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError('INTERNAL_ERROR', message, 0, null);
}
