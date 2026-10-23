# PROGRESS — Live Build Tracker

> Update this file at the **start** (mark in_progress) and **end** (handoff/finish) of every session. Commit + push it. See [`08-session-playbook.md`](08-session-playbook.md).

## Current pointer

| Field                 | Value                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Current iteration** | **I08 — MFA, step-up, sessions & security audit** (next)                                             |
| Status                | `todo`                                                                                               |
| Branch                | `main`                                                                                               |
| Last updated          | 2026-10-23 (I07 finished)                                                                            |
| Blockers              | None. Owner input welcome on ADR-008, ADR-009, ADR-010, ADR-011; please confirm ADR-021 (SeaweedFS). |

## Status legend

`todo` · `in_progress` · `blocked` · `done` · `skipped` (with reason)

## Iteration status

| ID  | Iteration                                             | Phase | Status | Started    | Done       | Sessions | Notes                                                 |
| --- | ----------------------------------------------------- | ----- | ------ | ---------- | ---------- | -------- | ----------------------------------------------------- |
| I01 | Monorepo bootstrap & tooling                          | 0     | done   | 2026-10-22 | 2026-10-22 | 1        | Toolchain pinned (ADR-022)                            |
| I02 | Local infrastructure & backend base                   | 0     | done   | 2026-10-22 | 2026-10-22 | 1        | SeaweedFS (ADR-021); AC1 needs owner check on Windows |
| I03 | Platform primitives                                   | 0     | done   | 2026-10-22 | 2026-10-22 | 1        | ADR-038 packages/db, ADR-039                          |
| I04 | Web app shell & design system                         | 0     | done   | 2026-10-22 | 2026-10-22 | 1        | → M1 reached; ADR-040                                 |
| I05 | Accounts & authentication                             | 1     | done   | 2026-10-22 | 2026-10-22 | 1        | Better Auth (ADR-006); see identity.md                |
| I06 | Organizations, memberships & invitations              | 1     | done   | 2026-10-22 | 2026-10-23 | 1        | ADR-017 accepted (default), ADR-041                   |
| I07 | Authorization engine & tenant isolation               | 1     | done   | 2026-10-23 | 2026-10-23 | 1        | ADR-042; docs/architecture/authorization.md           |
| I08 | MFA, step-up, sessions & security audit               | 1     | todo   |            |            |          | → M2                                                  |
| I09 | Asset & storage service                               | 2     | todo   |            |            |          |                                                       |
| I10 | Projects & lifecycle core                             | 2     | todo   |            |            |          |                                                       |
| I11 | Canonical garment model package                       | 2     | todo   |            |            |          | Confirm ADR-008                                       |
| I12 | Designs, working copies & immutable revisions         | 2     | todo   |            |            |          |                                                       |
| I13 | Artifact registry & built-in library                  | 2     | todo   |            |            |          |                                                       |
| I14 | Design operation router (deterministic)               | 3     | todo   |            |            |          |                                                       |
| I15 | Editor shell, editor-core & autosave                  | 3     | todo   |            |            |          |                                                       |
| I16 | Parametric 2D garment renderer (SVG)                  | 3     | todo   |            |            |          |                                                       |
| I17 | Hierarchy, selection & contextual properties          | 3     | todo   |            |            |          |                                                       |
| I18 | Artifact browser & structured attachment              | 3     | todo   |            |            |          |                                                       |
| I19 | Revision history, commit & comparison UI              | 3     | todo   |            |            |          |                                                       |
| I20 | Design validation engine & findings UI                | 3     | todo   |            |            |          | → M3                                                  |
| I21 | Generation job management & progress (SSE)            | 4     | todo   |            |            |          |                                                       |
| I22 | AI provider registry, credentials & adapters          | 4     | todo   |            |            |          | Decide ADR-009                                        |
| I23 | Prompt & request compilation, routing                 | 4     | todo   |            |            |          |                                                       |
| I24 | Usage metering & entitlement preflight                | 4     | todo   |            |            |          | Default ADR-011                                       |
| I25 | AI generation in the editor                           | 4     | todo   |            |            |          |                                                       |
| I26 | Design initiation from sketch/photo/fabric            | 4     | todo   |            |            |          |                                                       |
| I27 | Region tools, annotations & targeted edits            | 4     | todo   |            |            |          | → M4                                                  |
| I28 | Review & approval workflow                            | 5     | todo   |            |            |          |                                                       |
| I29 | Notifications                                         | 5     | todo   |            |            |          | → M5                                                  |
| I30 | Plans, subscriptions, entitlements & budgets          | 6     | todo   |            |            |          | Confirm ADR-011                                       |
| I31 | Pricing, charges & invoices                           | 6     | todo   |            |            |          |                                                       |
| I32 | Payment integration & subscription lifecycle          | 6     | todo   |            |            |          | Decide ADR-010                                        |
| I33 | Customer-provided API credentials (BYOK)              | 6     | todo   |            |            |          |                                                       |
| I34 | Reconciliation & financial operations                 | 6     | todo   |            |            |          | → M6                                                  |
| I35 | Server render pipeline, manifests, cache & exports    | 7     | todo   |            |            |          |                                                       |
| I36 | Interactive 3D viewer                                 | 7     | todo   |            |            |          |                                                       |
| I37 | 2D/3D component linking & material sync               | 7     | todo   |            |            |          | → M7                                                  |
| I38 | Production specification core & BOM                   | 8     | todo   |            |            |          |                                                       |
| I39 | Measurements, POMs, tolerances & grading              | 8     | todo   |            |            |          |                                                       |
| I40 | Construction, colorways, artwork, labels & quality    | 8     | todo   |            |            |          |                                                       |
| I41 | Specification validation & production readiness       | 8     | todo   |            |            |          |                                                       |
| I42 | Tech pack export                                      | 8     | todo   |            |            |          |                                                       |
| I43 | Spec review, release, change impact & supplier access | 8     | todo   |            |            |          |                                                       |
| I44 | AI-assisted specification drafting                    | 8     | todo   |            |            |          | → M8                                                  |
| I45 | Platform administration console                       | 9     | todo   |            |            |          |                                                       |
| I46 | Observability & audit tooling                         | 9     | todo   |            |            |          |                                                       |
| I47 | Security hardening, API tokens, export & deletion     | 9     | todo   |            |            |          |                                                       |
| I48 | Production deployment, backups & runbooks             | 9     | todo   |            |            |          |                                                       |
| I49 | Release hardening                                     | 9     | todo   |            |            |          | → M9                                                  |

