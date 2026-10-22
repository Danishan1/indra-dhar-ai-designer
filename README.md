# AI Designer — AI-Powered Garment Design & Development Platform

Self-hosted web platform for apparel professionals: start from a sketch, photo or fabric; edit a structured garment model visually; generate and refine designs with AI; approve immutable revisions; and produce validated, versioned tech packs.

**Status:** implementation in progress — see [`docs/plan/PROGRESS.md`](docs/plan/PROGRESS.md).

## Quick start

Prerequisites: Node.js 24 LTS (22.12+ works), Corepack, Git. Details: [`docs/plan/07-environment-setup.md`](docs/plan/07-environment-setup.md).

```bash
corepack enable
pnpm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
pnpm dev                    # web http://localhost:3000 · api http://localhost:4000/v1/health · worker
pnpm verify                 # lint + typecheck + unit tests
```

| Script          | Purpose                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`      | Run web, api and worker in watch mode                                                               |
| `pnpm build`    | Build all apps                                                                                      |
| `pnpm verify`   | Lint (zero warnings) + typecheck + tests — must be green before every commit                        |
| `pnpm format`   | Prettier                                                                                            |
| `pnpm logs`     | View local log files (`logs/`, git-ignored) — `pnpm logs api -f`, `pnpm logs --errors`              |
| `pnpm infra:up` | Start Postgres/Redis/S3/Mailpit containers (`INFRA_LOCAL_POSTGRES=true` to use your own PostgreSQL) |

## Repository layout

```
apps/web       Next.js web app
apps/api       NestJS API (modular monolith)
apps/worker    background worker
packages/config  shared TS / ESLint / Prettier / Vitest config
docs/init      original requirement specifications
docs/plan      implementation plan, progress tracker, decisions
```

## Working with Claude

Read [`CLAUDE.md`](CLAUDE.md). To continue the build, say: _"Read CLAUDE.md and continue with the next iteration."_ (or `/next-iteration` in Claude Code).
