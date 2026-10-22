import { type ErrorCode, ErrorHttpStatus } from '@ai-designer/contracts';

/**
 * The only exception business code should throw for expected failures. Rendered as the standard
 * error envelope by the global filter. Never put secrets or SQL in `message`/`details`.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    status?: number,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status ?? ErrorHttpStatus[code];
  }

  static notFound(resource: string): AppError {
    return new AppError('NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, details);
  }

  static invalidTransition(from: string, to: string): AppError {
    return new AppError('INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`, {
      from,
      to,
    });
  }
}
