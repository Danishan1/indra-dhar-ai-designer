import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { resolveRequestId } from '../logging/logger-options.js';

import { ANONYMOUS, RequestContext } from './request-context.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Opens the AsyncLocalStorage scope for the request and shares one request id with pino-http. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const withId = req as Request & { id?: unknown };
    const requestId =
      typeof withId.id === 'string' ? withId.id : resolveRequestId(req.headers['x-request-id']);
    const inboundCorrelation = req.headers['x-correlation-id'];
    const correlationId =
      typeof inboundCorrelation === 'string' && UUID_RE.test(inboundCorrelation)
        ? inboundCorrelation.toLowerCase()
        : requestId;
    withId.id = requestId;
    if (!res.getHeader('X-Request-Id')) res.setHeader('X-Request-Id', requestId);
    RequestContext.run(
      { requestId, correlationId, principal: { ...ANONYMOUS }, organizationId: null },
      () => next(),
    );
  }
}