## Milestones

| Milestone                   | Status | Date       | Tag                   |
| --------------------------- | ------ | ---------- | --------------------- |
| M1 Walking skeleton         | done   | 2026-10-22 | `m1-walking-skeleton` |
| M2 Secure multi-tenant base | todo   |            | `m2-secure-base`      |
| M3 Structured editor alpha  | todo   |            | `m3-editor-alpha`     |
| M4 AI-assisted design alpha | todo   |            | `m4-ai-alpha`         |
| M5 Review workflow          | todo   |            | `m5-review`           |
| M6 Commercial beta          | todo   |            | `m6-commercial-beta`  |
| M7 Visualization            | todo   |            | `m7-visualization`    |
| M8 Production tech packs    | todo   |            | `m8-techpacks`        |
| M9 Launch                   | todo   |            | `m9-launch`           |

## Environment facts (fill in as decided)

| Item             | Value                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Node.js          | 24 LTS (engines >=22.12)                                                                                  |
| pnpm             | 10.34.7                                                                                                   |
| Ports            | web 3000 · api 4000 · postgres 5432 · redis 6379 · object store 9000/9001 · mailpit 8025 (confirm in I02) |
| Object store     | SeaweedFS S3 :8333 (ADR-021)                                                                              |
| Auth library     | Better Auth 1.7.7 (ADR-006)                                                                               |
| AI providers     | _ADR-009, set in I22_                                                                                     |
| Payment provider | _ADR-010, set in I32_                                                                                     |

## Decisions awaiting owner review

_(Claude lists here any Open ADR it resolved with a default while the owner was unavailable.)_

