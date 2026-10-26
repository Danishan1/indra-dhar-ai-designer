# Authorization (I07)

How access is decided and enforced in the API. Read this before adding an endpoint. Decisions:
ADR-004 (tenancy), ADR-033 (catalog governance), ADR-041 (org context, invitations), ADR-042
(engine mechanics). Spec: SPEC-009 §5, §11, §18, §22–23.

## In one paragraph

Every route declares its authorization with a decorator. A **global guard** (PEP,
`platform/authz/authorization.guard.ts`) denies routes without a declaration, checks the session,
and for organization routes asks the **PDP** (`modules/authorization/authorization.service.ts`):
_is this user an active member of this organization, does the resource in the path belong to it,
and do their roles (or a resource grant) include the permission?_ The answer is `allow`/`deny` with
a machine-readable reason code; any error is a deny (**fail closed**). Permissions are
`<resource>.<action>` keys in `packages/contracts/src/permissions.ts`; baseline roles map to them in
`packages/contracts/src/roles.ts`. The organization comes from the path (`:orgId`) or from the
resource's own record — never from a header or a body.

## Protect a route

```ts
@Controller('orgs/:orgId/projects')
export class ProjectsController {
  @Get()
  @RequirePermission('project.view')
  list(@Req() req: Request) {
    const ctx = authzContext(req); // { organizationId, membershipId, userId, roles, permissions }
    …
  }

  @Patch(':projectId')
  @RequirePermission('project.edit', { resource: { type: 'project', param: 'projectId' } })
  update(…) { … }
}
```

| Decorator                                | Who passes                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `@Public()`                              | everyone (keep the list short — the route-declaration test pins it)                 |
| `@AuthenticatedOnly()`                   | any signed-in user, no organization (e.g. `/v1/me`, create organization)            |
| `@RequireMembership({ resource? })`      | any active member; the handler applies a finer rule (e.g. "self or `members.view`") |
| `@RequirePermission(key, { resource? })` | active member holding `key` from a role, or from an active grant on `resource`      |

Rules (enforced by `test/security/route-declarations.int.test.ts`):

- Every route has exactly one of the decorators above (class-level is fine; method-level overrides).
- A route with `:orgId` must use `RequireMembership`/`RequirePermission`.
- **Every other id in an org-scoped path must be the declared `resource`** — that is what makes the
  PEP verify the id belongs to the organization (404 otherwise). For routes without `:orgId`
  (e.g. `/v1/projects/:projectId`), the organization is taken from the resource itself.
- `currentUserId()` (`platform/authz/principal.ts`) gives the signed-in user id on any non-public route.

Responses: anonymous → 401; not a member, revoked, unknown org, or a resource of another tenant →
**404** (`"<Label> not found"`, never revealing existence); suspended member → 403
(`reason: membership_suspended`); missing permission → 403 (`reason: missing_permission`,
`permission: <key>`); PDP dependency failure → 503 `DEPENDENCY_UNAVAILABLE`.

## Assurance: MFA, step-up and session limits (I08, ADR-043)

After membership and permission checks the PDP applies the organization's security policy
(`security_policies`, versioned; `GET/PUT /v1/orgs/:orgId/security-policy`):

1. **Session limits** — `sessionIdleMinutes` / `sessionAbsoluteHours` can only tighten the platform
   timeouts; an older session gets 401 (`reason: session_policy_expired`) for that organization.
2. **`requireMfa`** — every request into the organization needs an MFA-verified session.
3. **Sensitive permissions** (`sensitive: true` in the catalog: member/role management, security
   policy, audit, billing, credentials, approvals, releases, ownership…) always need an
   MFA-verified session → 403 `MFA_REQUIRED` otherwise. Owners are not exempt (AC-SEC-005).
4. **Step-up** — permissions in `STEP_UP_PERMISSIONS` (ownership transfer, org export/delete,
   security policy, billing, credentials, tech-pack release) also need `step_up_at` within
   `stepUpMaxAgeMinutes` (default 10). The PDP returns an obligation; the guard answers 403
   `STEP_UP_REQUIRED` (`details.maxAgeMinutes`). The web client opens the step-up dialog
   (`features/security/step-up-provider.tsx`), calls `POST /v1/auth/step-up` and retries the request
   once (`setStepUpHandler` in `lib/api/client.ts`).

Policy reads are cached in-process for 30 s (cleared locally on change).

## Register a resource type

Each module that owns tenant resources registers a resolver in `onModuleInit` (see
`modules/organizations/membership-directory.service.ts`):

```ts
this.resolvers.register('project', {
  label: 'Project',
  organizationOf: async (id) =>
    (await this.prisma.project.findUnique({ where: { id }, select: { organizationId: true } }))
      ?.organizationId ?? null,
});
```

Select only `organization_id`. An unregistered type makes every decision on it fail closed.

## Add a permission

1. Add the key to `PERMISSION_CATALOG` (never rename or reuse a key; mark `sensitive` when denials
   should be audited / step-up may apply).
2. Map it to baseline roles in `roles.ts` following the matrix reading below. The contracts test
   fails if a key is held by no role (ADR-033).
