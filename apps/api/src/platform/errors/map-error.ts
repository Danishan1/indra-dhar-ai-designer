import {
  type ErrorCode,
  type ErrorEnvelope,
  ErrorHttpStatus,
  type ValidationIssue,
} from '@ai-designer/contracts';
import { Prisma } from '@ai-designer/db';
import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';

import { AppError } from './app-error.js';

export interface MappedError {
  status: number;
  body: ErrorEnvelope;
  /** true for unexpected (5xx) errors that must be logged with their stack. */
  unexpected: boolean;
}

const HTTP_STATUS_CODES: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  405: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'VALIDATION_FAILED',
  422: 'VALIDATION_BLOCKED',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

export function zodIssues(err: ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({
    path: i.path.map(String).join('.'),
    message: i.message,
    code: i.code,
  }));
}

function envelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}

/**
 * Maps any thrown value to the error envelope (docs/plan/02-conventions.md §5). Pure function so
 * every mapping is unit-tested. Database/internal details are never exposed to clients.
 */
export function mapError(err: unknown, requestId: string): MappedError {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: envelope(err.code, err.message, requestId, err.details),
      unexpected: err.status >= 500,
    };
  }
  if (err instanceof ZodError) {
    return {
      status: 400,
      body: envelope('VALIDATION_FAILED', 'Request validation failed', requestId, {
        issues: zodIssues(err),
      }),
      unexpected: false,
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return {
          status: 409,
          body: envelope('CONFLICT', 'Resource already exists', requestId),
          unexpected: false,
        };
      case 'P2025':
        return {
          status: 404,
          body: envelope('NOT_FOUND', 'Resource not found', requestId),
          unexpected: false,
        };
      case 'P2034':
        return {
          status: 409,
          body: envelope(
            'CONCURRENT_MODIFICATION',
            'Concurrent modification, retry the request',
            requestId,
          ),
          unexpected: false,
        };
      default:
        break;
    }
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const code =
      HTTP_STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_FAILED');
    const message = status >= 500 ? 'Internal server error' : err.message;
    return { status, body: envelope(code, message, requestId), unexpected: status >= 500 };
  }
  // Errors raised by body-parser before routing (express): { status, type }.
  if (typeof err === 'object' && err !== null && 'type' in err && 'status' in err) {
    const { type, status } = err as { type: unknown; status: unknown };
    if (type === 'entity.too.large') {
      return {
        status: 413,
        body: envelope('PAYLOAD_TOO_LARGE', 'Request body too large', requestId),
        unexpected: false,
      };
    }
    if (type === 'entity.parse.failed' || (typeof status === 'number' && status === 400)) {
      return {
        status: 400,
        body: envelope('VALIDATION_FAILED', 'Malformed request body', requestId),
        unexpected: false,
      };
    }
  }
  return {
    status: ErrorHttpStatus.INTERNAL_ERROR,
    body: envelope('INTERNAL_ERROR', 'Internal server error', requestId),
    unexpected: true,
  };
}