- ADR-021 — object storage: SeaweedFS chosen by default (2026-10-22, I02).
- ADR-017 — organization + one default workspace; workspace UI deferred (2026-10-23, I06).

## Deviations from plan

_(date — iteration — what changed — why — ADR link)_

- 2026-10-23 — I07 — global PEP + PDP, catalog synced from code at API start, matrix reading, delegation rule, test-utils package — ADR-042
- 2026-10-23 — I06 — path-scoped org context (`@OrgAccess`), invitation tokens only in request bodies (`POST /v1/invitations/preview`), placeholder roles until I07 — ADR-041
- 2026-10-22 — between I02/I03 — local log files (`logs/`, `pnpm logs`) and local PostgreSQL option, at owner's request — ADR-036, ADR-037
- 2026-10-22 — I05 — Better Auth embedded behind our controllers; Origin-based CSRF; accepted gaps (unhashed session tokens, non-atomic audit) — ADR-006, docs/architecture/identity.md
- 2026-10-22 — I04 — shadcn components hand-written (registry blocked), Playwright as `tests/e2e` package — ADR-040
- 2026-10-22 — I03 — Prisma moved to `packages/db`; primitive mechanics — ADR-038, ADR-039 (details in the I03 completion record)

## Session log

_Newest first. One entry per session. Keep entries short but sufficient for another machine to resume._

### 2026-10-23 — I07 Authorization engine & tenant isolation (session 1) — DONE

- Built: permission catalog (81 keys incl. planned ones) + 11 baseline roles with the §23 mapping (`packages/contracts`); `permissions`/`role_permissions`/`resource_grants`/`security_policies` (migration `…_i07_authorization`), catalog sync at API start / `pnpm db:seed`; global `AuthorizationGuard` + PDP (reason codes, fail closed), resource resolvers, Redis membership cache with immediate invalidation; role assignment with delegation, effective permissions, `/v1/me/permissions`; every I05/I06 route retrofitted; `packages/test-utils` + security suites; web role editor, permissions drawer, `can()` / `<Can>`.
- Tests: contracts 32, api unit 71, integration api 63 (security 20) + worker 13, e2e 16.
- **Owner actions (Windows):** `pnpm install` (new package `@ai-designer/test-utils`), `pnpm db:migrate`, then `pnpm dev` — the API fills the roles/permissions tables itself at start (or run `pnpm db:seed`). Existing owners keep full admin rights; to see billing/credential/approval features later, an owner gives themselves the matching role in Settings → Members → Edit roles.
- **Next step:** I08 — MFA, step-up (wire `STEP_UP_REQUIRED` obligations for sensitive permissions), session management and security audit → milestone M2 (tag `m2` after I08).

### 2026-10-23 — I06 Organizations, memberships & invitations (session 1) — DONE

