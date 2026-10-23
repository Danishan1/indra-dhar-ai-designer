import type { ErrorCode } from '@ai-designer/contracts';
import {
  type ArgumentMetadata,
  applyDecorators,
  Injectable,
  type PipeTransform,
  SetMetadata,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';

export const ENDPOINT_METADATA = 'aid:endpoint';

/**
 * Declarative endpoint contract (ADR-002): zod schemas from packages/contracts validate the request
 * and generate the OpenAPI document (`/v1/openapi.json`, `docs/api/openapi.json`).
 *
 * ```ts
 * @Post()
 * @Endpoint({ summary: 'Create project', tags: ['projects'], body: createProjectSchema,
 *             response: projectSchema, successStatus: 201, errors: ['CONFLICT'] })
 * create(@Body() body: CreateProject) { … }
 * ```
 * Authorization is declared separately with `@Public()` / `@AuthenticatedOnly()` /
 * `@RequirePermission()` (docs/architecture/authorization.md).
 */
export interface EndpointSpec {
  summary: string;
  description?: string;
  tags?: string[];
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
  response?: z.ZodType;
  /** Defaults to 201 for POST, 200 otherwise (keep in sync with @HttpCode). */
  successStatus?: number;
  /** Business error codes this endpoint can return (VALIDATION_FAILED/INTERNAL_ERROR are implied). */
  errors?: ErrorCode[];
  /** Supports the `Idempotency-Key` header (set automatically by @Idempotent()). */
  idempotent?: boolean;
  /** Excluded from the public OpenAPI document (dev-only routes). */
  internal?: boolean;
}

/** Validates @Body() / @Query() / @Param() against the endpoint's zod schemas. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly spec: EndpointSpec) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema =
      metadata.type === 'body'
        ? this.spec.body
        : metadata.type === 'query'
          ? this.spec.query
          : metadata.type === 'param'
            ? this.spec.params
            : undefined;
    if (!schema) return value;
    if (metadata.data) {
      // @Param('id') / @Query('cursor'): validate the single field from the object schema.
      const field =
        schema instanceof z.ZodObject
          ? (schema.shape as Record<string, z.ZodType>)[metadata.data]
          : undefined;
      return field ? field.parse(value) : value;
    }
    return schema.parse(value ?? {});
  }
}

export function Endpoint(spec: EndpointSpec): MethodDecorator {
  return applyDecorators(
    SetMetadata(ENDPOINT_METADATA, spec),
    UsePipes(new ZodValidationPipe(spec)),
  );
}
