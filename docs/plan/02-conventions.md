# 02 — Engineering Conventions

These conventions apply to every iteration. If an iteration needs to deviate, record an ADR in [`05-decisions.md`](05-decisions.md) and note it in `PROGRESS.md`.

---

## 1. Language & tooling

- **TypeScript strict** everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` where practical).
- **Node.js LTS** (pinned in `.nvmrc` and `package.json#engines`; see ADR-022), **pnpm** via Corepack (pinned in `packageManager`), **Turborepo** pipelines: `build`, `dev`, `lint`, `typecheck`, `test`, `test:integration`, `e2e`.
- ESLint (flat config) + Prettier; `import` ordering; dependency-boundary rules (see `01-architecture.md` §3).
- **Vitest** for unit/integration tests in all packages and apps; **Playwright** for browser E2E.
- Line endings: LF (enforced by `.gitattributes`). The original docs in `docs/init` have CRLF — leave them as is.

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `design-revision.service.ts` |
| Classes / types | PascalCase | `DesignRevision`, `CommitRevisionCommand` |
| Variables / functions | camelCase | `commitRevision()` |
| DB tables (Prisma `@@map`) | snake_case plural | `design_revisions` |
| DB columns (Prisma `@map`) | snake_case | `organization_id` |
| Prisma models | PascalCase singular | `DesignRevision` |
| Enums (DB + TS) | SCREAMING_SNAKE values when lifecycle states from specs use them (`ACTIVE`), otherwise snake_case string unions mirroring the spec vocabulary (`confirmed`, `outcome_unknown`) — **use the exact spelling from the spec** |
| Permissions | `<resource>.<action>` | `techpack.release` |
| Events | `PastTense` domain names or dotted names from spec | `RevisionCommitted`, `ai.job.completed` |
| Error codes | SCREAMING_SNAKE | `CONCURRENT_MODIFICATION` |
| REST paths | plural nouns, kebab-case | `/v1/projects/{projectId}/designs` |
| Env vars | SCREAMING_SNAKE, prefixed by app when app-specific | `API_DATABASE_URL`, `WORKER_CONCURRENCY_AI` |

## 3. Identifiers (ADR-001)

- **Primary keys**: UUIDv7 (time-ordered) generated in the app (`uuidv7` package). Column `id uuid`.
- **Human-readable display IDs** where the specs show them (`PRJ-000123`, `DSN-000456`, `DSN-000456-R003`, `SLV-0007-R004`, `JOB-000987`, `TPS-000184-R03`): stored in a `display_id` column, unique per organization, generated from a per-org sequence table (`id_sequences`). Never used as foreign keys.
- APIs accept the UUID `id`; display IDs are for humans, exports and search.
- Component IDs inside a garment snapshot are stable strings (e.g. `cmp_` + nanoid) that survive across revisions of the same design.

## 4. Backend (NestJS) conventions

- One folder per module: `module.ts`, `controller(s)`, `service.ts` (public facade), `repository.ts` (Prisma access, private), `dto/` (re-exporting zod schemas from `packages/contracts`), `events.ts`, `__tests__/`.
- Controllers are thin: validate (zod) → authorize (decorator + explicit resource check) → call service → map response.
- Services own transactions (`prisma.$transaction`) and write outbox events inside them.
- **Never** read another module's tables. Call its service or consume its events.
- All list endpoints: cursor pagination (`?cursor=&limit=` max 100), stable sort, filter params validated.
- Timestamps: `timestamptz`, UTC, ISO-8601 in JSON.
- Money: integer minor units (`amountMinor`) + ISO 4217 `currency`; never floats. Rates with high precision use `Decimal` (Prisma `Decimal`) and documented rounding.
- Physical dimensions: canonical **millimetres** (ADR-020) with explicit `unit` on every value; conversions in `garment-model/units`.
- Logging: `nestjs-pino`, JSON, includes `requestId`, `organizationId`, `principalId`; redaction list for `authorization`, `cookie`, `password`, `apiKey`, `secret`, `token`.
- Config: `@nestjs/config` + zod-validated env schema; app fails to boot on invalid config.

## 5. API conventions

- Base path `/v1`. JSON only. OpenAPI generated at build (`docs/api/openapi.json` snapshot committed and diffed in CI/tests).
- Request validation via zod schemas from `packages/contracts` (ADR-002).
- Headers: `Idempotency-Key` (mutations that may be retried), `If-Match`/`expectedVersion` body field for concurrency, `X-Request-Id` echoed.
- Error envelope: `{ "error": { "code": "…", "message": "…", "details": {…}, "requestId": "…" } }`.
- Error codes live in `packages/contracts/src/errors.ts`. I03 seeds the base set; **each iteration adds the codes it needs in the same change** (e.g. `NO_CHANGES` I12, `SEPARATION_OF_DUTIES_VIOLATION` I28, `CREDENTIAL_INVALID` I33).
- Status codes: 400 validation, 401 unauthenticated, 403 forbidden (when existence is already known to caller), **404 for inaccessible cross-tenant resources**, 409 conflicts/state transitions, 422 business-rule violations, 429 rate/quota, 503 dependency unavailable.
- SSE endpoint per job/subscription: `GET /v1/jobs/{jobId}/events` (auth checked on connect and per event payload scope).

