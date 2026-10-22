# Identity & authentication (I05)

Module `apps/api/src/modules/identity` · web `apps/web/src/features/auth` · decision ADR-006 (Better Auth).

## Design in one paragraph

Better Auth (v1.7, MIT) is embedded **as a library**: our NestJS controllers under `/v1/auth/*` call
`auth.api.*` in-process; Better Auth's own HTTP handler is not mounted. That keeps our error envelope,
generic (non-enumerating) responses, Redis rate limits, CSRF checks, audit trail and outbox events in
our code, while Better Auth provides the vetted mechanics: credential storage, session issuance /
validation / sliding refresh / revocation, signed cookies and password-reset tokens. Future MFA
(TOTP), passkeys and SSO (I08, backlog) come from its plugins.

## Data mapping (`packages/db`)

| Better Auth model | Our table              | Notes                                                                                                                                                                |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user`            | `users`                | `name` → `display_name`; extra: `status` (6 states, DB CHECK), `email_verified_at`, `last_login_at`, `failed_login_count`, `locked_until`                            |
| `session`         | `sessions`             | `token` (unique), `expires_at` = idle expiry (sliding), extra `absolute_expires_at`, `auth_assurance`; `ip_hash` = HMAC(secret, IP); `user_agent_summary` ≤200 chars |
| `account`         | `identity_credentials` | `provider_id='credential'` → `password_hash` (argon2id)                                                                                                              |
| `verification`    | `verification_tokens`  | `identifier` = SHA-256(base64url) of `"<purpose>:<token>"`; reset tokens (Better Auth) and our email-verification tokens                                             |

IDs are UUIDv7 (`advanced.database.generateId`).

## Flows

| Endpoint                            | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/register`            | Always 202 + same message. New email → user `pending_verification` + our verification email (24 h, single-use). Existing email → "sign-in help" email to the owner instead.                                                                                                                                                                                                                                           |
| `POST /v1/auth/verify-email`        | Atomic `DELETE … RETURNING` consume → `active`. Replay/expired → 400 `TOKEN_INVALID_OR_EXPIRED`.                                                                                                                                                                                                                                                                                                                      |
| `POST /v1/auth/resend-verification` | Always 202; only pending accounts get a new link (old one invalidated).                                                                                                                                                                                                                                                                                                                                               |
| `POST /v1/auth/login`               | Locked → generic 401 (after a dummy hash for timing). Wrong password → generic 401, `failed_login_count`++, lock for `AUTH_LOCKOUT_MINUTES` after `AUTH_LOCKOUT_THRESHOLD`. Correct password but unverified → 403 `EMAIL_NOT_VERIFIED`; suspended/etc. → 403 `ACCOUNT_NOT_ACTIVE` (only revealed after the password is proven). Success → session cookie, counters reset, hash upgraded if argon2 params were raised. |
| `POST /v1/auth/logout`              | Deletes the session row, clears the cookie.                                                                                                                                                                                                                                                                                                                                                                           |
| `POST /v1/auth/password/forgot`     | Always 202. Reset link valid 1 h, single-use, stored hashed.                                                                                                                                                                                                                                                                                                                                                          |
| `POST /v1/auth/password/reset`      | New password, **all sessions revoked**, lockout cleared (FR-SEC-044 escape hatch), unverified account activated (the link proves the mailbox).                                                                                                                                                                                                                                                                        |
| `POST /v1/auth/password/change`     | Requires current password; other sessions revoked; current session cookie rotated.                                                                                                                                                                                                                                                                                                                                    |
| `GET/PATCH /v1/me`                  | Current user / display name.                                                                                                                                                                                                                                                                                                                                                                                          |

Every outcome writes an audit event (`identity.*`), and state changes append outbox events
(`identity.user_registered`, `…_email_verified`, `…_password_changed`, `identity.session_revoked`).

## Sessions & cookies

- Cookie `__Host-aid_session` (`AUTH_COOKIE_SECURE=true`, default): HttpOnly, Secure, SameSite=Lax,
  Path=/, no Domain. Browsers accept Secure cookies on `http://localhost`. Set `AUTH_COOKIE_SECURE=false`
  (cookie `aid_session`) only for plain-http testing on another host.
- Value = `<token>.<HMAC(BETTER_AUTH_SECRET)>`; Better Auth rejects unsigned/altered values.
- Idle timeout `SESSION_IDLE_TIMEOUT_MIN` (7 d, extended at most every `SESSION_TOUCH_INTERVAL_MIN`),
  absolute `SESSION_ABSOLUTE_TIMEOUT_H` (30 d) enforced by `SessionMiddleware`, which also rejects
  non-`active` accounts and deletes the offending session.
- The middleware sets `RequestContext.principal = { type: 'human', id }` and `req.auth`.
  Protect a route with `@RequireAuth()`; read the user with `currentUserId()`.

## CSRF (FR-SEC-049)

`CsrfMiddleware` (platform) on every non-GET request: an `Origin` header must be in
`AUTH_TRUSTED_ORIGINS` (default `APP_BASE_URL`); without `Origin`, a request carrying the session
cookie must have `Sec-Fetch-Site: same-origin`. Plus SameSite=Lax. No token endpoint is needed
(`GET /v1/auth/csrf` from the plan was dropped).

## Rate limits (Redis, `RateLimitService`)

Per IP and per account/email, fixed windows (see `AuthRateLimits` in `auth.service.ts`), 429
`RATE_LIMITED` + `Retry-After`. Keys hash the subject (`aid:rl:<rule>:<sha256>`). Fails closed (503)
if Redis is down. `TRUST_PROXY` (default `loopback`) decides who may set `X-Forwarded-For`.

## Known gaps vs. the plan (accepted, ADR-006)

1. **Session tokens are stored as-is** in `sessions.token` (Better Auth looks sessions up by token).
   Mitigation: the cookie must carry a valid HMAC from `BETTER_AUTH_SECRET`, so a leaked table alone
   cannot be replayed; keep the secret out of the database host. Revisit if Better Auth adds hashed
   session storage.
2. **Better Auth commits its own writes**; our audit/outbox records follow immediately in a separate
   transaction (not atomic with the auth write). A crash in between can lose that audit/event record.
3. **Better Auth's email-verification links are stateless JWTs** (replayable until expiry), so we
   issue our own single-use hashed tokens instead (FR-SEC-015).
4. Session revocation deletes the row (no `revoked_at`); revocations are recorded in the audit log and
   as `identity.session_revoked` events.

## Web

- `src/proxy.ts`: optimistic redirect to `/sign-in?returnTo=…` when no session cookie (app + editor).
- `SessionProvider` (`GET /v1/me`, 401 → signed out), `RouteGuard` in `(app)` and `(editor)` layouts,
  `safeReturnTo()` (same-origin paths only), `UserMenu` (sign out). After sign-in/out use
  `resetUserData()` — never `queryClient.clear()` (it detaches the session observer).
- Pages: `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`.

## Testing

- Integration: `apps/api/test/integration/identity/*` against test-profile Postgres/Redis and
  **Mailpit test** (SMTP 51025, API 58025); helpers `TestClient` (cookie jar + Origin) and Mailpit.
- E2E: `tests/e2e/specs/auth.setup.ts` creates a verified user via API + dev Mailpit (8025) and saves
  a signed-in storage state for the other specs; `auth-flows.spec.ts` covers sign-up/verify/sign-in/
  sign-out, returnTo, and forgot/reset.
