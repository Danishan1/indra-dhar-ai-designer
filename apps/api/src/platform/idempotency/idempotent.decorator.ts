import { applyDecorators, SetMetadata, UseInterceptors } from '@nestjs/common';

import { IdempotencyInterceptor } from './idempotency.interceptor.js';

export const IDEMPOTENT_METADATA = 'aid:idempotent';

/** Enables `Idempotency-Key` handling for a mutation endpoint (documented in OpenAPI). */
export function Idempotent(): MethodDecorator {
  return applyDecorators(
    SetMetadata(IDEMPOTENT_METADATA, true),
    UseInterceptors(IdempotencyInterceptor),
  );
}
