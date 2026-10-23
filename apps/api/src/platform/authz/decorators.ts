import type { PermissionKey } from '@ai-designer/contracts';
import { applyDecorators, SetMetadata } from '@nestjs/common';

/** Route authorization declaration read by the global AuthorizationGuard (deny by default). */
export type AuthzDeclaration =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'member'; resource?: ResourceRef }
  | { kind: 'permission'; permission: PermissionKey; resource?: ResourceRef };

/** A path parameter naming a tenant-owned resource whose organization must match the request's. */
export interface ResourceRef {
  /** Resource type registered in the ResourceResolverRegistry (e.g. `membership`, `project`). */
  type: string;
  /** Route parameter holding the resource id. */
  param: string;
}

export const AUTHZ_METADATA = 'aid:authz';
/** Kept for the OpenAPI builder: `'session'` marks routes that need the session cookie. */
export const AUTH_METADATA = 'aid:auth';

const declare = (decl: AuthzDeclaration, session: boolean) =>
  applyDecorators(
    SetMetadata(AUTHZ_METADATA, decl),
    ...(session ? [SetMetadata(AUTH_METADATA, 'session')] : []),
  );

/** Anyone, signed in or not (health, sign-in, invitation preview…). Keep the list short. */
export function Public(): MethodDecorator & ClassDecorator {
  return declare({ kind: 'public' }, false);
}

/** Any signed-in user; no organization context (e.g. `/v1/me`, creating an organization). */
export function AuthenticatedOnly(): MethodDecorator & ClassDecorator {
  return declare({ kind: 'authenticated' }, true);
}

/**
 * Any active member of the request's organization (`:orgId` or the resource's organization). Use
 * only when the handler applies its own finer rule (e.g. "self, or `members.view`").
 */
export function RequireMembership(
  options: { resource?: ResourceRef } = {},
): MethodDecorator & ClassDecorator {
  return declare(
    { kind: 'member', ...(options.resource ? { resource: options.resource } : {}) },
    true,
  );
}

/**
 * The caller must hold `permission` in the request's organization (from its roles or, for a
 * resource, a grant). With `resource`, the resource must belong to that organization (404 if not).
 */
export function RequirePermission(
  permission: PermissionKey,
  options: { resource?: ResourceRef } = {},
): MethodDecorator & ClassDecorator {
  return declare(
    { kind: 'permission', permission, ...(options.resource ? { resource: options.resource } : {}) },
    true,
  );
}
