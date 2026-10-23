# I08 — MFA, step-up, sessions & security audit

| Field                           | Value                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 1 — Identity, organizations & access                                                                                                                                                                          |
| Subsystems                      | SS-01 Identity & Access, SS-17 Audit & Observability                                                                                                                                                          |
| Depends on                      | I07                                                                                                                                                                                                           |
| Estimated sessions              | 2                                                                                                                                                                                                             |
| Spec references                 | `docs/init/09-specification.md` §8.2 (FR-SEC-033…040), §9.2 (FR-SEC-053…059), §15 (FR-SEC-178…185), §19 (FR-SEC-226…232), §26.1 (TR-SEC-002, 009), §27 (AC-SEC-005, 011); `docs/plan/05-decisions.md` ADR-006 |
| Open decisions to resolve first | Passkeys now or backlog (depends on ADR-006 library support) — default: TOTP now, passkeys backlog                                                                                                            |

## 1. Goal

Raise the assurance level of the platform: users can enroll TOTP MFA with recovery codes; organizations can require MFA; privileged roles and high-risk actions require MFA/step-up; users can review and revoke their sessions; and authorized admins can search the security audit log. This completes milestone **M2 Secure multi-tenant base**.

## 2. Scope

### In scope

- TOTP enrollment (QR + manual secret), verification, disable (requires password + current TOTP, never via email link alone FR-SEC-039), recovery codes (10 single-use, stored hashed, regenerate) (FR-SEC-033, 037, 038).
- Login flow with second factor when enrolled; session `auth_assurance` = `mfa_verified`; `mfa_verified_at` timestamp.
- Organization `SecurityPolicy.config.requireMfa` (all members) and platform rule: Owner, Admin, Billing Admin, Credential Admin require MFA (FR-SEC-034, 035). Members without MFA are prompted to enroll before org access when required.
- Step-up: PDP obligation `STEP_UP_REQUIRED` for configured actions (`organization.transfer_ownership`, `billing.manage`, `credentials.manage`, `security_policy.manage`, `organization.export`, `techpack.release` placeholder) if MFA verification older than N minutes (default 10) (FR-SEC-040). Frontend handles 401/403 `STEP_UP_REQUIRED` by showing a re-auth dialog and retrying.
- Sessions: list my sessions (device summary, last seen, current marker), revoke one/all others (FR-SEC-054); password change/MFA change revokes other sessions per policy (FR-SEC-055); org admin can force sign-out of a member's sessions for that org context (membership revocation already blocks, FR-SEC-056).
- Configurable idle/absolute timeouts per org policy (bounded by platform max) (FR-SEC-053).
- Security notifications by email: new MFA factor, MFA removed, password changed, new sign-in from new device (simple heuristic) (FR-SEC-226…230). No secrets in content; links lead to authenticated pages (FR-SEC-231).
- Audit log viewer: `GET /v1/orgs/{orgId}/audit-events` with filters (actor, resource, event type, time range, outcome), cursor pagination; access itself audited (FR-SEC-180, 182). Org admins see org-scoped events only; cannot alter (FR-SEC-179).

### Out of scope (deferred to)

- Passkeys/WebAuthn (→ backlog unless ADR-006 library makes it trivial)
- SSO/SCIM, conditional access (→ backlog, SPEC-009 Phase 3)
- Anomaly alerting (→ I46)
- Platform-wide audit search for operators (→ I45/I46)

## 3. Deliverables

- `apps/api/src/modules/identity/mfa/{totp.service.ts,recovery-codes.service.ts,mfa.controller.ts}`
- `apps/api/src/modules/identity/sessions.controller.ts`
- `apps/api/src/modules/authorization/step-up.ts` (obligation evaluation)
- `apps/api/src/modules/audit/{audit-query.controller.ts,audit-query.service.ts}`
- `apps/web/src/features/security/{mfa-settings,sessions-page,step-up-dialog,audit-log-page}.tsx`
- Email templates for security notifications

## 4. Data model changes

