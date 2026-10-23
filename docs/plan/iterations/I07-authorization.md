# I07 — Authorization engine & tenant isolation

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase                           | 1 — Identity, organizations & access                                                                                                                                                                                                                                                                                                                                     |
| Subsystems                      | SS-01 Identity & Access (authorization module), SS-17 (audit of denials/role changes)                                                                                                                                                                                                                                                                                    |
| Depends on                      | I06                                                                                                                                                                                                                                                                                                                                                                      |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                                                                                      |
| Spec references                 | `docs/init/09-specification.md` §5 (deny by default, fail closed), §11 (FR-SEC-084…105), §12.1–12.4 (resource rules), §18 (FR-SEC-216…220), §22 (decision contract FR-SEC-239…243), §23 (authorization matrix), §25 (threat scenarios), §26.2 (TR-SEC-010…022), §27 (AC-SEC-001…016); `docs/init/01-overview.md` FR-013, FR-014; `docs/plan/01-architecture.md` §4.1–4.2 |
| Open decisions to resolve first | ADR-004 (tenancy enforcement in repositories + tests; RLS evaluated later) — confirm                                                                                                                                                                                                                                                                                     |

## 1. Goal

Every protected operation is authorized server-side by one consistent engine: a central permission catalog, baseline roles, a Policy Decision Point returning allow/deny with reason codes, a Policy Enforcement Point (decorator + guard) that **must** be declared on every route, tenant-scoped repository helpers, and an automated cross-tenant isolation harness that all later iterations extend. Milestone **M2** depends on this.

## 2. Scope

### In scope

- **Permission catalog** `packages/contracts/src/permissions.ts`: typed constant list `<resource>.<action>` with descriptions and resource types, covering at least: `organization.view|update|transfer_ownership|delete|export`, `members.view|invite|manage|manage_roles`, `roles.view|manage`, `project.view|create|edit|archive|delete|manage_access`, `design.view|edit|commit|generate|submit_review|approve|restore`, `artifact.view|use|create|edit|publish|delete`, `asset.view|upload|delete`, `operation.submit|view`, `job.view|cancel`, `validation.view|run|override`, `techpack.view|edit|submit_review|approve|release|withdraw|export|distribute`, `billing.view|manage`, `usage.view`, `budget.manage`, `credentials.view|manage`, `audit.view`, `security_policy.manage`, `notifications.manage`, `api_tokens.manage`, `platform.*` (operator-only, separate scope). Stable IDs (FR-SEC-084, 085; NFR-SEC-013).
- **Baseline roles** (SPEC-009 §11.3) seeded as system roles: Organization Owner, Organization Admin, Design Lead, Designer, Merchandiser, Production/Technical User, Approver, Billing Admin, Credential Admin, Viewer, Supplier/External Collaborator; Platform Operator kept out of org roles (FR-SEC-186). Role→permission mapping implements the §23 matrix ("Yes/No/If granted/Policy-limited" interpreted as documented in a mapping table in the seed file).
- **Role assignment** APIs with delegation rule: a user can assign only roles whose permissions ⊆ their own delegable permissions (FR-SEC-076, 088, 089); scoped to org (FR-SEC-087, 090).
- **Effective permissions** view per membership (FR-SEC-093).
- **ResourceGrant** model + PDP support (grants evaluated after role permissions; expiry/revocation honored) — API to create grants arrives with resources that need sharing (projects in I10, tech packs in I43) (FR-SEC-094…100).
- **PDP**: `AuthorizationService.authorize(ctx, action, resource?) → { decision: 'allow'|'deny', reasonCode, policyVersion, obligations[] }`; reason codes: `NOT_AUTHENTICATED`, `ACCOUNT_INACTIVE`, `NO_MEMBERSHIP`, `MEMBERSHIP_INACTIVE`, `MISSING_PERMISSION`, `RESOURCE_NOT_IN_TENANT`, `RESOURCE_STATE_FORBIDS`, `SOD_VIOLATION`, `STEP_UP_REQUIRED`, `POLICY_UNAVAILABLE`. Any exception → deny (fail closed, FR-SEC-239, NFR-SEC-004).
- **PEP**: `@RequirePermission(action, { resource?, idParam? })`, `@Public()`, `@AuthenticatedOnly()`; global guard; resource loader hook verifies the resource's `organization_id` equals ctx org before permission check; obligations (step-up, SoD) enforced (FR-SEC-243).
- **Route declaration test**: enumerates Nest routes via `DiscoveryService`; fails if any handler lacks one of the decorators (TR-SEC-022).
- **Tenant-scoped repository pattern**: `TenantRepository` base/helpers (`scoped(ctx).findUnique…` adding `organizationId`), plus a Prisma extension/lint that flags raw `prisma.<tenantModel>` access outside repositories.
- **Cross-tenant test harness** in `packages/test-utils`: fixtures create Org A/Org B with users per role; `expectTenantIsolation(routeSpec)` helper hits each resource endpoint with Org B's identity and Org A's ids (and vice versa) expecting 404; parameterized over all registered routes with path params (TR-SEC-010, 011, 012).
- **Authorization caching**: per-request memoization + short TTL membership/role cache invalidated by outbox events (`MembershipChanged`, `RoleAssignmentChanged`); documented revocation latency ≤60s, immediate for high-risk ops (NFR-SEC-006…009).
- Audit: role changes, grant changes, denials of sensitive actions (FR-SEC-178 context, §15.1).
- Web: Roles column & role editor on Members page; effective-permissions drawer; `usePermission()` hook to hide/disable UI (cosmetic only).
- Update earlier endpoints (I05/I06) with explicit decorators.

