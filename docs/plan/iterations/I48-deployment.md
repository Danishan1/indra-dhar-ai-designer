# I48 — Production deployment, backups & runbooks

| Field                           | Value                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 9 — Administration, observability, hardening, launch                                                                                                                                                                                                                                                 |
| Subsystems                      | Infrastructure (all apps), SS-17 Observability                                                                                                                                                                                                                                                       |
| Depends on                      | I46 (observability); I47 recommended (ClamAV, retention)                                                                                                                                                                                                                                             |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                    |
| Spec references                 | `docs/init/11-tech-stack.md` §3.5, §3.6, §8, §10; `docs/init/09-specification.md` §14.1–14.2 (FR-SEC-164..172), NFR-SEC-010/011; `docs/init/06-project-lifecycle.md` NFR-PRJ-008; `docs/init/10-visualization.md` NFR-RV-015; `docs/plan/01-architecture.md` §7; `docs/plan/05-decisions.md` ADR-021 |
| Open decisions to resolve first | Hosting target (cloud/VPS provider undecided — TECH T-14); off-server backup destination (any S3-compatible bucket in another account/region); email provider (ADR-013); domain names                                                                                                                |

## 1. Goal

Ship the platform to a single Linux server using Docker Compose with production-grade defaults: immutable images, only Caddy exposed with automatic HTTPS, internal networks for data services, secrets outside git, health checks and restart policies, resource limits, migrations as an explicit step, log rotation, off-server backups with a **tested restore**, and runbooks so any machine/Claude session can operate it.

## 2. Scope

### In scope

- Multi-stage Dockerfiles for `api`, `web` (Next.js standalone output), `worker` (includes Chromium for PDF export, fonts, Sharp deps); non-root users; pinned base image digests; SBOM optional.
- `infra/compose/docker-compose.prod.yml`: `caddy`, `web`, `api`, `worker`, `postgres`, `redis`, `objectstore` (per ADR-021), `clamav`, optional `monitoring` profile; networks `edge` (caddy↔web/api) and `internal` (no published ports for data services) (TECH §8).
- Caddyfile: HTTPS (ACME), HTTP→HTTPS, security headers (from I47), request size limits, SSE-friendly proxy settings (no buffering), `/admin` optional IP allowlist, compression, static caching for `_next/static`.
- Secrets: Docker secrets / root-only `.env.prod` outside repo; `SECRETS_MASTER_KEY` via file; documented rotation (FR-SEC-164..169).
- Health checks + `restart: unless-stopped`; CPU/memory limits; Postgres tuning baseline; Redis persistence (AOF) + `maxmemory-policy noeviction` for BullMQ.
- Migration runbook: backup → `prisma migrate deploy` one-shot container → deploy → smoke test; rollback strategy (restore or forward-fix; never edit applied migrations).
- Backups: nightly `pg_dump` (custom format) + WAL-archiving optional, object-store mirror (rclone/mc mirror) to off-server bucket, retention (7 daily/4 weekly/6 monthly), encryption at rest, backup monitoring alert; **restore drill script** to a scratch environment verifying revision lineage, approvals and released exports integrity (NFR-PRJ-008, NFR-SEC-010).
- Log rotation (Docker json-file max-size/max-file), disk monitoring alert.
- Zero-to-prod bootstrap script: create server user, install Docker, clone, configure, seed platform data (no dev seed), create first platform operator.
- Staging environment option (same compose with different env) and deploy script `infra/scripts/deploy.sh` (+ PowerShell wrapper notes for the Windows dev machine).
- Runbooks in `docs/deployment/`: deploy, rollback, backup/restore, rotate secrets, scale worker to second machine, incident triage, certificate issues, disk full.

### Out of scope (deferred to)

- Kubernetes / multi-node orchestration, managed DB migration (→ backlog)
- CDN in front of assets (→ backlog; immutable asset keys already cache-friendly)

## 3. Deliverables

- `infra/docker/{api,web,worker}.Dockerfile`, `.dockerignore`
- `infra/compose/docker-compose.prod.yml`, `infra/compose/.env.prod.example`
- `infra/proxy/Caddyfile`
- `infra/scripts/{deploy.sh, migrate.sh, backup.sh, restore.sh, restore-drill.sh, bootstrap-server.sh, create-operator.ts}`
- `docs/deployment/{README.md, deploy.md, backup-restore.md, secrets.md, scaling-worker.md, incident-triage.md, environments.md}`

## 4. Data model changes

None (seed: platform-only seed path verified idempotent in prod mode).

## 5. API / contracts

- No new endpoints. `GET /v1/health` (liveness), `/v1/health/ready` (readiness) used by compose healthchecks; readiness not publicly exposed via Caddy.

## 6. UI

- None (optional maintenance page served by Caddy during deploy).

## 7. Implementation tasks (ordered checklist)

1. [ ] Record hosting/backup/email/domain decisions (or placeholders) in 05-decisions.md and PROGRESS.md.
2. [ ] Dockerfiles; build all images locally; image size & non-root checks.
3. [ ] Prod compose with networks, healthchecks, limits, volumes; verify no data-service port is published.
4. [ ] Caddyfile incl. SSE settings; test job progress through proxy.
5. [ ] Secrets handling & `.env.prod.example`; config validation fails fast on missing secrets.
6. [ ] Migration & deploy scripts; staging dry run.
7. [ ] Backup scripts + off-server sync + alert; restore drill script; run a full drill and record timings (RPO/RTO) in runbook.
8. [ ] Runbooks.
9. [ ] Deploy to staging (or a throwaway VPS) end-to-end; smoke test M8 scenario.
10. [ ] PROGRESS.md; tag `m9-rc`.

## 8. Tests

- Automated: container smoke test (compose up on CI-like local run → health → login → create project) ; port scan of host shows only 80/443 (+ SSH).
- Restore drill: restore latest backup into scratch stack; verify row counts, revision content hashes, released export checksums, and that a user can log in.
- Manual: certificate issuance, HTTP→HTTPS redirect, SSE through Caddy.

## 9. Acceptance criteria

- [ ] AC1 — Only the reverse proxy is public; Postgres/Redis/object store on internal network (TECH §8).
- [ ] AC2 — HTTPS, persistent volumes, env-specific config, secrets not in git, health checks, restart policies, resource limits, log rotation (TECH §8).
- [ ] AC3 — Migrations applied via documented, backed-up step (TECH §3.3).
- [ ] AC4 — Off-server backups automated, encrypted, monitored; restore drill passes and preserves lineage/approvals/releases (NFR-PRJ-008, NFR-SEC-010).
- [ ] AC5 — Worker can be moved to another machine using the scaling runbook (TECH §8).
- [ ] AC6 — Runbooks exist for deploy, rollback, backup/restore, secret rotation, incidents.

## 10. Risks & notes

- BullMQ needs Redis `noeviction`; don't share Redis with an LRU cache config.
- Chromium in worker image is large; keep it only in the worker image.
- Verify object-store licensing/maintenance status before choosing (ADR-021).
- Windows dev machine: deploy scripts run from the server or WSL; document both.

## 11. Handoff

- I49 runs load/E2E against staging built here. Record server specs, URLs (no secrets) and RPO/RTO in PROGRESS.md.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