- Built: `organizations`/`workspaces`/`roles`/`memberships`/`membership_roles`/`invitations` (migration `…_i06_organizations`: partial unique indexes for live membership, default workspace, pending invitation; status CHECKs; seeded placeholder roles); `organizations` module (create in one tx, list mine, rename, members suspend/reactivate/revoke with last-owner protection, invitations create/list/cancel/resend/preview/accept, ownership transfer), `@OrgAccess()` guard; worker sweeper expires invitations; web onboarding, org switcher, Settings → General / Members, invitation acceptance page.
- Tests: api unit 63, integration api 43 + worker 12, e2e 15.
- **Owner actions (Windows):** `pnpm install`, `pnpm db:migrate` (adds the organization tables and seeds the three roles), `pnpm dev`. Existing accounts will be sent to **/onboarding** to create their first organization. To try invitations: Settings → Members → Invite, then open the email in Mailpit (http://localhost:8025) in another browser/profile.
- **Next step:** I07 — authorization engine & permission catalog; replace `@OrgAccess(...roles)` role lists with permissions (see I06 completion record and ADR-041).

### 2026-10-22 — I05 Accounts & authentication (session 1) — DONE

- ADR-006 evaluated (npm metadata + source; web search disabled for the org): Better Auth 1.7.7, MIT, Prisma 7 supported → used as an in-process library behind our `/v1/auth/*` (details + accepted gaps: `docs/architecture/identity.md`).
- Built: `users`/`sessions`/`identity_credentials`/`verification_tokens` (migration `…_i05_identity`, status CHECK), argon2id, our single-use email-verification tokens, register/verify/resend/login/logout/forgot/reset/change, `/v1/me`, lockout, Redis rate limits, Origin CSRF, session middleware (absolute timeout, active-only), audit + outbox events, Mailpit emails; web sign-in/up/verify/forgot/reset pages, `proxy.ts` + RouteGuard, user menu.
- Tests: api unit 56, integration 33 (identity 13 + log secrecy), web 37, e2e 14.
- **Owner actions (Windows):**
  1. Add to your `.env` (the API refuses to start without it): `BETTER_AUTH_SECRET=` + a random value (`openssl rand -base64 32`, or any 32+ random characters). Optional keys are in `.env.example` (section "Authentication").
  2. `pnpm install`, `pnpm db:migrate` (adds the identity tables), `pnpm dev`. Mailpit must be running (`pnpm infra:up`) — open http://localhost:8025 to see the confirmation emails.
  3. Try it: http://localhost:3000 → redirected to sign-in → "Create an account" → confirm via the Mailpit email → sign in.
  4. Integration tests now also need the test Mailpit (`pnpm infra:test:up`; your compose file got the `mailpit-test` service).
- **Next step:** I06 — organizations, memberships & invitations (uses `currentUserId()`, the mailer and `RequestContext.organizationId`).

### 2026-10-22 — I04 Web app shell & design system (session 1) — DONE, **M1 reached**

- Tailwind 4 tokens (dark default, light/system), owned shadcn-style components, app shell (collapsible sidebar, top bar with org/user placeholders, Ctrl/⌘+K palette), placeholder pages, `(public)/sign-in` placeholder, `(editor)` full-viewport layout with six resizable/collapsible regions (`/editor/demo`, dev only).
- Typed API client (`ApiError`, friendly messages, toast with copyable reference), TanStack Query provider + key factory, shortcut registry (ignores inputs), `/system` status page (web → `/v1` proxy → API).
- Tests: web unit 27; Playwright 10 (`pnpm e2e`). `docs/architecture/frontend-guidelines.md` written.
- Owner's own edits kept: `.gitignore` comment; **`infra/compose/docker-compose.dev.yml` with PostgreSQL services commented out is left as the owner has it on the Windows machine** (cloud copy keeps the profile-based version; do not overwrite the owner's file when syncing).
- **Owner actions (Windows):** `pnpm install`, `pnpm e2e:install` (once, downloads Chromium), `pnpm dev`, open http://localhost:3000 (try Ctrl+K, the theme menu, /system, /editor/demo); `pnpm e2e` runs the browser tests (API + infra must be reachable).
- **Next step:** I05 — accounts & authentication with **Better Auth** (ADR-006, owner decision). First verify version/licence/Prisma 7 + NestJS integration.

### 2026-10-22 — I03 Platform primitives (session 1) — DONE

- Extra owner requests first: git-ignored `logs/` folder with rotating files for api/worker/web (+ browser errors via `POST /api/client-logs`), viewer `pnpm logs [api|worker|web] [-f] [--errors]` (ADR-036); `INFRA_LOCAL_POSTGRES=true` to use a locally installed PostgreSQL (ADR-037).
- `packages/db` (ADR-038): Prisma schema, migrations (`…_i03_platform_primitives`: id_sequences, audit_events + append-only trigger, outbox_events, processed_events, idempotency_keys, jobs, job_attempts), client, platform helpers, `@ai-designer/db/testing`.
- `packages/contracts`: error codes + envelope, display-id prefixes, event envelope/`defineEvent`, platform events, jobs, pagination cursors, health schemas.
- API `platform/`: RequestContext (ALS, log mixin), `AppError` + global filter, `@Endpoint` (zod validation + OpenAPI), `@Idempotent()`, IdSequence/Audit/Outbox/Job services, `assertVersion`, OpenAPI (`/v1/openapi.json`, `pnpm api:openapi` → `docs/api/openapi.json`). Dev reference module `modules/dev-examples`.
- Worker: outbox dispatcher → `events` queue → idempotent consumers; `jobs` queue → `runDurableJob`; maintenance sweeper.
- How-to for later sessions: `docs/architecture/platform-primitives.md`.
- **Owner actions (Windows):** `git pull` (or use the synced folder), `pnpm install`, then `pnpm db:migrate` (applies the I03 migration; with local PostgreSQL keep `INFRA_LOCAL_POSTGRES=true`), `pnpm dev`; try `curl -X POST http://localhost:4000/v1/_dev/echo-idempotent -H "content-type: application/json" -H "Idempotency-Key: k1" -d "{\"message\":\"hi\"}"` and open http://localhost:4000/v1/openapi.json. For `pnpm test:integration` with local PostgreSQL set `AID_IT_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/ai_designer_test` in `.env` (Redis/object store test containers via `pnpm infra:test:up`).
- **Next step:** I04 — web app shell & design system (read `apps/web/AGENTS.md` / `node_modules/next/dist/docs` first: Next.js 16).

