import { listRoutes, pathParams, type RouteInfo } from '@ai-designer/test-utils';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AUTHZ_METADATA, type AuthzDeclaration } from '../../src/platform/authz/decorators.js';
import { ResourceResolverRegistry } from '../../src/platform/authz/resource-resolvers.js';
import { startTestApp } from '../integration/app-factory.js';

/**
 * TR-SEC-022 / AC1: every route declares its authorization, public routes are a reviewed list, and
 * every resource id in an org-scoped path is tenant-checked by the PEP.
 */
describe('route authorization declarations', () => {
  let app: INestApplication;
  let routes: RouteInfo[];

  beforeAll(async () => {
    ({ app } = await startTestApp());
    routes = listRoutes(app, { metadataKey: AUTHZ_METADATA, prefix: '/v1' });
  });

  afterAll(async () => {
    await app.close();
  });

  const decl = (r: RouteInfo) => r.metadata as AuthzDeclaration | undefined;
  const label = (r: RouteInfo) => `${r.method} ${r.path}`;

  it('finds the application routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('every route declares @Public, @AuthenticatedOnly, @RequireMembership or @RequirePermission', () => {
    expect(routes.filter((r) => !decl(r)).map(label)).toEqual([]);
  });

  it('public routes are exactly the reviewed list (add new ones here deliberately)', () => {
    const publicRoutes = routes.filter((r) => decl(r)?.kind === 'public').map(label);
    expect(publicRoutes).toEqual([
      'POST /v1/_dev/echo-idempotent',
      'GET /v1/_dev/jobs/:jobId',
      'POST /v1/auth/login',
      'POST /v1/auth/logout',
      'POST /v1/auth/mfa/verify',
      'POST /v1/auth/password/forgot',
      'POST /v1/auth/password/reset',
      'POST /v1/auth/register',
      'POST /v1/auth/resend-verification',
      'POST /v1/auth/verify-email',
      'GET /v1/health',
      'GET /v1/health/ready',
      'POST /v1/invitations/preview',
      'GET /v1/openapi.json',
    ]);
  });

  it('org-scoped routes are tenant-checked: :orgId needs membership; other ids name a resolver', () => {
    const resolvers = app.get(ResourceResolverRegistry).types();
    const problems: string[] = [];
    for (const r of routes) {
      const d = decl(r);
      const params = pathParams(r.path);
      if (!d || d.kind === 'public' || r.path.startsWith('/v1/_dev')) continue;
      if (params.includes('orgId') && d.kind === 'authenticated')
        problems.push(`${label(r)}: org route without membership check`);
      const others = params.filter((p) => p !== 'orgId');
      if (others.length && (d.kind === 'member' || d.kind === 'permission')) {
        const covered = d.resource?.param;
        for (const p of others)
          if (p !== covered) problems.push(`${label(r)}: :${p} not tenant-checked`);
      }
      // `/v1/me/*` resources belong to the signed-in user; handlers filter by currentUserId().
      if (others.length && d.kind === 'authenticated' && !r.path.startsWith('/v1/me/'))
        problems.push(`${label(r)}: resource id without tenant check`);
      if (
        (d.kind === 'member' || d.kind === 'permission') &&
        d.resource &&
        !resolvers.includes(d.resource.type)
      )
        problems.push(`${label(r)}: no resolver for "${d.resource.type}"`);
    }
    expect(problems).toEqual([]);
  });
});
