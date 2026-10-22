# I06 — Organizations, memberships & invitations

| Field | Value |
|---|---|
| Phase | 1 — Identity, organizations & access |
| Subsystems | SS-01 Identity & Access (organizations module), SS-17 (audit) |
| Depends on | I05 |
| Estimated sessions | 2 |
| Spec references | `docs/init/09-specification.md` §10 (FR-SEC-060…083), §24.1 (invitation sequence), §21 (entities); `docs/init/01-overview.md` §3.1 (FR-012, FR-015); `docs/plan/05-decisions.md` ADR-017 |
| Open decisions to resolve first | ADR-017 (organization + optional workspace scope) — confirm |

## 1. Goal
Introduce organizations as tenant boundaries. A signed-in user can create an organization (becoming its owner), invite others by email with a proposed role, accept invitations, switch the active organization, and manage memberships (suspend/revoke) — with ownership continuity protection and full audit. After this iteration every request carries a validated `organizationId` + `membership` in `RequestContext`.

## 2. Scope
### In scope
- `Organization` (display id `ORG-…`, name, slug, status, settings), optional `Workspace` table (schema only + default workspace per org; UI deferred, ADR-017).
- `Membership` with states `invited|active|suspended|revoked|expired` and history retention (FR-SEC-067, 071).
- Org creation → creator gets `Organization Owner` membership (role assignment tables are introduced here minimally: `Role` seeds for Owner/Admin/Member placeholder; full catalog in I07).
- Invitations: scoped to org + proposed role ids; token hashed, single-use, 7-day expiry; cancel; resend; acceptance verifies the signed-in user's verified email matches invitation email (FR-SEC-072…077). Inviter cannot assign roles above own authority — enforced fully in I07, placeholder check here (Owner/Admin only).
- Active organization selection: `X-Organization-Id` header or path-scoped routes `/v1/orgs/{orgId}/…`; server verifies active membership on each request (FR-SEC-217: tenant from trusted context).
- Ownership continuity: cannot remove/suspend/demote the last active owner; ownership transfer flow with explicit confirmation (FR-SEC-079…081).
- No domain-based auto-join (FR-SEC-068).
- Audit events: org created, invitation created/cancelled/accepted, membership suspended/revoked, ownership transferred (FR-SEC-078).
- Web: create-org onboarding (first login without org → create or accept invitation), org switcher in top bar, Members settings page (list, invite, resend, cancel, suspend, revoke), invitation acceptance page.

### Out of scope (deferred to)
- Fine-grained roles/permissions, delegation limits, custom roles (→ I07)
- Workspace UI and workspace-scoped roles (→ backlog unless needed)
- Notifications engine (→ I29; invites use mailer)
- Organization deletion & export (→ I47)

## 3. Deliverables
- `apps/api/src/modules/organizations/` (controllers: `organizations`, `memberships`, `invitations`; services; repository)
- `apps/api/src/platform/context/organization-context.middleware.ts` (resolves + validates active org membership)
- `packages/contracts/src/organizations/*.ts`
- `apps/web/src/features/organizations/{onboarding,switcher,members-page,accept-invitation}.tsx`
- Seed: platform roles placeholder (`organization_owner`, `organization_admin`, `designer` minimal)

## 4. Data model changes
| Model | Notes |
|---|---|
| `Organization` | `display_id`, `name`, `slug` unique, `status` (`active`,`suspended`,`deleted`), `owner_policy`, `settings jsonb` |
| `Workspace` | `organization_id`, `name`, `status`, `is_default` |
| `Membership` | unique active (`organization_id`,`user_id`); `status`, `invited_by`, `joined_at`, `ended_at`, `end_reason` |
| `Invitation` | `organization_id`, `email`(normalized), `proposed_role_ids uuid[]`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `accepted_by`, `cancelled_at` |
| `Role`, `MembershipRole` | minimal now; extended in I07 |

