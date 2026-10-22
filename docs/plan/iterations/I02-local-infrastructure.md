# I02 — Local infrastructure & backend base

| Field                           | Value                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 0 — Foundation & platform primitives                                                                                                   |
| Subsystems                      | Cross-cutting (infrastructure), SS-17 (logging base), SS-11 (storage connectivity only)                                                |
| Depends on                      | I01                                                                                                                                    |
| Estimated sessions              | 1–2                                                                                                                                    |
| Spec references                 | `docs/init/11-tech-stack.md` §3.3, §3.5, §3.6, §3.11, §8; `docs/plan/01-architecture.md` §1, §7; `docs/plan/02-conventions.md` §4, §7  |
| Open decisions to resolve first | **ADR-021** (S3-compatible store for dev/prod — verify MinIO licensing/maintenance; alternatives Garage, SeaweedFS), ADR-014 (logging) |

## 1. Goal

Give every machine an identical, one-command local environment (PostgreSQL, Redis, S3-compatible object storage, Mailpit) and wire the API and worker to it with validated configuration, structured logging, Prisma, and health checks. At the end, `pnpm infra:up && pnpm dev` produces an API that reports the health of all its dependencies and a worker connected to Redis.

## 2. Scope

### In scope

- `infra/compose/docker-compose.dev.yml` with services: `postgres` (pinned major), `redis`, `objectstore` (per ADR-021), `objectstore-init` (creates buckets), `mailpit`. Named volumes; ports bound to `127.0.0.1` only.
- `test` compose profile (separate DB name / ports or `tmpfs` volumes) used by integration tests.
- Root scripts: `infra:up`, `infra:down`, `infra:reset` (drops volumes, cross-platform), `db:migrate`, `db:generate`, `db:seed`, `db:studio`.
- `apps/api`: `@nestjs/config` with zod-validated env schema (fail fast), `nestjs-pino` JSON logging with redaction list, `X-Request-Id` propagation, Prisma module (`PrismaService` with graceful shutdown), first empty migration, `GET /v1/health` (liveness) and `GET /v1/health/ready` (checks Postgres, Redis, object storage).
- `apps/worker`: shared config schema, pino logger, ioredis connection, a BullMQ `system` queue with a `ping` processor (proves transport).
- `ObjectStorage` interface + S3 implementation skeleton (AWS SDK v3) with `headBucket` used by readiness (full asset service in I09).
- `.env.example` fully documented.

### Out of scope (deferred to)

- Outbox, idempotency, durable job records, contracts package (→ I03)
- Web shell (→ I04)
- Production compose, Caddy, backups (→ I48)
- OpenTelemetry (→ I46)

## 3. Deliverables

- `infra/compose/docker-compose.dev.yml`, `infra/compose/.env.compose.example`
- `infra/scripts/` Node-based helper scripts (`reset-infra.mjs`, `wait-for.mjs`)
- `apps/api/prisma/schema.prisma` (datasource, generator, `@@map` conventions note), `apps/api/prisma/migrations/` (initial migration)
- `apps/api/src/platform/config/` (env schema, typed `AppConfig`)
- `apps/api/src/platform/logging/` (pino setup, redaction paths)
- `apps/api/src/platform/prisma/` (PrismaModule/PrismaService)
- `apps/api/src/platform/health/` (liveness + readiness controller)
- `apps/api/src/platform/storage/object-storage.ts` (interface + S3 impl skeleton)
- `apps/worker/src/{config,logger,queues/system.ts}`
- `docs/plan/07-environment-setup.md` updated if commands differ from plan

## 4. Data model changes

- Initial Prisma migration (empty schema or a `schema_meta` table recording schema version). Conventions comment block in `schema.prisma`: snake_case `@@map`/`@map`, `uuid` ids, `timestamptz`.

## 5. API / contracts

| Method & path          | Permission                                                        | Purpose                                    |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| `GET /v1/health`       | public                                                            | Liveness (process up)                      |
| `GET /v1/health/ready` | public (no dependency details beyond `ok/degraded` per component) | Readiness: Postgres, Redis, object storage |

Events: none. Queues: `system` (BullMQ) with `ping` job.

## 6. UI

None (web shell is I04).

## 7. Implementation tasks (ordered checklist)

