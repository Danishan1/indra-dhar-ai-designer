import { errorEnvelopeSchema, ErrorHttpStatus, type ErrorCode } from '@ai-designer/contracts';
import { type DynamicModule, RequestMethod, type Type } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { z } from 'zod';

import { AUTH_METADATA, AUTHZ_METADATA, type AuthzDeclaration } from '../authz/decorators.js';
import { IDEMPOTENT_METADATA } from '../idempotency/idempotent.decorator.js';
import { ENDPOINT_METADATA, type EndpointSpec } from '../validation/endpoint.js';

type JsonSchema = Record<string, unknown>;
type ModuleLike = Type | DynamicModule | Promise<DynamicModule>;

const METHOD_NAMES: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

/** Walks a module tree (static reflection only — no DI, no connections) collecting controllers. */
export function collectControllers(root: ModuleLike): Type[] {
  const seen = new Set<unknown>();
  const out: Type[] = [];
  const visit = (mod: ModuleLike | undefined): void => {
    if (!mod || mod instanceof Promise || seen.has(mod)) return;
    seen.add(mod);
    const isDynamic = typeof mod === 'object' && 'module' in mod;
    const cls = isDynamic ? mod.module : mod;
    const controllers = [
      ...((Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, cls) as Type[] | undefined) ?? []),
      ...(isDynamic ? ((mod.controllers ?? []) as Type[]) : []),
    ];
    for (const c of controllers) if (!out.includes(c)) out.push(c);
    const imports = [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, cls) as ModuleLike[] | undefined) ?? []),
      ...(isDynamic ? ((mod.imports ?? []) as ModuleLike[]) : []),
    ];
    imports.forEach(visit);
  };
  visit(root);
  return out;
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? `{${seg.slice(1)}}` : seg))
    .join('/');
  return `/${joined}`;
}

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
    target: 'draft-2020-12',
  }) as JsonSchema;
  return rest;
}

function objectParams(schema: z.ZodType | undefined, location: 'path' | 'query'): JsonSchema[] {
  if (!schema) return [];
  const json = toSchema(schema, 'input') as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, s]) => ({
    name,
    in: location,
    required: location === 'path' || (json.required ?? []).includes(name),
    schema: s,
  }));
}

export interface OpenApiOptions {
  version: string;
  includeInternal?: boolean;
  /** Global route prefix (main.ts: app.setGlobalPrefix('v1')). */
  prefix?: string;
}

/**
 * Builds an OpenAPI 3.1 document from `@Endpoint` metadata (zod → JSON Schema). Routes without
 * `@Endpoint` are still listed (so nothing is silently undocumented) but flagged `x-undocumented`.
 */
export function buildOpenApiDocument(controllers: Type[], options: OpenApiOptions): JsonSchema {
  const prefix = options.prefix ?? 'v1';
  const paths: Record<string, Record<string, JsonSchema>> = {};
  const tags = new Set<string>();

  for (const controller of controllers) {
    const base =
      (Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined) ?? '';
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || sub === undefined) continue;
      const httpMethod = METHOD_NAMES[method];
      if (!httpMethod) continue;
      const spec = Reflect.getMetadata(ENDPOINT_METADATA, handler) as EndpointSpec | undefined;
      if (spec?.internal && !options.includeInternal) continue;

      const path = joinPath(
        prefix,
        Array.isArray(base) ? (base[0] ?? '') : base,
        Array.isArray(sub) ? (sub[0] ?? '') : sub,
      );
      const success =
        spec?.successStatus ??
        (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ??
        (method === RequestMethod.POST ? 201 : 200);
      const idempotent =
        spec?.idempotent ?? Reflect.getMetadata(IDEMPOTENT_METADATA, handler) === true;
      const authz = (Reflect.getMetadata(AUTHZ_METADATA, handler) ??
        Reflect.getMetadata(AUTHZ_METADATA, controller)) as AuthzDeclaration | undefined;
      const requiresSession =
        (Reflect.getMetadata(AUTH_METADATA, handler) ??
          Reflect.getMetadata(AUTH_METADATA, controller)) === 'session';

      const parameters: JsonSchema[] = [
        ...objectParams(spec?.params, 'path'),
        ...objectParams(spec?.query, 'query'),
      ];
      if (!spec?.params) {
        for (const m of path.matchAll(/\{(\w+)\}/g))
          parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
      }
      if (idempotent) {
        parameters.push({
          name: 'Idempotency-Key',
          in: 'header',
          required: false,
          description: 'Retry-safe key; the first successful response is replayed for 24h.',
          schema: { type: 'string', minLength: 1, maxLength: 255 },
        });
      }

      const errorCodes = new Set<ErrorCode>([
        'VALIDATION_FAILED',
        'INTERNAL_ERROR',
        ...(spec?.errors ?? []),
      ]);
      if (idempotent) errorCodes.add('IDEMPOTENCY_CONFLICT');
      if (requiresSession) errorCodes.add('UNAUTHENTICATED');
      const errorsByStatus = new Map<number, ErrorCode[]>();
      for (const code of errorCodes) {
        const status = ErrorHttpStatus[code];
        errorsByStatus.set(status, [...(errorsByStatus.get(status) ?? []), code]);
      }

      const responses: Record<string, JsonSchema> = {
        [String(success)]: spec?.response
          ? {
              description: 'Success',
              content: { 'application/json': { schema: toSchema(spec.response, 'output') } },
            }
          : { description: 'Success' },
      };
      for (const [status, codes] of [...errorsByStatus.entries()].sort(([a], [b]) => a - b)) {
        responses[String(status)] = {
          description: `Error: ${codes.sort().join(', ')}`,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } },
          },
        };
      }

      spec?.tags?.forEach((t) => tags.add(t));
      const operation: JsonSchema = {
        operationId: `${controller.name.replace(/Controller$/, '')}_${name}`,
        summary: spec?.summary ?? name,
        ...(spec?.description ? { description: spec.description } : {}),
        ...(spec?.tags?.length ? { tags: spec.tags } : {}),
        ...(parameters.length ? { parameters } : {}),
        ...(spec?.body
          ? {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: toSchema(spec.body, 'input') } },
              },
            }
          : {}),
        responses,
        ...(requiresSession ? { security: [{ sessionCookie: [] }] } : {}),
        // Authorization declared on the route (docs/architecture/authorization.md).
        ...(authz ? { 'x-authorization': authz.kind } : {}),
        ...(authz?.kind === 'permission' ? { 'x-required-permission': authz.permission } : {}),
        ...(spec ? {} : { 'x-undocumented': true }),
      };
      paths[path] = { ...(paths[path] ?? {}), [httpMethod]: operation };
    }
  }

  const sortedPaths = Object.fromEntries(
    Object.keys(paths)
      .sort()
      .map((p) => [
        p,
        Object.fromEntries(Object.entries(paths[p] ?? {}).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );

  return {
    openapi: '3.1.0',
    info: { title: 'AI Designer API', version: options.version },
    servers: [{ url: 'http://localhost:4000' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths: sortedPaths,
    components: {
      schemas: { ErrorEnvelope: toSchema(errorEnvelopeSchema, 'output') },
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: '__Host-aid_session',
          description:
            'Opaque session cookie set by POST /v1/auth/login (aid_session when AUTH_COOKIE_SECURE=false).',
        },
      },
    },
  };
}