| Model                | Notes                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityCredential` | add `type='totp'` (encrypted secret using a simple app key until ADR-007 secret service in I22 — or hash-not-possible; store encrypted with `SECRETS_MASTER_KEY`), `type='recovery_code'` rows (hashed) |
| `Session`            | add `mfa_verified_at`, `auth_assurance` values `password`/`mfa_verified`, `device_label`                                                                                                                |
| `SecurityPolicy`     | `config.requireMfa`, `config.stepUpMaxAgeMinutes`, `config.sessionIdleMinutes`, `config.sessionAbsoluteHours`                                                                                           |

## 5. API / contracts

| Method & path                               | Permission                                   | Purpose                                        |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `POST /v1/me/mfa/totp/setup`                | authenticated                                | Begin enrollment (returns otpauth URI)         |
| `POST /v1/me/mfa/totp/confirm`              | authenticated                                | Confirm with code; returns recovery codes once |
| `POST /v1/me/mfa/totp/disable`              | authenticated + password + TOTP              | Disable                                        |
| `POST /v1/me/mfa/recovery-codes/regenerate` | authenticated + step-up                      | New codes                                      |
| `POST /v1/auth/mfa/verify`                  | partially authenticated session              | Complete login 2nd factor                      |
| `POST /v1/auth/step-up`                     | authenticated                                | Re-verify MFA/password for step-up             |
| `GET /v1/me/sessions`                       | authenticated                                | List sessions                                  |
| `DELETE /v1/me/sessions/{sessionId}`        | authenticated (own)                          | Revoke                                         |
| `POST /v1/me/sessions/revoke-others`        | authenticated                                | Revoke all others                              |
| `GET/PUT /v1/orgs/{orgId}/security-policy`  | `security_policy.manage` (+ step-up for PUT) | Org security policy                            |
| `GET /v1/orgs/{orgId}/audit-events`         | `audit.view`                                 | Search audit log                               |

## 6. UI

- Settings → Security: MFA enroll/disable, recovery codes display/download once, sessions list.
- Org Settings → Security policy (require MFA, timeouts).
- Org Settings → Audit log (filterable table, event detail drawer with redacted metadata).
- Global step-up dialog.

## 7. Implementation tasks (ordered checklist)

1. [x] TOTP service (RFC 6238, ±1 step window, replay prevention by remembering last used step).
2. [x] Recovery codes (hash with argon2/sha256+pepper; single-use).
3. [x] Two-phase login state (password ok → `mfa_pending` session that can only call verify).
4. [x] Policy-driven MFA requirement for privileged roles and org-wide flag; enrollment gate.
5. [x] Step-up obligation in PDP + guard + frontend retry dialog.
6. [x] Sessions APIs + UI; revocation side effects on password/MFA change.
7. [x] Security notification emails via mailer.
8. [x] Audit query service with filters and pagination; audit-of-audit-access.
9. [x] Tests; tag `m2-secure-base`; update `PROGRESS.md`.

## 8. Tests

- Unit: TOTP verification window and replay; recovery code single use; step-up age computation.
- Integration: enrolled user cannot obtain full session without second factor (TR-SEC-002); privileged role without MFA blocked from org access when policy requires (AC-SEC-005); step-up required for ownership transfer and satisfied after re-auth; disabling MFA via email link impossible; revoked session rejected on next request (TR-SEC-013); audit search scoped to org; audit payloads exclude secrets/tokens (TR-SEC-023).
- E2E: enroll MFA using a TOTP generator in test, sign out, sign in with code; revoke other session.

## 9. Acceptance criteria

- [x] AC1 — High-risk roles are protected by MFA and step-up per policy (AC-SEC-005; FR-SEC-035, 040).
- [x] AC2 — MFA enrollment, removal and recovery require proper verification; recovery codes are single-use and hashed (FR-SEC-037…039).
- [x] AC3 — Users can review and revoke sessions; password/MFA changes revoke other sessions (FR-SEC-054, 055).
- [x] AC4 — Security-sensitive actions produce durable, access-controlled audit records searchable by actor/resource/type/time/outcome (AC-SEC-011; FR-SEC-182).
- [x] AC5 — Security notification emails contain no secrets and delivery failure doesn't undo the action (FR-SEC-230, 232).
- [x] AC6 — **M2 exit** criteria from `04-roadmap.md` pass.

## 10. Risks & notes

- TOTP secrets must be encrypted at rest; if ADR-007 secret service isn't built yet, implement the minimal envelope-encryption utility now and reuse it in I22.
- Avoid lockout of the last owner who lost MFA: document the organization recovery process (FR-SEC-082) as an operator procedure in `docs/deployment/runbooks.md` (placeholder ok).

## 11. Handoff

- Step-up obligations are reused for billing (I30–I32), credentials (I22/I33), tech pack release (I43).
- Audit query API reused by admin console (I45) and observability (I46).

## 12. Completion record

- Completed on: 2026-10-23
- Sessions used: 1 (estimate 2)
- Open decision: passkeys → backlog (documented default); TOTP built now. ADR-043.
- Deviations from plan (ADR-043 unless noted):
  - Own TOTP implementation (RFC 6238 test vectors pass) instead of Better Auth's plugin; factors in new tables `mfa_factors` / `mfa_recovery_codes`, not `identity_credentials`. Recovery codes: HMAC-SHA256 (keyed with `BETTER_AUTH_SECRET`), not argon2 (50-bit random codes; a keyed hash is enough and lookup stays O(1)).
  - Secrets service lives in `platform/secrets/` (ADR-007 minimal version, AAD-bound contexts).
  - Platform rule for privileged roles is implemented as **"sensitive permissions require an MFA-verified session"** (plus org `requireMfa`), rather than blocking all org access for Owners/Admins/Billing/Credential admins without MFA — same protection for privileged actions, no lockout of ordinary work.
  - Step-up permission list adds `organization.delete`; `regenerate recovery codes` checks step-up in the identity module (it is not org-scoped).
  - Logout became `@Public()` so a half-finished (code outstanding) sign-in can be cancelled.
  - Org-admin forced sign-out of a member (FR-SEC-056) not built: suspend/revoke already block the next org request; backlog item added.
  - Idle timeout precision = session touch interval; org idle minimum is touch interval + 5 min.
  - `SecurityPolicy` keys: `requireMfa`, `stepUpMaxAgeMinutes`, `sessionIdleMinutes`, `sessionAbsoluteHours` (+ the I07 placeholders). The I07 key `requireMfaForAdmins` was dropped (replaced by the sensitive-permission rule).
  - Prisma schema now declares the I07 foreign keys of `roles` / `resource_grants` / `security_policies` (the generated diff otherwise dropped them) and the audit actor index.
  - New file `docs/deployment/runbooks.md` (second-factor reset, last-owner recovery FR-SEC-082, master key).
- Verification:
  - `pnpm verify` 29/29: api unit 86 (TOTP RFC vectors + skew + replay, recovery codes, secrets AAD/tamper/production requirement, PDP MFA/step-up/session-limit table), contracts 32, web 37, worker 7.
  - `pnpm test:integration`: api 71 incl. security 28 — new `mfa-sessions-audit` (8): no usable session without the second factor + code replay refused; recovery code single-use, hashes and encrypted secret at rest; disable needs password + code and signs out others; sensitive actions need MFA and `requireMfa` blocks non-MFA members; step-up required when stale and satisfied after `/auth/step-up`; sessions list/revoke/revoke-others with immediate rejection (TR-SEC-013); new-device notice without secrets; audit search permissioned, org-scoped, paginated, filtered, audited, and no passwords/TOTP secrets/recovery codes/session tokens anywhere in audit metadata (TR-SEC-023). Worker 13.
  - `pnpm e2e` 17/17 — new: enrol MFA in Settings → Your security (QR + key + recovery codes), sign out, wrong code rejected, sign in with code, second device, revoke it, audit log page. The roles spec now enrols MFA before changing roles.
  - **M2 demo** (register → verify → create org → invite → roles enforced → MFA → audit log) is covered end to end by the auth-flows, organizations, authorization and security specs; M2 exit criteria (isolation suite, every route declared, privileged actions audited) pass. Tagged `m2-secure-base`.
- Follow-ups added to backlog: passkeys, SSO/SCIM, self-service factor reset + operator tooling, admin security notifications, audit retention/export, anomaly alerts, org forced sign-out, finer idle tracking.
