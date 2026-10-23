import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../authz/decorators.js';
import { Endpoint } from '../validation/endpoint.js';

export const OPENAPI_DOCUMENT = Symbol('OPENAPI_DOCUMENT');

/** Serves the generated OpenAPI document (non-production; the committed copy is docs/api/openapi.json). */
@Controller()
@Public()
export class OpenApiController {
  constructor(@Inject(OPENAPI_DOCUMENT) private readonly document: () => Record<string, unknown>) {}

  @Get('openapi.json')
  @Endpoint({ summary: 'OpenAPI document', tags: ['meta'], internal: true })
  get(): Record<string, unknown> {
    return this.document();
  }
}