## 6. Frontend conventions

- Feature folders under `apps/web/src/features/<feature>`; shared UI in `components/ui` (shadcn generated, then owned).
- Server state only through TanStack Query hooks in `features/*/api.ts`; query keys include `organizationId`.
- Forms: React Hook Form + zod resolver using the same contract schemas as the API.
- Accessibility: every interactive element has an accessible name; no color-only status; keyboard shortcuts disabled while typing in inputs.
- Status vocab badges (`confirmed`, `inferred`, …) use one shared `<ValueStatusBadge>` component.
- Never put secrets, provider names of customer keys, or raw prompts in client state.

## 7. Database & migrations

- Prisma schema at `apps/api/prisma/schema.prisma` (may be split with `prismaSchemaFolder` per module).
- Every migration is reviewed (read the SQL) before committing. Name: `YYYYMMDDHHMM_<iteration>_<summary>` e.g. `202611011200_i12_design_revisions`.
- Tenant tables have `organization_id uuid not null` + index; composite uniques include it.
- Immutability triggers for revision/ledger tables (raw SQL in migration).
- Seed scripts (`prisma/seed/`) are idempotent and split: `platform` (permissions, roles, plans, built-in artifacts, templates) vs `dev` (demo org/users/projects).

## 8. Testing strategy

| Level | Tooling | Must cover |
|---|---|---|
| Unit | Vitest | Pure packages (garment-model, operations, editor-core, techpack-model, pricing), services with mocked repos |
| Integration | Vitest + real Postgres/Redis/MinIO (docker compose `test` profile) | Repositories, transactions, outbox, idempotency, authorization, tenant isolation, job state machines, billing idempotency |
| Contract | Vitest | AI provider adapters against fixtures; OpenAPI snapshot diff |
| E2E | Playwright | Critical user journeys per milestone |
| Security | Vitest integration | Cross-tenant ID fuzzing, privilege escalation, secret redaction in logs |

Rules:
- Every iteration adds tests for its acceptance criteria. Bug fix ⇒ regression test.
- Fake AI adapter (`packages/test-utils/fake-ai-adapter`) is used in all automated tests — **no real provider calls in CI**.
- Tests must be runnable on any machine with `pnpm test` (unit) and `pnpm test:integration` (needs `pnpm infra:up`).

## 9. Git workflow

- Default branch `main`. Work per iteration on `iter/I07-authorization` (optional for solo, recommended when using multiple machines).
- **Commit early, push before ending every session** (other machines depend on it).
- Conventional commits with iteration tag: `feat(I07): add permission catalog and authz guard`, `fix(I12): …`, `docs(plan): update progress after I07`, `chore(I01): …`, `test(I07): …`.
- Commit trailer when Claude authored the change (per session instructions).
- Never commit: `.env*` (except `.env.example`), secrets, generated build output, local DB dumps, uploaded user files.
- Tag milestones: `m1-walking-skeleton`, `m2-secure-base`, …

## 10. Definition of Done (per iteration)

An iteration is **Done** only when all are true:

1. All acceptance criteria in the iteration file pass (automated where feasible; manual checks listed in `PROGRESS.md`).
2. `pnpm lint && pnpm typecheck && pnpm test` pass; `pnpm test:integration` passes if the iteration touched backend.
3. New endpoints have permission declarations, zod validation, OpenAPI docs, and tenant-isolation tests.
4. Migrations reviewed; seeds updated; `.env.example` updated for new config.
5. No secrets in logs/code; no TODOs without a linked backlog note.
6. Docs updated: iteration "Completion record" section filled; `PROGRESS.md` updated (status, notes, deviations, next iteration); new/closed decisions in `05-decisions.md`.
7. Work committed and pushed.

## 11. Things Claude must never do in this repo

- Call a real AI provider, payment provider, or send real email from tests.
- Mark AI-inferred values as `confirmed`.
- Mutate an immutable record (revision snapshot, approval, released spec/export, finalized usage/invoice) — create a new one.
- Skip authorization because "the UI hides the button".
- Add a new infrastructure dependency (DB, queue, service) without an ADR.
- Delete or rewrite `docs/init/*` (they are the requirements baseline).
