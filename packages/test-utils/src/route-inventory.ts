import { type INestApplicationContext, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, ModulesContainer } from '@nestjs/core';

export interface RouteInfo {
  /** `GET`, `POST`, … */
  method: string;
  /** Full path with Nest-style params, e.g. `/v1/orgs/:orgId/members`. */
  path: string;
  controller: string;
  handler: string;
  /** Metadata stored under `metadataKey` on the handler, else on the controller. */
  metadata: unknown;
}

const join = (...parts: string[]) =>
  `/${parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/')}`;

/**
 * Enumerates every HTTP route of a running Nest application via the DiscoveryService (TR-SEC-022).
 * Used by the route-declaration test and the cross-tenant isolation suite.
 */
export function listRoutes(
  app: INestApplicationContext,
  options: { metadataKey: string; prefix?: string },
): RouteInfo[] {
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as object | undefined;
    const type = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
    if (!instance || !type) continue;
    const base = (Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined) ?? '';
    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
      if (method === undefined || sub === undefined) continue;
      routes.push({
        method: RequestMethod[method],
        path: join(
          options.prefix ?? '',
          Array.isArray(base) ? (base[0] ?? '') : base,
          Array.isArray(sub) ? (sub[0] ?? '') : sub,
        ),
        controller: type.name,
        handler: name,
        metadata:
          Reflect.getMetadata(options.metadataKey, handler) ??
          Reflect.getMetadata(options.metadataKey, type),
      });
    }
  }
  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

/** Path parameter names of a route (`/orgs/:orgId/members/:membershipId` → orgId, membershipId). */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:(\w+)/g)].map((m) => m[1] ?? '');
}
