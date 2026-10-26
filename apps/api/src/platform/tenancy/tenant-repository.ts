import { RequestContext } from '../context/request-context.js';
import { AppError } from '../errors/app-error.js';

/**
 * Tenant scoping helpers (ADR-004): every query on a tenant table filters by the organization that
 * the AuthorizationGuard verified for this request — never by an id taken from the client.
 *
 * ```ts
 * const widget = await prisma.widget.findFirst({ where: tenantWhere({ id: widgetId }) });
 * if (!widget) throw AppError.notFound('Widget'); // also for other tenants' ids
 * ```
 * Tests: add the route to the cross-tenant isolation suite (docs/architecture/authorization.md).
 */
export function currentTenantId(): string {
  const organizationId = RequestContext.get()?.organizationId;
  if (!organizationId)
    throw new AppError('INTERNAL_ERROR', 'No verified organization in the request context');
  return organizationId;
}

/** Adds `organizationId` (from the verified request context) to a Prisma `where`. */
export function tenantWhere<W extends object>(where: W): W & { organizationId: string } {
  return { ...where, organizationId: currentTenantId() };
}

/** Adds `organizationId` to `data` for creates. */
export function tenantData<D extends object>(data: D): D & { organizationId: string } {
  return { ...data, organizationId: currentTenantId() };
}

/** Throws 404 unless `record` exists and belongs to the current tenant (for loaded records). */
export function assertInTenant<T extends { organizationId: string }>(
  record: T | null | undefined,
  label: string,
): T {
  if (!record || record.organizationId !== currentTenantId()) throw AppError.notFound(label);
  return record;
}