1. [x] Resolve ADR-021: check current licensing/maintenance of MinIO community edition vs Garage/SeaweedFS; choose dev image; record decision & date in `05-decisions.md`.
2. [x] Write compose file with healthchecks; bind ports to localhost; pin image tags (no `latest`).
3. [x] Bucket bootstrap container/script: buckets `assets-original`, `assets-derived`, `exports` (private).
4. [x] Root scripts (cross-platform Node scripts, no bash-only commands).
5. [x] API env schema (zod): `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `SMTP_URL`, `LOG_LEVEL`, `APP_BASE_URL`. Boot fails with a readable error listing invalid keys.
6. [x] Logging: `nestjs-pino`, request id middleware (accept inbound `X-Request-Id` if valid UUID else generate), redaction for `req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.apiKey`, `*.secret`, `*.token`.
7. [x] Prisma init, initial migration, `PrismaService` with shutdown hooks.
8. [x] Health/readiness controller with per-dependency timeouts (≤1s each).
9. [x] Worker: config, logger, ioredis, BullMQ `system` queue; API enqueues `ping` from a dev-only script; worker logs completion.
10. [x] Integration test harness: `vitest.integration.config.ts` that expects compose `test` profile; helper to reset DB between suites.
11. [x] Update `.env.example`, README quick start, `PROGRESS.md`.

## 8. Tests

- Unit: env schema rejects missing/invalid values; redaction config masks listed paths (log a fake object and assert output).
- Integration: readiness returns `ok` when infra is up; returns `degraded` with Redis stopped (simulate by wrong URL); Prisma connects; S3 `headBucket` succeeds; BullMQ ping round-trip completes within 5s.
- Manual: `pnpm infra:up`, `pnpm dev`, open `/v1/health/ready`; Mailpit UI reachable on localhost.

## 9. Acceptance criteria

- [ ] AC1 (⚠ pending owner verification on Windows — Docker Hub is unreachable from the build sandbox; compose file validated with `docker compose config`) — `pnpm infra:up` brings up all services healthy on Windows (Docker Desktop/WSL2) and Linux/macOS.
- [x] AC2 — API refuses to start on invalid configuration with an explicit message (TECH §8 environment-specific configuration).
- [x] AC3 — Readiness endpoint reports each dependency; database/Redis/object-store ports are not exposed beyond localhost (TECH §8 "Do not expose database ports").
- [x] AC4 — Logs are JSON, include `requestId`, and never contain values of redacted keys (TECH §3.11).
- [x] AC5 — Worker processes a BullMQ job enqueued by the API side.
- [x] AC6 — `pnpm test:integration` runs against the compose `test` profile and passes.

## 10. Risks & notes

- Docker Desktop on Windows: volume performance and line endings — keep data in named volumes, not bind mounts.
- Do not let the readiness endpoint leak hostnames/credentials.
- The object store choice must stay behind the `ObjectStorage` interface (TECH §3.6: swap without changing domain model).
- Keep Redis non-persistent assumptions explicit: nothing important may live only in Redis (TECH §3.5).

## 11. Handoff

- I03 builds on `PrismaService`, logger, config, and the BullMQ connection.
- I09 builds on `ObjectStorage`.
- Record chosen object store + image versions in `PROGRESS.md` and `07-environment-setup.md`.

## 12. Completion record

- Completed on: 2026-10-22
- Sessions used: 1
- Deviations from plan:
  - ADR-021: SeaweedFS chosen (MinIO community edition no longer published). Buckets are created by `pnpm infra:up` → `storage:init` (Node/AWS SDK) instead of an init container. Bucket names: `aid-assets-original`, `aid-assets-derived`, `aid-exports` (env-configurable).
  - `@nestjs/config` not used (ADR-035): zod-validated `AppConfig` built in `main.ts` before Nest boots and registered via `AppConfigModule.forRoot`.
  - Prisma 7 (ADR-034): `prisma.config.ts`, ESM `prisma-client` generator → `src/generated/prisma` (git-ignored), pg driver adapter. Migration folder naming follows Prisma's default `YYYYMMDDHHMMSS_i02_init` (conventions updated).
  - `packages/contracts` was created now (queue names + ping payload schemas shared by api and worker) instead of in I03; I03 extends it.
  - Env var names: `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (as in 07-environment-setup), `SMTP_URL`, plus `LOG_PRETTY`, `S3_BUCKET_*`, `WORKER_CONCURRENCY_SYSTEM`.
  - Turbo `envMode: loose`; root `test:integration` runs with `--concurrency=1`.
  - Integration tests force the test-profile endpoints (never the dev DB; override with `AID_IT_<KEY>`), reset the test schema and apply migration SQL directly in a global setup.
  - Sandbox tooling added for cloud sessions: `infra/scripts/cloud-sandbox-infra.sh`, `infra/scripts/prisma-wasm-fallback.mjs` (`pnpm db:migrate:fallback`).
  - Worker readiness/ping verified with `pnpm --filter @ai-designer/api dev:ping`.
- Verification: `pnpm verify` 16/16 tasks green; `pnpm test:integration` — api 10 tests (health ok + degraded/503, request id, no leakage, S3 round trip, Prisma, queue) and worker 1 round-trip test green; manual `pnpm dev` + `/v1/health/ready` ok + dev:ping answered.
- Follow-ups added to backlog: none. Owner to run `pnpm infra:up` once on Windows to confirm AC1.
