# CLAUDE.md — AI Designer (Garment Design & Development Platform)

You are building this entire product, iteration by iteration, across many sessions, machines and possibly accounts. **The repository is your memory.** Read this file first in every session.

## What this is

A self-hosted, AI-powered garment design platform: users start from a sketch/photo/fabric, edit a **structured garment model** visually (components, properties, reusable artifacts), request AI generation deliberately, approve **immutable revisions**, and produce **validated, versioned tech packs**. AI usage is metered and billed (platform keys or customer keys).

Stack: TypeScript · pnpm + Turborepo · Next.js (web) · NestJS modular monolith (api) · BullMQ worker · PostgreSQL + Prisma · Redis · S3-compatible storage · SVG/Konva 2D · React Three Fiber 3D viewer · Docker Compose.

## Where things are

- `docs/init/` — original requirement specs (read-only baseline). `02-subsystem-breakdown.md` is a duplicate of `08-tech-pack.md`.
- `docs/plan/` — **the implementation plan** (start at `docs/plan/README.md`).
  - `PROGRESS.md` — live tracker: current iteration, statuses, session log. **Read it now.**
  - `08-session-playbook.md` — the protocol you follow every session.
  - `iterations/I<NN>-*.md` — what to build in each iteration.
  - `01-architecture.md`, `02-conventions.md`, `03-domain-model.md`, `05-decisions.md` — rules you must follow.
- `docs/plan/claude-commands/` — source of the `/next-iteration`, `/finish-iteration`, `/handoff` slash commands (copy into `.claude/commands/`; I01 does this).
- Code layout (as it gets created): `apps/web`, `apps/api`, `apps/worker`, `packages/*` (`contracts`, `db`, `logger`, `config`, …), `infra/*`, `tests/*`.
- `docs/architecture/platform-primitives.md` — **how to use errors, validation, ids, audit, outbox, idempotency, durable jobs.** Read before writing any module.
- `docs/architecture/identity.md` — **authentication design (Better Auth), sessions, CSRF, rate limits; `currentUserId()`.**
- `docs/architecture/authorization.md` — **permissions, roles, `@RequirePermission()` & friends, resource resolvers, tenant isolation tests. Every route must declare one.**
- `docs/architecture/assets.md` — **storing files: upload flow, `packages/media`, `storeGeneratedAsset`, reference checks before delete.**
- `docs/architecture/projects.md` — **project lifecycle table, dependents/completion registry, restricted visibility.**
- `packages/garment-model/README.md` — **the canonical design state (components, property values/status, units, hashing, diff, templates, migrations).** Read before touching anything about designs.
- `docs/architecture/designs.md` — **designs, working copies (single writer, versioned saves) and immutable revisions (commit, restore, compare, integrity).**
- `docs/architecture/artifacts.md` — **artifact registry: scopes (built-in/org/private), immutable revisions, compatibility, built-in library sync.**
- `docs/architecture/operations.md` + `packages/design-operations/README.md` — **every draft change is a design operation (types, router, undo, single writer).**
- `docs/architecture/editor.md` + `packages/editor-core/README.md` — **the editor workspace: Zustand store, optimistic changes (`apply`), autosave batches, conflicts, server-side undo/redo.**
- `packages/garment-render/README.md` — **the 2D technical-flat renderer: coordinates (mm, origin CF neck), property→geometry mapping, placeholders, trims, `sceneToSvg`.**
- `docs/architecture/validation.md` — **design-structure validation: engine and constraint sets in garment-model, runs/findings API, staleness, editor panel. Never production readiness.**
- `docs/architecture/frontend-guidelines.md` — **web conventions (folders, API client, query keys, tokens, shortcuts).** Read before writing UI; for Next.js APIs read `apps/web/node_modules/next/dist/docs/`.

## Default behaviour when the human says "continue" (or runs /next-iteration)

1. `git pull`; check for uncommitted work.
2. Read `docs/plan/PROGRESS.md` → pick the `in_progress` iteration, else the lowest `todo` whose dependencies are `done`.
3. Read that iteration file fully + the spec sections it cites + relevant ADRs. Resolve any Open ADR (ask the human briefly, or apply the documented default and flag it).
4. Mark it `in_progress`, write a short plan in the session log, then build following the checklist.
5. Before the session ends: update PROGRESS.md (session log, next step), commit, push. When the iteration is complete, run the finish protocol (playbook §4).

## Non-negotiable rules

1. The structured garment model is the source of truth; images/SVG/3D are derived representations.
2. Revisions, approvals, released specs/exports, finalized usage, invoices, audit events are **immutable** — corrections create new records.
3. Never invent manufacturing facts. Values carry status `confirmed | inferred | proposed | missing | needs_review | not_applicable`; AI output is never auto-`confirmed`.
4. AI runs only on explicit user action, only via backend orchestration, only after entitlement/budget preflight. Provider credentials never reach the browser or logs.
5. Deny by default; every route declares a permission; server-side authorization; tenant isolation in DB, storage, cache, jobs, exports (404 for cross-tenant).
6. Durable Postgres records for every important async operation; idempotent retries; `outcome_unknown` is never treated as zero cost.
7. Respect module boundaries (no reading another module's tables); pure packages stay framework-free.
8. No real AI/payment/email calls in tests — use fakes. Never commit secrets or `.env`.
9. Keep `main` green (`pnpm verify`). Small commits: `feat(I07): …`.
10. Don't edit `docs/init/*`. Record deviations and decisions in `docs/plan`.

## Useful commands (available once the relevant iteration is done)

| Command                                    | Purpose                                              | From    |
| ------------------------------------------ | ---------------------------------------------------- | ------- |
| `pnpm install`                             | install workspace                                    | I01     |
| `pnpm dev`                                 | run web + api + worker                               | I01     |
| `pnpm verify`                              | lint + typecheck + unit tests                        | I01     |
| `pnpm infra:up` / `infra:down`             | start/stop Postgres, Redis, object store, Mailpit    | I02     |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Prisma migrations & seeds                            | I02/I03 |
| `pnpm test:integration`                    | integration tests against compose infra              | I02     |
| `pnpm logs` (`-f`, `--errors`, `api`)      | view local log files in `logs/` (git-ignored)        | ADR-036 |
| `pnpm api:openapi`                         | regenerate `docs/api/openapi.json` after API changes | I03     |
| `pnpm e2e` (`pnpm e2e:install` once)       | Playwright browser tests (`tests/e2e`)               | I04     |