### Out of scope (deferred to)

- Custom roles UI (→ backlog; catalog supports it, FR-SEC-092)
- Step-up authentication mechanics (→ I08; obligation plumbing exists here)
- Separation-of-duty policies for approvals (→ I28/I43; reason code reserved)
- Postgres RLS defence-in-depth (→ I47 evaluation)

## 3. Deliverables

- `packages/contracts/src/permissions.ts`, `packages/contracts/src/roles.ts` (baseline role definitions)
- `apps/api/src/modules/authorization/` (`authorization.service.ts` PDP, `roles.controller.ts`, `grants.service.ts`, `effective-permissions.service.ts`, `repository.ts`)
- `apps/api/src/platform/authz/{require-permission.decorator.ts,public.decorator.ts,authorization.guard.ts,resource-resolvers.ts}`
- `apps/api/src/platform/tenancy/tenant-repository.ts`
- `packages/db/prisma/seed/platform/roles-permissions.ts` (idempotent)
- `packages/test-utils/src/{tenant-fixtures.ts,tenant-isolation.ts,route-inventory.ts}`
- `apps/api/test/security/{route-declarations.spec.ts,tenant-isolation.spec.ts,privilege-escalation.spec.ts}`
- `docs/architecture/authorization.md` (how to add a permission, protect a route, write the isolation test)

## 4. Data model changes

