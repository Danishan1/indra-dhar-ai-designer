# 07 — Environment Setup (any machine)

Goal: a new machine (or a new Claude account on an existing machine) can go from `git clone` to a running dev environment in ~15 minutes. Versions marked _(I01)_ are pinned during I01 — check `PROGRESS.md` → "Environment facts" for the exact values.

---

## 1. Prerequisites

| Tool                       | Version                                                                                       | Notes                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Git                        | recent                                                                                        | Configure `core.autocrlf=false` (repo enforces LF via `.gitattributes`) |
| Node.js                    | Active LTS _(I01, see `.nvmrc`)_                                                              | Windows: install via **fnm** or **nvm-windows**; macOS/Linux: fnm/nvm   |
| pnpm                       | pinned in `package.json#packageManager` _(I01)_                                               | Enable with `corepack enable` (ships with Node)                         |
| Docker                     | Docker Desktop (Windows/macOS, WSL2 backend on Windows) or Docker Engine + Compose v2 (Linux) | Needed from I02 for Postgres, Redis, object storage, Mailpit            |
| Playwright browsers        | installed by `pnpm exec playwright install chromium`                                          | From I04 (E2E)                                                          |
| (optional) Claude Code CLI | latest                                                                                        | Auto-loads `CLAUDE.md` and `.claude/commands/`                          |

### Windows specifics (owner's primary machine)

- Keep the repo on a local NTFS drive (e.g. `D:\danishan\claude\indradhar\ai-designer-v2`); avoid OneDrive-synced folders (file locking breaks `node_modules`).
- Docker Desktop → Settings → Resources → give WSL2 ≥ 6 GB RAM (Postgres + Redis + object store + Chromium for PDF later).
- Use PowerShell or Git Bash; all repo scripts are cross-platform Node scripts (no bash-only scripts).
- Long paths: `git config --system core.longpaths true` (admin) if `node_modules` paths fail.

## 2. First-time setup (after I02 exists)

```bash
git clone <repo-url> ai-designer-v2
cd ai-designer-v2
corepack enable
pnpm install
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env
pnpm infra:up                   # compose up --wait + create S3 buckets
pnpm db:migrate                 # prisma migrate dev
pnpm db:seed                    # platform + dev seed data (demo org/users/projects)
pnpm dev                        # web :3000, api :4000, worker
pnpm verify                     # lint + typecheck + unit tests
```

Dev URLs: web http://localhost:3000 · API liveness http://localhost:4000/v1/health · readiness http://localhost:4000/v1/health/ready · Mailpit http://localhost:8025 · S3 (SeaweedFS) http://localhost:8333. OpenAPI document http://localhost:4000/v1/openapi.json (dev only; committed snapshot `docs/api/openapi.json`, regenerate with `pnpm api:openapi`).

| Service           | Dev port                                            | Test-profile port (`pnpm infra:test:up`) |
| ----------------- | --------------------------------------------------- | ---------------------------------------- |
| PostgreSQL 17     | 5432 (`aid` / `aid_dev_password`, db `ai_designer`) | 55432 (db `ai_designer_test`, tmpfs)     |
| Redis 7.4         | 6379                                                | 56379                                    |
| SeaweedFS S3      | 8333                                                | 58333                                    |
| Mailpit SMTP / UI | 1025 / 8025                                         | —                                        |

Useful commands: `pnpm infra:up` (also creates buckets) · `pnpm infra:down` · `pnpm infra:reset --yes` (deletes local data) · `pnpm infra:test:up` / `infra:test:down` · `pnpm test:integration` · `pnpm --filter @ai-designer/api dev:ping` (API→worker queue round trip).

Dev seed users (created in I05/I06 seeds; passwords only in `.env.example` defaults, never real): `owner@demo.local`, `designer@demo.local`, `approver@demo.local`, `billing@demo.local`, `viewer@demo.local`, plus a second org `other-org` for tenant-isolation testing.

### Using your own PostgreSQL (instead of the container)

If PostgreSQL is already installed on your machine (common on Windows, where it also occupies port 5432):

