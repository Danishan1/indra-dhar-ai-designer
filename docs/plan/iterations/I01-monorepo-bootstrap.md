# I01 — Monorepo bootstrap & tooling

| Field                           | Value                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 0 — Foundation & platform primitives                                                                                |
| Subsystems                      | Cross-cutting (build tooling)                                                                                       |
| Depends on                      | — (first iteration)                                                                                                 |
| Estimated sessions              | 1                                                                                                                   |
| Spec references                 | `docs/init/11-tech-stack.md` §2, §3.10, §4; `docs/plan/01-architecture.md` §3; `docs/plan/02-conventions.md` §1, §9 |
| Open decisions to resolve first | ADR-022 (Node LTS version — verify current Active LTS)                                                              |

## 1. Goal

Create a clean, reproducible pnpm + Turborepo TypeScript monorepo with three runnable app skeletons (`web`, `api`, `worker`), shared tooling configuration, and git hygiene, so every later iteration can add code without revisiting build setup. Anyone cloning the repo on any machine runs `pnpm install && pnpm dev` and gets three processes starting.

## 2. Scope

### In scope

- Root workspace: `package.json` (with `packageManager`, `engines`), `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.editorconfig`, `.gitattributes` (LF), `.gitignore`, `.env.example`, `README.md` (extend the existing minimal one).
- `packages/config`: shared `tsconfig` bases (`base`, `node`, `nextjs`, `library`), ESLint flat config (TS, import order, boundary rules), Prettier config, Vitest preset.
- `apps/web`: Next.js (App Router, TS strict) "hello" page.
- `apps/api`: NestJS app with a `GET /v1/health` returning `{ status: "ok", version }`.
- `apps/worker`: Node TS entrypoint that boots and logs "worker ready" (no BullMQ yet — I02).
- Turborepo tasks: `dev`, `build`, `lint`, `typecheck`, `test`, `format`, `clean`.
- One trivial Vitest test in each app and in `packages/config` (sanity) so `pnpm test` is meaningful.
- Dependency-boundary lint rule skeleton (packages may not import apps; pure packages may not import react/nestjs/prisma).

### Out of scope (deferred to)

- Docker Compose infrastructure, Prisma, Redis (→ I02)
- Contracts package, error envelope, outbox (→ I03)
- Tailwind/shadcn and app shell (→ I04)
- CI pipeline on a hosted service (optional; can be added any time — local `pnpm verify` script is the gate)

## 3. Deliverables

- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.editorconfig`, `.gitattributes`, `.gitignore`, `.env.example`
- `packages/config/{tsconfig/*.json, eslint/index.js, prettier/index.js, vitest/preset.ts, package.json}`
- `apps/web/` (Next.js), `apps/api/` (NestJS), `apps/worker/` (Node)
- Root script `pnpm verify` = lint + typecheck + test
- `README.md` with quick-start (link to `docs/plan/07-environment-setup.md`)

## 4. Data model changes

None.

## 5. API / contracts

| Method & path    | Permission                                               | Purpose  |
| ---------------- | -------------------------------------------------------- | -------- |
| `GET /v1/health` | `@Public()` (decorator introduced in I07; for now plain) | Liveness |

## 6. UI

- `apps/web` root page showing product name "AI Designer" and a placeholder. (Real shell in I04.)

## 7. Implementation tasks (ordered checklist)

1. [x] Install the project slash commands: copy `docs/plan/claude-commands/*-*.md` into `.claude/commands/` (see that folder's README) and commit them.
2. [x] Verify current Node Active LTS (ADR-022) and pnpm stable; record exact versions in `.nvmrc`, `engines`, `packageManager`; update ADR-022 status to Accepted.
3. [x] Create root workspace files; `.gitattributes` with `* text=auto eol=lf` (keep `docs/init/*.md` as-is: add `docs/init/** -text` or `linguist-documentation` as needed so CRLF originals are not rewritten).
4. [x] `.gitignore`: node_modules, .next, dist, coverage, .turbo, .env*, !.env.example, *.log, infra volumes, playwright reports, `.DS_Store`.
5. [x] `packages/config` with tsconfig bases (strict, `noUncheckedIndexedAccess`), ESLint flat config (typescript-eslint, import plugin, boundary rules), Prettier.
6. [x] Scaffold `apps/api` (NestJS, no CLI-generated e2e boilerplate clutter), `/v1` global prefix, health controller, Vitest instead of Jest.
7. [x] Scaffold `apps/web` (Next.js App Router, src dir, TS strict), extending shared configs.
8. [x] Scaffold `apps/worker` (tsx for dev, tsup or tsc for build).
9. [x] Turborepo pipeline with caching; `pnpm dev` runs all three (api on :4000, web on :3000 by default — document ports).
10. [x] Add trivial tests; make `pnpm verify` pass.
11. [x] Update root `README.md` quick start; update `PROGRESS.md`.

## 8. Tests

- Unit: health controller returns ok; worker bootstrap function resolves; config package exports valid configs.
- Manual: `pnpm dev` → open http://localhost:3000 and http://localhost:4000/v1/health.

## 9. Acceptance criteria

- [x] AC1 — Fresh clone + `pnpm install` + `pnpm verify` passes on a clean machine (Windows and Linux/macOS paths both work; no OS-specific scripts).
- [x] AC2 — `pnpm dev` starts web, api, worker concurrently; health endpoint responds.
- [x] AC3 — TS strict mode active in all workspaces; ESLint + Prettier configured from `packages/config`.
- [x] AC4 — A lint rule fails if a file under `packages/` imports from `apps/`.
- [x] AC5 — No secrets or env files committed; `.env.example` documents ports.

## 10. Risks & notes

- Keep dependencies minimal (TECH principle 10). Don't add UI libraries yet.
- Use cross-platform scripts only (no `rm -rf`; use `rimraf` or Node scripts) — the owner develops on Windows.
- NestJS default uses Jest; switch to Vitest (with `unplugin-swc` or equivalent for decorators) now so all workspaces share one test runner.

## 11. Handoff

- I02 needs: api and worker apps that can receive config; root scripts to add `infra:up` / `infra:down`.
- Record exact Node/pnpm versions in `PROGRESS.md` and `07-environment-setup.md`.

## 12. Completion record

- Completed on: 2026-10-22
- Sessions used: 1
- Deviations from plan:
  - Toolchain (ADR-022): pnpm 10.34.7, TypeScript 6.0.3 (TS 7 unsupported by typescript-eslint), NestJS 12 which is **ESM-only** → `apps/api` is `"type": "module"` with NodeNext resolution and `.js` relative import suffixes; Nest CLI (`nest start --watch`) used for dev because tsx/esbuild cannot emit decorator metadata; Vitest uses `unplugin-swc` for the same reason.
  - Boundary rules implemented with ESLint `no-restricted-imports` (`packageBoundaries`, `purePackageBoundaries` exports in `packages/config/eslint`) instead of an extra plugin; proven by `packages/config/test/boundaries.test.ts`.
  - `pnpm verify` runs ESLint with `--max-warnings=0`.
  - Slash commands installed into `.claude/commands/` from `docs/plan/claude-commands/`.
  - Build/test was done in the cloud workspace and source synced to the owner's folder (see playbook §5 "Remote sessions").
- Follow-ups added to backlog: none
