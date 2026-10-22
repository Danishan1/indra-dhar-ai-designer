# AI Designer — Implementation Plan

This folder is the **single source of truth for how the platform gets built**. It turns the requirement specifications in [`../init/`](../init/) into an ordered sequence of phases and iterations that Claude (on any machine, any account) can pick up and execute with almost no extra instruction.

> **To continue the build in a new session, say:**
> `Read CLAUDE.md and continue with the next iteration.`
> (In Claude Code you can also run the slash command `/next-iteration`.)

---

## 1. What we are building (one paragraph)

A self-hosted, web-based, AI-powered garment design and development platform. Apparel professionals start from a sketch, garment photo or fabric image, edit a **structured garment model** visually (components, properties, reusable artifacts such as sleeves/collars/lace), request AI generation deliberately, compare and approve **immutable design revisions**, and finally produce a **validated, versioned tech pack** for manufacturing. AI usage is metered and billed (platform-managed keys or customer-provided keys). Stack: TypeScript everywhere — Next.js + NestJS + PostgreSQL/Prisma + Redis/BullMQ + S3-compatible storage, in a pnpm/Turborepo monorepo, deployed with Docker Compose.

## 2. How this folder is organized

| File | Purpose | When to read |
|---|---|---|
| [`PROGRESS.md`](PROGRESS.md) | **Live tracker**: current iteration, status of every iteration, handoff notes | Start and end of every session |
| [`00-spec-digest.md`](00-spec-digest.md) | Condensed summary of all 11 spec documents + the non-negotiable invariants | First session on a new machine; whenever unsure about a rule |
| [`01-architecture.md`](01-architecture.md) | System architecture, monorepo layout, module ↔ subsystem map, core patterns | Before any backend/frontend structural work |
| [`02-conventions.md`](02-conventions.md) | Coding standards, IDs, API/error conventions, testing, git & commit rules, Definition of Done | Every session (skim) |
| [`03-domain-model.md`](03-domain-model.md) | Consolidated entity catalog, status vocabularies, ownership per module | Before writing Prisma schema or contracts |
| [`04-roadmap.md`](04-roadmap.md) | 10 phases, 49 iterations, dependencies, milestones | To understand sequencing |
| [`05-decisions.md`](05-decisions.md) | Architecture Decision Records: decided + open (with recommended defaults and deadline iteration) | Before an iteration that has an open decision |
| [`06-traceability.md`](06-traceability.md) | Spec requirement groups → iteration mapping | To check coverage / find where a requirement lands |
| [`07-environment-setup.md`](07-environment-setup.md) | Setting up a new machine (Windows/macOS/Linux), Docker, Node, pnpm, env vars | New machine or new contributor |
| [`08-session-playbook.md`](08-session-playbook.md) | Exact protocol a Claude session follows: start → plan → build → verify → hand off | Every session |
| [`09-backlog.md`](09-backlog.md) | Post-launch / deferred capabilities (branching, co-editing, pattern-linked 3D, SSO …) | When planning beyond I49 |
| [`claude-commands/`](claude-commands/) | Source for the Claude Code slash commands (`/next-iteration`, `/finish-iteration`, `/handoff`) — copy into `.claude/commands/` | Once per clone (I01 does it) |
| [`iterations/`](iterations/) | One file per iteration: goal, scope, deliverables, tasks, tests, acceptance criteria | The iteration you are working on |

## 3. The plan at a glance

| Phase | Name | Iterations | Milestone at end |
|---|---|---|---|
| 0 | Foundation & platform primitives | I01–I04 | **M1** Walking skeleton (web ↔ api ↔ worker ↔ db) |
| 1 | Identity, organizations & access | I05–I08 | **M2** Secure multi-tenant base |
| 2 | Core domain: assets, projects, garment model, revisions, artifacts | I09–I13 | — |
| 3 | Structured 2D editor | I14–I20 | **M3** Structured design editor alpha (no AI) |
| 4 | AI execution & metering foundation | I21–I27 | **M4** AI-assisted design alpha |
| 5 | Review, approval & notifications | I28–I29 | **M5** Review workflow |
| 6 | Subscription, billing & BYOK | I30–I34 | **M6** Commercial beta |
| 7 | Advanced visualization (server render, 3D) | I35–I37 | **M7** 2D/3D visualization |
| 8 | Tech pack & production specification | I38–I44 | **M8** Production-ready tech packs |
| 9 | Administration, observability, hardening, launch | I45–I49 | **M9** Production launch |

**Total: 49 iterations, estimated 85–115 Claude sessions** (most iterations take 1–3 sessions). See [`04-roadmap.md`](04-roadmap.md).

## 4. Golden rules (memorize these)

1. **Structured garment model is the source of truth.** Images, SVGs and 3D files are derived representations — never the design itself.
2. **Revisions, approvals, released tech packs, invoices and usage records are immutable.** Corrections create new records.
3. **Never invent manufacturing facts.** Every production-relevant value carries a status: `confirmed | inferred | proposed | missing | needs_review | not_applicable`.
4. **AI is invoked only by explicit user action**, always through the backend orchestration pipeline, and only after an entitlement/budget preflight.
5. **Deny by default; enforce on the server; isolate tenants everywhere** (DB, storage, cache, jobs, exports).
6. **Every important async operation has a durable Postgres record**; Redis/BullMQ is transport, not truth. Retries are idempotent.
7. **Keep subsystem boundaries** (modular monolith): modules talk through their public service interfaces/events, never each other's tables.
8. **Update `PROGRESS.md` before ending a session** and commit/push, so the next machine can continue.