1. In `.env` set `INFRA_LOCAL_POSTGRES=true` and point `DATABASE_URL` at it, e.g. `postgresql://postgres:<password>@localhost:5432/ai_designer`.
2. For integration tests also set `AID_IT_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/ai_designer_test` (name must end in `_test`; it is created automatically and **wiped** by the tests).
3. `pnpm infra:up` then starts only Redis, object storage and Mailpit; `pnpm db:migrate` creates the dev database if needed.

### Logs

All apps write to the git-ignored `logs/` folder in development (`logs/api`, `logs/worker`, `logs/web`). View them with `pnpm logs` (`pnpm logs api -f`, `pnpm logs --errors`, `pnpm logs --clear`). Details: [`logs/README.md`](../../logs/README.md).

## 3. Environment variables

`.env.example` is the canonical list (each iteration appends what it introduces). Groups:

| Group                           | Examples                                                                                                                    | Introduced |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Core                            | `NODE_ENV`, `APP_BASE_URL`, `API_BASE_URL`, `API_PORT`, `WEB_PORT`                                                          | I01–I02    |
| Database                        | `DATABASE_URL`, `INFRA_LOCAL_POSTGRES`                                                                                      | I02        |
| API platform                    | `IDEMPOTENCY_TTL_HOURS`, `API_DEV_ROUTES`                                                                                   | I03        |
| Worker                          | `WORKER_CONCURRENCY_*`, `OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`, `OUTBOX_MAX_ATTEMPTS`, `JOB_*` (sweeper)            | I02–I03    |
| Logging                         | `LOG_LEVEL`, `LOG_PRETTY`, `LOG_TO_FILE`, `LOG_DIR`, `LOG_FILE_MAX_SIZE`, `LOG_FILE_RETENTION`, `CLIENT_LOGS_ENABLED`       | ADR-036    |
| Redis                           | `REDIS_URL`                                                                                                                 | I02        |
| Object storage                  | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_ASSETS`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`           | I02/I09    |
| Auth                            | `SESSION_SECRET`, `SESSION_IDLE_TIMEOUT_MIN`, `SESSION_ABSOLUTE_TIMEOUT_H`, `CSRF_SECRET`                                   | I05        |
| Email                           | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`                                                             | I05        |
| Secrets                         | `SECRETS_MASTER_KEY` (base64 32 bytes), `SECRETS_MASTER_KEY_VERSION`                                                        | I08/I22    |
| AI providers (platform-managed) | `AI_<PROVIDER>_API_KEY` — loaded into the encrypted secret store by a seed/admin step, never read directly by business code | I22        |
| Payments                        | `PAYMENT_PROVIDER`, `PAYMENT_<PROVIDER>_KEY_ID`, `PAYMENT_<PROVIDER>_SECRET`, `PAYMENT_WEBHOOK_SECRET`                      | I32        |
| Observability                   | `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                                               | I46        |

Rules: never commit `.env`; real provider keys only on machines that need them; tests use fakes and never need real keys.

## 4. Moving between machines

What travels via git: all code, migrations, seeds, docs, plan, `.env.example`.
What does **not** travel: `.env`, Docker volumes (DB rows, stored objects), `node_modules`, Playwright browsers.

Switching procedure:

1. On the old machine: run the handoff (`/handoff` or "do the handoff protocol"), make sure it pushed.
2. On the new machine: `git pull`, `pnpm install`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed`.
3. If you need the _same data_ (rare in dev): `pnpm db:dump` / `pnpm db:restore` scripts (added in I48; before that use `docker exec … pg_dump`). Do not commit dumps.

## 5. Resetting a broken local environment

```bash
pnpm infra:down -v   # removes volumes (destroys local dev data)
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm clean && pnpm install
```

## 6. Using Claude on a new machine/account

1. Clone the repo and open it in Claude Code (or attach the folder in Cowork).
2. Say: **"Read CLAUDE.md and continue with the next iteration."** (or `/next-iteration` in Claude Code).
3. Claude follows `docs/plan/08-session-playbook.md` and will tell you if it needs Docker running or a decision from you.