## 5. API / contracts
| Method & path | Permission (catalog finalized in I07) | Purpose |
|---|---|---|
| `POST /v1/orgs` | authenticated (verified) | Create organization |
| `GET /v1/orgs` | authenticated | List my organizations/memberships |
| `GET /v1/orgs/{orgId}` | `organization.view` | Org details |
| `PATCH /v1/orgs/{orgId}` | `organization.update` | Rename/settings |
| `GET /v1/orgs/{orgId}/members` | `members.view` | List members |
| `POST /v1/orgs/{orgId}/invitations` | `members.invite` | Invite |
| `GET /v1/orgs/{orgId}/invitations` | `members.invite` | Pending invitations |
| `POST /v1/orgs/{orgId}/invitations/{id}/cancel` | `members.invite` | Cancel |
| `POST /v1/orgs/{orgId}/invitations/{id}/resend` | `members.invite` | Resend (new token) |
| `GET /v1/invitations/{token}` | public (minimal info: org name, inviter) | Preview |
| `POST /v1/invitations/accept` | authenticated | Accept |
| `POST /v1/orgs/{orgId}/members/{membershipId}/suspend` | `members.manage` | Suspend |
| `POST /v1/orgs/{orgId}/members/{membershipId}/revoke` | `members.manage` | Revoke |
| `POST /v1/orgs/{orgId}/ownership-transfer` | `organization.transfer_ownership` (+ step-up in I08) | Transfer ownership |

Events: `OrganizationCreated`, `InvitationCreated`, `InvitationAccepted`, `InvitationCancelled`, `MembershipSuspended`, `MembershipRevoked`, `OwnershipTransferred`.

## 6. UI
- First-run onboarding (create org or paste invite link).
- Org switcher (top bar) — switching updates active org in client state and refetches queries (query keys include orgId).
- Settings → Members: table with status badges, invite dialog (email + role), actions menu; Invitations tab.
- Invitation acceptance page handling: not signed in → sign-in/up then return; email mismatch → clear message.

## 7. Implementation tasks (ordered checklist)
1. [ ] Models + migration; partial unique index for active membership.
2. [ ] `OrganizationService.create` (org + default workspace + owner membership + audit + outbox in one tx).
3. [ ] Organization context middleware (validates `active` membership for the requested org; revoked/suspended → 404/403 per conventions).
4. [ ] Invitation service (create/resend/cancel/accept; atomic consume; expiry job marks `expired`).
5. [ ] Membership management with last-owner protection and ownership transfer.
6. [ ] Controllers + contracts.
7. [ ] Web onboarding, switcher, members page, acceptance page.
8. [ ] Tests; update `PROGRESS.md`.

## 8. Tests
- Unit: last-owner invariant; invitation state machine.
- Integration: create org → owner membership; invite → accept with matching verified email → active membership; replayed/cancelled/expired invitation rejected (FR-SEC-074, 077; TR-SEC-003); registering with org domain email gives no access (FR-SEC-068); revoked member's next org-scoped request denied (TR-SEC-004); cannot revoke last owner (FR-SEC-080); requests with an org id the user doesn't belong to → 404.
- E2E: owner invites second user, second user accepts, switches org, sees member list.

## 9. Acceptance criteria
- [ ] AC1 — A registered user cannot access an organization without valid membership (AC-SEC-001; FR-SEC-069).
- [ ] AC2 — Invitations are org-scoped, single-use, expiring, cancellable, and audited (FR-SEC-072…078).
- [ ] AC3 — Suspended/revoked memberships cannot perform org-scoped actions (FR-SEC-070).
- [ ] AC4 — The last owner cannot be removed; ownership transfer is explicit and audited (FR-SEC-080, 081).
- [ ] AC5 — Tenant id is derived from trusted context + verified membership, never trusted blindly from client input (FR-SEC-217).

## 10. Risks & notes
- Keep membership checks cheap (cache with short TTL + invalidation on change via outbox event; respect NFR-SEC-007 ≤60s, immediate for high-risk ops).
- Avoid leaking org existence in invitation preview beyond what the invitee needs.
- Platform support staff must never become owners silently (FR-SEC-083) — no backdoor endpoints.

## 11. Handoff
- I07 replaces placeholder role checks with the permission catalog and PDP; extends `Role`/`MembershipRole`.
- I08 adds step-up requirement to ownership transfer.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
