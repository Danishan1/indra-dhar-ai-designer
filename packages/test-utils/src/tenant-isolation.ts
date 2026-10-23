import type { TestClient } from './http-client.js';
import { pathParams, type RouteInfo } from './route-inventory.js';

export interface IsolationFailure {
  route: string;
  status: number | 'unmapped';
  detail: string;
}

/**
 * Horizontal-escalation check (TR-SEC-010/012, AC-SEC-002): calls every route with a signed-in
 * user of tenant B while filling path parameters with tenant A's ids. Every call must answer 404
 * (never 2xx, and never 403 — which would confirm the resource exists).
 *
 * New routes are covered automatically; a route whose parameter has no fixture value is reported
 * as `unmapped`, so adding a route only needs one more entry in `params` (docs/architecture/authorization.md).
 */
export async function checkTenantIsolation(options: {
  routes: readonly RouteInfo[];
  /** Signed-in client of the other tenant. */
  attacker: TestClient;
  /** Victim tenant's ids by parameter name, e.g. { orgId, membershipId, invitationId }. */
  params: Readonly<Record<string, string>>;
  /** Minimal valid bodies by `METHOD path` so validation does not answer before authorization. */
  bodies?: Readonly<Record<string, unknown>>;
  expectedStatus?: number;
}): Promise<IsolationFailure[]> {
  const expected = options.expectedStatus ?? 404;
  const failures: IsolationFailure[] = [];
  for (const route of options.routes) {
    const names = pathParams(route.path);
    if (!names.length) continue;
    const label = `${route.method} ${route.path}`;
    const missing = names.filter((n) => !options.params[n]);
    if (missing.length) {
      failures.push({
        route: label,
        status: 'unmapped',
        detail: `no fixture for ${missing.join(', ')}`,
      });
      continue;
    }
    const url = route.path.replace(/:(\w+)/g, (_, n: string) => options.params[n] ?? '');
    const body = options.bodies?.[label];
    const res = await options.attacker.request(
      route.method,
      url,
      body ?? (route.method === 'GET' ? undefined : {}),
    );
    if (res.status !== expected) {
      failures.push({ route: label, status: res.status, detail: (await res.text()).slice(0, 200) });
    }
  }
  return failures;
}