3. Nothing else: the API mirrors catalog + roles into `permissions`, `roles`, `role_permissions`
   at start (`syncAuthorizationCatalog`, also `pnpm db:seed`).

### How the SPEC-009 §23 matrix is read

| Matrix cell                                                         | In the default role?                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------- |
| Yes · Yes, if allowed · Yes, subject to quota · If entitled         | yes (quota/entitlement are plan checks, not permissions) |
| Limited · Billing scope                                             | yes, the narrow permission                               |
| Yes, if assigned · If assigned                                      | yes (assignment is a workflow rule)                      |
| Policy-limited — for Owner and Org Admin                            | yes (default security policy)                            |
| Policy-limited (others) · If granted · If permitted · No by default | no — give an extra role or a grant                       |

Consequences worth knowing: Owners and Admins do **not** approve designs, release tech packs, see
billing or manage provider credentials by default — they add the Approver / Billing admin /
Credential admin role (an Owner can give any role, including to themselves). Admins cannot edit
draft tech packs by default. External collaborators have no default permissions (grants only).

## Delegation (who can give which role)

- Assigning roles needs `members.manage_roles`; inviting needs `members.invite`.
- A role can be given **or removed** only if every permission in it is delegable by the actor:
  Owners can delegate every organization permission; everyone else only what they hold. So an
  Admin cannot make anyone Billing admin unless they are Billing admin too (AC-SEC-003).
- Members are only managed (suspend, remove, change roles) by someone who could have given all of
  their roles; Owners only by Owners.
- Owner is never assigned or removed by role management or invitations — only by ownership
  transfer, which keeps the last-owner rule.

## Resource grants

`ResourceGrantService.create/revoke` (module `authorization`) stores explicit shares
(`resource_grants`: resource, recipient, actions, grantor, expiry, revocation). The PDP consults them
after role permissions when the route declares a `resource`; expiry and revocation are checked on
every request. Sharing endpoints arrive with shareable resources (projects I10, tech packs I43) and
must require `<resource>.manage_access` themselves.

## Restricted resources (I10, ADR-045)

A resolver can implement `isRestricted(id)` (today only `project`, when `visibility = 'restricted'`). For a restricted resource the PDP ignores the role permission and requires an **active resource grant** for the action, unless the caller holds `<type>.manage_access`. Members without any grant get **404** (`RESOURCE_RESTRICTED`, indistinguishable from not found); a member with a grant for a different action gets 403. List endpoints must filter with `GrantsService.resourceIdsGrantedTo(...)` unless the caller manages access. See `docs/architecture/projects.md`.

**Children of restricted resources (I12, ADR-047).** A resolver may declare `governedBy(id)` (designs and revisions are governed by their project). The PDP then checks the parent exists in the same organization, applies the parent's restriction, and evaluates grants on the parent. A resolver may also declare `grantActionFor(permission)`: on projects, `design.view` is covered by a `project.view` grant and `design.create/edit/commit/restore` by `project.edit`; anything unmapped (approvals, AI generation, exports) can never come from a grant. Register new child types the same way — never re-implement restriction in a service.

**A second resource in the body.** When a request names another resource (e.g. the target project when duplicating a design), call `PolicyEnforcer.enforce(req, { organizationId, permission, resource, notFoundLabel })` from the service. It applies exactly the guard's rules, errors (404/403/MFA/step-up) and denial audit.

## Caching and revocation latency

The PDP caches each membership (status + role ids) in Redis for **30 s**
(`aid:authz:m:<org>:<user>`). Every change made through the API — suspend, reactivate, revoke,
role change, ownership transfer — deletes the key right after commit, so it applies on the next
request on every API instance; the worker deletes it again when the outbox event arrives. The TTL
bounds staleness if both fail (NFR-SEC-007 ≤ 60 s). Redis trouble never decides anything: reads
fall back to Postgres. Role → permission mappings are reloaded from `role_permissions` at most
every 60 s.

## Tenant-scoped data access

- Query tenant tables with the verified organization: `tenantWhere({ id })`,
  `tenantData({...})`, `assertInTenant(record, 'Project')` (`platform/tenancy/tenant-repository.ts`).
- Prisma models are only touched by their owning module (`table-ownership.test.ts` lists owners —
  add new models there).

## Testing a new route

1. **Declaration** — automatic (route-declaration test).
2. **Cross-tenant isolation** — automatic: `test/security/tenant-isolation.int.test.ts` calls every
   org-scoped route as Org B with Org A's ids and expects 404. A new path parameter shows up as
   `unmapped`: add its fixture id to `paramsFor` (and a body in `BODIES` if validation would reject
   `{}`). Fixtures: `createTenant()` from `@ai-designer/test-utils`.
3. **Vertical escalation** — add the role cases that matter to `privilege-escalation.int.test.ts`
   (a role without the permission gets 403).

## Web

`useOrganization().can(key)`, `usePermission(key)` and `<Can permission=…>`
(`features/authorization/can.tsx`) read `GET /v1/me/permissions?orgId=` to hide or disable UI.
Purely cosmetic — the API decides.
