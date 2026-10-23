/**
 * Redis key of the PDP's short-TTL membership cache (shared by the API, which fills and
 * invalidates it, and the worker, which invalidates it again when membership events arrive).
 */
export function accessCacheKey(organizationId: string, userId: string): string {
  return `aid:authz:m:${organizationId}:${userId}`;
}