| Model            | Notes                                                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Permission`     | `key` unique, `resource_type`, `action`, `description`, `is_platform`                                                                                                             |
| `Role`           | `key`, `name`, `scope_type` (`organization`,`workspace`), `is_system_role`, `organization_id` nullable, `delegable`                                                               |
| `RolePermission` | (`role_id`,`permission_id`)                                                                                                                                                       |
| `MembershipRole` | (`membership_id`,`role_id`,`scope_id`), `granted_by`, `granted_at`                                                                                                                |
| `ResourceGrant`  | `organization_id`, `resource_type`, `resource_id`, `recipient_type` (`user`,`external`), `recipient_id`, `actions text[]`, `granted_by`, `expires_at`, `revoked_at`, `revoked_by` |
| `SecurityPolicy` | `organization_id`, `version`, `config jsonb` (created here with defaults; used by I08/I28)                                                                                        |

## 5. API / contracts

| Method & path                                                       | Permission                           | Purpose                                          |
| ------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| `GET /v1/permissions`                                               | authenticated                        | Catalog (for UI)                                 |
| `GET /v1/orgs/{orgId}/roles`                                        | `roles.view`                         | Roles + permissions                              |
| `PUT /v1/orgs/{orgId}/members/{membershipId}/roles`                 | `members.manage_roles`               | Replace role assignments (delegation-checked)    |
| `GET /v1/orgs/{orgId}/members/{membershipId}/effective-permissions` | `members.view` (self always allowed) | Effective permissions                            |
| `GET /v1/me/permissions?orgId=`                                     | authenticated                        | Current user's effective permissions (UI gating) |

Events: `RoleAssignmentChanged`, `ResourceGrantCreated`, `ResourceGrantRevoked`, `AuthorizationDenied` (audit only for sensitive actions).

## 6. UI

- Members page: role chips, edit-roles dialog listing only delegable roles.
- Effective-permissions drawer grouped by resource.
- `usePermission(action)` hook + `<Can action=…>` component (purely presentational, FR-SEC-134-style server enforcement remains authoritative).

## 7. Implementation tasks (ordered checklist)

1. [x] Write permission catalog + baseline roles + §23 mapping table (document interpretations of "If granted"/"Policy-limited": not in default role; grantable via additional role or grant).
2. [x] Models, migration, idempotent seed.
3. [x] PDP with reason codes, fail-closed wrapper, policy version constant.
4. [x] Decorators + global guard + resource resolvers (load resource org id by type: project, design, artifact, asset, job…; registry extended by later modules).
5. [x] Retrofit I05/I06 routes with decorators; add route-declaration test.
6. [x] Delegation-checked role assignment; last-owner rule retained.
7. [x] Tenant repository helpers; refactor organizations module to use them; add lint rule/check.
8. [x] Caching + invalidation on outbox events; revocation-latency test.
9. [x] Test-utils fixtures and isolation harness; security test suites.
10. [x] Web role management + permission hook.
11. [x] `docs/architecture/authorization.md`; update `PROGRESS.md`; tag `m2` only after I08.

## 8. Tests

- Unit: PDP decision table (role × action) generated from the §23 matrix; delegation subset logic; fail-closed when policy loader throws.
- Integration: every route declared (build-failing); horizontal escalation — Org B user with Org A ids gets 404 on all routes (TR-SEC-010, 012); vertical escalation — Viewer calling member-management/role endpoints gets 403 (TR-SEC-011); inviter cannot grant Billing Admin unless they hold it (AC-SEC-003); role change takes effect within target (NFR-SEC-007); grant expiry honored; client-supplied role/plan claims ignored (§25).
- E2E: admin changes a member to Viewer; member's UI loses edit actions and API rejects edits.

## 9. Acceptance criteria

- [x] AC1 — Every protected route declares a permission or `@Public`; CI/test fails otherwise (FR-SEC-085; TR-SEC-022).
- [x] AC2 — Changing a resource identifier cannot expose another tenant's resource (AC-SEC-002; FR-SEC-216).
- [x] AC3 — Users cannot assign permissions they cannot delegate; role grants cannot cross tenants (AC-SEC-003, AC-SEC-013).
- [x] AC4 — Authorization dependency failure denies the request (AC-SEC-009; NFR-SEC-004).
- [x] AC5 — Edit/generate permissions are distinct from approve/release; billing and credential administration are separate permissions (AC-SEC-006, AC-SEC-007 at catalog level).
- [x] AC6 — Role and grant changes are audited; denial reason codes are machine-readable but client responses do not leak resource existence (FR-SEC-240…242).
- [x] AC7 — Effective permissions are reviewable per member (FR-SEC-093).

## 10. Risks & notes

- **Cross-iteration (planning review):** the planned master list of permission keys (including keys introduced by later iterations) is in `03-domain-model.md` §4. Seed what exists now; each later iteration adds its own keys + role mappings to the catalog in the same change. Design the principal model so a non-member principal type (`external_supplier` guest, I43) and service identities/API tokens (I47) can be added without refactoring the PDP.
- This iteration's harness is reused by **every** later iteration — make adding a new route to the isolation suite a one-liner.
- Don't model permissions as UI concepts; keep resource-oriented IDs stable (FR-SEC-084).
- "Organization Owner does not override every safety control" (§23 note): SoD and step-up obligations still apply.
- Watch N+1 when resolving resources; resolver should select only `organization_id`.

## 11. Handoff

- Every later module: register resource resolver, add permissions to catalog (never rename), add isolation tests.
- I08 implements `STEP_UP_REQUIRED` obligations and MFA policy.
- I10/I43 add resource-grant creation endpoints for projects and tech packs.

## 12. Completion record

- Completed on: 2026-10-23
- Sessions used: 1 (estimate 2–3)
- Deviations from plan (ADR-042 unless noted):
  - File layout: the PEP lives in `platform/authz/` (`decorators.ts`, `authorization.guard.ts`, `authorizer.ts`, `resource-resolvers.ts`, `access-cache.ts`, `membership-directory.ts`, `principal.ts`); `@Public()` and the others are in one `decorators.ts`. The PDP is `modules/authorization/authorization.service.ts`; there is no `roles.controller.ts`/`repository.ts` — `authorization.controller.ts` serves the catalog, roles, effective and own permissions; role assignment is `PUT …/members/:id/roles` in the organizations module (it owns `membership_roles`). The seed function is `packages/db/src/platform/authorization-catalog.ts` (`syncAuthorizationCatalog`), run at API start and by `pnpm db:seed`.
  - Extra decorator `@RequireMembership()` for "self or `members.view`" style rules (effective permissions).
  - Route declaration test also enforces that every non-`orgId` id in an org path is the declared resource (tenant-checked by the PEP) and pins the list of public routes.
  - The "lint rule" for raw tenant-model access is a test (`platform/tenancy/table-ownership.test.ts`): models may only be accessed by their owning module.
  - Cache: Redis, 30 s TTL, invalidated synchronously by the API after commit **and** by a worker consumer on membership/role events (rather than only by outbox events).
  - Matrix interpretation (documented in `roles.ts` + `authorization.md`): Owner/Admin do not hold approve/release/billing/credential permissions by default; Owner can delegate every org permission. Admins may now manage other Admins (delegation rule) — previously (I06) they could not.
  - Ownership transfer keeps the new owner's other roles (I06 replaced them).
  - Obligations are part of the decision contract, but no policy emits them until I08; an `allow` with obligations is denied by the guard.
  - `ResourceGrant` creation/revocation service exists (audited, outbox events); no HTTP endpoints until I10/I43, as planned.
  - Denials of `sensitive` permissions are audited (`authorization.denied`), others only logged.
  - New package `packages/test-utils` (TestClient, `listRoutes`, `createTenant`, `checkTenantIsolation`); security suites live in `apps/api/test/security/` as `*.int.test.ts`.
- Verification:
  - `pnpm verify` green: contracts 32 (catalog naming, every key mapped, no platform keys in org roles, §23 decision table, delegation), api unit 71 (PDP decision table + fail-closed, table ownership), web 37, worker 7.
  - `pnpm test:integration`: api 63 incl. security 20 — route declarations (4); cross-tenant isolation over every org-scoped route both directions, mixed ids, ignored tenant hints (5); privilege escalation (11): viewer 403s, no self-escalation, Billing-admin delegation, owner only by transfer, no cross-tenant role grants, role change effective on the next request + audited + outbox, audited denials, effective permissions (self / members.view), ignored client role claims, grant allow/expiry/revocation, fail-closed 503. Worker 13 (cache invalidation consumer).
  - `pnpm e2e` 16/16 (new: owner demotes an admin to Viewer through the role editor; the viewer's UI loses member/settings actions and the API answers 403).
- Follow-ups added to backlog: custom roles UI, workspace-scoped roles, billing-scoped audit view, admin-delegable role policy, platform operators (I45), RLS (I47).
