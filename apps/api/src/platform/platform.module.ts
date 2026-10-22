import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AuditService } from './audit/audit.service.js';
import { CsrfMiddleware } from './auth/csrf.middleware.js';
import { AuthenticatedGuard } from './auth/require-auth.js';
import { RequestContextMiddleware } from './context/request-context.middleware.js';
import { AllExceptionsFilter } from './errors/all-exceptions.filter.js';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor.js';
import { IdSequenceService } from './ids/id-sequence.service.js';
import { JobService } from './jobs/job.service.js';
import { OutboxService } from './outbox/outbox.service.js';

/**
 * Platform primitives available to every module (docs/architecture/platform-primitives.md):
 * request context, error envelope, display ids, audit, outbox, idempotency, durable jobs.
 */
@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    IdSequenceService,
    AuditService,
    OutboxService,
    JobService,
    IdempotencyInterceptor,
    AuthenticatedGuard,
  ],
  exports: [
    IdSequenceService,
    AuditService,
    OutboxService,
    JobService,
    IdempotencyInterceptor,
    AuthenticatedGuard,
  ],
})
export class PlatformModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware, CsrfMiddleware).forRoutes('*path');
  }
}
