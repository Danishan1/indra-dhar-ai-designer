import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { RequestContext } from '../context/request-context.js';

import { mapError } from './map-error.js';

/** Global filter: every error leaves the API as the standard envelope with the request id. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: unknown }>();
    const res = http.getResponse<Response & { err?: Error }>();
    const requestId =
      RequestContext.get()?.requestId ?? (typeof req.id === 'string' ? req.id : 'unknown');
    const mapped = mapError(exception, requestId);
    if (mapped.unexpected) {
      // pino-http picks res.err up and logs the stack with the request (logs/api/api-error.*).
      res.err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        { err: exception, requestId, method: req.method, url: req.originalUrl },
        'Unhandled error while processing request',
      );
    }
    if (res.headersSent) return;
    const retryAfter = mapped.body.error.details?.['retryAfterSeconds'];
    if (mapped.status === 429 && typeof retryAfter === 'number')
      res.setHeader('Retry-After', String(retryAfter));
    res.status(mapped.status).json(mapped.body);
  }
}
