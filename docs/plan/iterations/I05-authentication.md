# I05 — Accounts & authentication

| Field | Value |
|---|---|
| Phase | 1 — Identity, organizations & access |
| Subsystems | SS-01 Identity & Access (identity module), SS-16 (email delivery basics), SS-17 (security audit events) |
| Depends on | I03, I04 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/09-specification.md` §5 (principles), §7 (FR-SEC-001…027), §8.1, §8.3 (FR-SEC-028…032, 041…045), §9 (FR-SEC-046…059), §15.1, §21, §26.1 (TR-SEC-001); `docs/init/01-overview.md` §3.1 (FR-010…011); `docs/init/11-tech-stack.md` §10 |
| Open decisions to resolve first | **ADR-006** (authentication implementation: Better Auth vs minimal in-house with vetted primitives) — decide at the very start; ADR-013 (email via SMTP/Mailpit) |

## 1. Goal
Users can register, verify their email, sign in, stay signed in through a secure server-side session, sign out, and recover their password — with rate limiting, enumeration resistance, account states, and audit events. The API resolves an authenticated principal into `RequestContext` for every request, which all later authorization builds on.

## 2. Scope
### In scope
- ADR-006 evaluation (time-boxed ≤1 hour): library maturity, licence, Postgres support, NestJS integration, passkey/TOTP roadmap, control over session storage. Record outcome.
- Account model and states (`pending_verification`, `active`, `suspended`, `locked`, `deletion_pending`, `deleted_or_anonymized`) with controlled transitions (FR-SEC-004…006).
- Email normalization (lowercase, trim; no dot-stripping) and uniqueness (FR-SEC-002).
- Registration with email + password; argon2id hashing (FR-SEC-016); password policy (min length 12, max 128, compromised-password check optional/pluggable FR-SEC-019).
- Email verification tokens: random 32 bytes, stored hashed, single-use, 24h expiry (FR-SEC-012, 015).
- Login/logout; opaque session token in `__Host-` prefixed, `HttpOnly`, `Secure` (prod), `SameSite=Lax` cookie; sessions stored hashed in Postgres with idle (e.g. 7 days) and absolute (30 days) timeouts, configurable (FR-SEC-046…053).
- CSRF protection for cookie-authenticated mutating requests (double-submit token or `Origin`/`Sec-Fetch-Site` checks) (FR-SEC-049).
- Password reset (single-use, 1h, revokes other sessions; does not bypass MFA in I08) (FR-SEC-020…022, 026).
- Generic responses to avoid account enumeration (FR-SEC-014, 024).
- Rate limiting (Redis) on register/login/verify/reset per IP + per account, progressive delay, temporary lock with safe recovery (FR-SEC-013, 041…044).
- `RequestContext.principal` resolution middleware; `GET /v1/me`.
- Security audit events: login success/failure, logout, registration, verification, password change/reset, lockout (§15.1).
- Email sending via Nodemailer → Mailpit in dev; email templates (verify, reset) minimal HTML+text.
- Web: sign-up, sign-in, verify-email landing, forgot/reset password pages, session-aware route guard, user menu with sign-out.

### Out of scope (deferred to)
- Organizations and memberships (→ I06)
- Permissions/roles (→ I07)
- MFA, step-up, session listing/revocation UI, passkeys (→ I08; passkeys may slip to backlog per ADR-006)
- SSO/OIDC/SAML (→ backlog, SPEC-009 Phase 3)
- Full notification engine (→ I29; I05 uses a small `MailerService`)

## 3. Deliverables
- `apps/api/src/modules/identity/` (`identity.module.ts`, `auth.controller.ts`, `account.service.ts`, `session.service.ts`, `password.service.ts`, `verification-token.service.ts`, `rate-limit.service.ts`, `repository.ts`)
- `apps/api/src/platform/auth/session.middleware.ts`, `csrf.guard.ts`
- `apps/api/src/platform/mail/mailer.service.ts` + `templates/`
- `packages/contracts/src/identity/*.ts` (DTO schemas)
- `apps/web/src/app/(public)/{sign-in,sign-up,verify-email,forgot-password,reset-password}/page.tsx`
- `apps/web/src/features/auth/{api.ts,session-provider.tsx,route-guard.tsx}`
- ADR-006 outcome in `05-decisions.md`

## 4. Data model changes
| Model | Notes |
|---|---|
| `User` | `email` (normalized, unique), `display_name`, `status`, `email_verified_at`, `last_login_at`, `failed_login_count`, `locked_until` |
| `IdentityCredential` | `type='password'` row with argon2id hash + params; future types `totp`, `passkey`, `oidc` |
| `Session` | `token_hash` (sha256), `user_id`, `issued_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoke_reason`, `auth_assurance` (`password`), `ip_hash`, `user_agent_summary` |
| `VerificationToken` | `purpose`, `token_hash`, `user_id`/`email`, `expires_at`, `consumed_at` |

If Better Auth is chosen, map its tables to these logical names via `@@map` and keep the `Session` semantics; document the mapping.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/auth/register` | public, rate-limited | Create account (`pending_verification`), send verification |
| `POST /v1/auth/verify-email` | public | Consume token → `active` |
| `POST /v1/auth/resend-verification` | public, rate-limited, generic response | Resend |
| `POST /v1/auth/login` | public, rate-limited | Create session cookie |
| `POST /v1/auth/logout` | authenticated | Revoke current session |
| `POST /v1/auth/password/forgot` | public, generic response | Send reset email |
| `POST /v1/auth/password/reset` | public | Consume token, set password, revoke sessions |
| `POST /v1/auth/password/change` | authenticated (re-enter current password) | Change password |
| `GET /v1/auth/csrf` | public | Issue CSRF token |
| `GET /v1/me` | authenticated | Current user profile + status |
| `PATCH /v1/me` | authenticated | Update display name |

Events (outbox): `UserRegistered`, `UserEmailVerified`, `UserPasswordChanged`, `SessionRevoked`. Audit events per §15.1.

## 6. UI
- Auth pages (clean, centered card; accessible labels; password visibility toggle; strength hint).
- Verify-email pending screen with resend.
- Route guard redirecting unauthenticated users from `(app)`/`(editor)` to sign-in with `returnTo` (validated as same-origin path).
- User menu: profile name, sign out.

## 7. Implementation tasks (ordered checklist)
1. [ ] Decide ADR-006; update `05-decisions.md` (Accepted + rationale).
2. [ ] Prisma models + migration; review SQL.
3. [ ] `PasswordService` (argon2id params documented; rehash-on-login if params change).
4. [ ] `VerificationTokenService` (generate, hash, consume atomically with `UPDATE … WHERE consumed_at IS NULL AND expires_at > now()`).
5. [ ] `SessionService` (create, validate+touch with throttled `last_seen_at`, revoke, revoke-all-for-user); middleware populates `RequestContext.principal`; rejects non-`active` accounts (FR-SEC-005).
6. [ ] CSRF guard on all non-GET cookie-authenticated routes.
7. [ ] Rate limiting service (Redis sliding window) + lockout policy with time-based unlock and reset-password escape hatch (FR-SEC-043/044).
8. [ ] Controllers and DTOs; generic responses; constant-time-ish comparisons; dummy hash on unknown email to equalize timing.
9. [ ] Mailer + templates; links use `APP_BASE_URL`.
10. [ ] Audit + outbox events in the same transactions.
11. [ ] Web pages, session provider (`/v1/me`), route guard, sign-out.
12. [ ] Tests (below); update `PROGRESS.md`.

## 8. Tests
- Unit: email normalization; password policy; token hashing; session expiry math; returnTo validation.
- Integration: register → email in Mailpit API → verify → login → `/v1/me`; replayed/expired verification token rejected (FR-SEC-015); login with unverified account fails generically; wrong password increments counter and triggers lock after N; reset revokes existing sessions; logout invalidates cookie server-side; suspended account cannot authenticate; CSRF missing → 403; rate limit returns 429; logs contain no password/token (TR-SEC-023 subset).
- E2E (Playwright): full sign-up/verify/sign-in/sign-out flow using Mailpit HTTP API to fetch the link; forgot/reset flow.

## 9. Acceptance criteria
- [ ] AC1 — Registration, verification, login, logout, and recovery work end-to-end (TR-SEC-001; SRS FR-010).
- [ ] AC2 — Passwords stored only as argon2id hashes; never logged (FR-SEC-016, 017).
- [ ] AC3 — Verification/reset tokens are single-use, time-limited, hashed at rest (FR-SEC-012, 020).
- [ ] AC4 — Responses do not reveal whether an email has an account (FR-SEC-014, 024).
- [ ] AC5 — Sessions are opaque, HTTP-only, secure cookies with idle + absolute timeouts and server-side revocation (FR-SEC-047, 048, 053).
- [ ] AC6 — Mutating cookie-authenticated requests require CSRF protection (FR-SEC-049).
- [ ] AC7 — Auth endpoints are rate-limited with safe lockout recovery (FR-SEC-041…044).
- [ ] AC8 — Authentication events are recorded in the audit log (§15.1).

## 10. Risks & notes
- Don't hand-roll crypto: use argon2 library, `crypto.randomBytes`, sha256 for token hashes.
- Spec FR-SEC-009: never auto-merge accounts by email/display name.
- Keep the `Session` row lookup fast (index on `token_hash`); I07 will add membership checks per request — design for a short-lived in-memory cache with explicit revocation semantics (NFR-SEC-007 target 60s).
- Cookie `Secure` must be configurable for local http dev; document.

## 11. Handoff
- I06 needs `principal.userId` in context and the mailer for invitations.
- I08 extends `IdentityCredential` (TOTP), `Session.auth_assurance`, and adds session listing/revocation UI.
- Record ADR-006 decision and any library-specific constraints in `PROGRESS.md`.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