### 2026-10-22 — I02 Local infrastructure (session 1) — DONE

- Compose (`infra/compose/docker-compose.dev.yml`): postgres 17, redis 7.4, SeaweedFS S3, Mailpit + isolated `test` profile; all ports on 127.0.0.1. Cross-platform `infra/scripts/infra.mjs` (`pnpm infra:up|down|reset --yes|test-up|test-down`).
- API platform: zod `AppConfig`, nestjs-pino logging with redaction + X-Request-Id, Prisma 7 (adapter-pg, first migration `20261022041649_i02_init`), Redis, BullMQ `system` queue producer, `ObjectStorage` (S3), `/v1/health` + `/v1/health/ready` (503 when degraded). Worker: config, pino, BullMQ `system` worker (`ping`).
- `packages/contracts` created early (queue contracts).
- Tests: unit (env schema, redaction, request id, health controller, worker config/processor) + integration (api 10, worker 1) all green against sandbox infra.
- Sandbox blockers & workarounds documented in playbook §5 (Docker Hub/Prisma binaries blocked).
- **Owner action:** on Windows run `pnpm install`, `cp .env.example .env`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, open http://localhost:4000/v1/health/ready (expects all `ok`). Report back if anything fails (AC1).
- **Next step:** I03 — platform primitives (extend contracts: errors, ids, events; audit, outbox, idempotency, durable jobs, OpenAPI).

### 2026-10-22 — I01 Monorepo bootstrap (session 1) — DONE

- Built pnpm 10 + Turborepo workspace: `apps/api` (NestJS 12, ESM, `GET /v1/health`), `apps/web` (Next.js 16 placeholder page), `apps/worker` (Node/tsx skeleton), `packages/config` (tsconfig bases, ESLint flat config with boundary rules, Prettier, Vitest preset).
- `pnpm verify` green (12 tasks: lint 0 warnings, typecheck, 14 tests); `pnpm build` green; `pnpm dev` verified (web :3000, api :4000/v1/health, worker ready).
- Toolchain decisions recorded in ADR-022; deviations in the I01 completion record.
- Working mode used: code built/tested in the cloud workspace, source synced into the owner's folder (no `node_modules`). Docker works in the cloud workspace (start `dockerd` first) — use it for I02 compose + integration tests.
- **Next step:** I02 — decide ADR-021 (object store) at start, then compose infra, env schema, Prisma, logging, health checks, worker ↔ Redis.

### 2026-10-22 — Planning session (no code)

- Analyzed all 11 documents in `docs/init/` and produced `docs/plan/` (architecture, conventions, domain model, roadmap with 49 iterations, decision log, traceability, playbook, environment setup, backlog) plus `CLAUDE.md` and slash-command sources in `docs/plan/claude-commands/` (`.claude/` could not be written remotely; I01 installs them).
- Found: `docs/init/02-subsystem-breakdown.md` duplicates `08-tech-pack.md`; ARCH-GDP-002 (subsystem breakdown) is missing — subsystem map reconstructed in `01-architecture.md` §2.
- **Next step:** start I01 (`docs/plan/iterations/I01-monorepo-bootstrap.md`).
