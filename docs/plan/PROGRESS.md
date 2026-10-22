# PROGRESS — Live Build Tracker

> Update this file at the **start** (mark in_progress) and **end** (handoff/finish) of every session. Commit + push it. See [`08-session-playbook.md`](08-session-playbook.md).

## Current pointer

| Field | Value |
|---|---|
| **Current iteration** | **I01 — Monorepo bootstrap & tooling** (not started) |
| Status | `todo` |
| Branch | `main` |
| Last updated | 2026-10-22 (planning session) |
| Blockers | None. Owner input welcome on ADR-006 (auth library), ADR-008 (initial garment categories), ADR-009 (AI providers), ADR-010 (payment provider), ADR-011 (credits), ADR-021 (object storage) — defaults exist. |

## Status legend
`todo` · `in_progress` · `blocked` · `done` · `skipped` (with reason)

## Iteration status

| ID | Iteration | Phase | Status | Started | Done | Sessions | Notes |
|---|---|---|---|---|---|---|---|
| I01 | Monorepo bootstrap & tooling | 0 | todo | | | | |
| I02 | Local infrastructure & backend base | 0 | todo | | | | Decide ADR-021 |
| I03 | Platform primitives | 0 | todo | | | | |
| I04 | Web app shell & design system | 0 | todo | | | | → M1 |
| I05 | Accounts & authentication | 1 | todo | | | | Decide ADR-006 |
| I06 | Organizations, memberships & invitations | 1 | todo | | | | |
| I07 | Authorization engine & tenant isolation | 1 | todo | | | | |
| I08 | MFA, step-up, sessions & security audit | 1 | todo | | | | → M2 |
| I09 | Asset & storage service | 2 | todo | | | | |
| I10 | Projects & lifecycle core | 2 | todo | | | | |
| I11 | Canonical garment model package | 2 | todo | | | | Confirm ADR-008 |
| I12 | Designs, working copies & immutable revisions | 2 | todo | | | | |
| I13 | Artifact registry & built-in library | 2 | todo | | | | |
| I14 | Design operation router (deterministic) | 3 | todo | | | | |
| I15 | Editor shell, editor-core & autosave | 3 | todo | | | | |
| I16 | Parametric 2D garment renderer (SVG) | 3 | todo | | | | |
| I17 | Hierarchy, selection & contextual properties | 3 | todo | | | | |
| I18 | Artifact browser & structured attachment | 3 | todo | | | | |
| I19 | Revision history, commit & comparison UI | 3 | todo | | | | |
| I20 | Design validation engine & findings UI | 3 | todo | | | | → M3 |
| I21 | Generation job management & progress (SSE) | 4 | todo | | | | |
| I22 | AI provider registry, credentials & adapters | 4 | todo | | | | Decide ADR-009 |
| I23 | Prompt & request compilation, routing | 4 | todo | | | | |
| I24 | Usage metering & entitlement preflight | 4 | todo | | | | Default ADR-011 |
| I25 | AI generation in the editor | 4 | todo | | | | |
| I26 | Design initiation from sketch/photo/fabric | 4 | todo | | | | |
| I27 | Region tools, annotations & targeted edits | 4 | todo | | | | → M4 |
| I28 | Review & approval workflow | 5 | todo | | | | |
| I29 | Notifications | 5 | todo | | | | → M5 |
| I30 | Plans, subscriptions, entitlements & budgets | 6 | todo | | | | Confirm ADR-011 |
| I31 | Pricing, charges & invoices | 6 | todo | | | | |
| I32 | Payment integration & subscription lifecycle | 6 | todo | | | | Decide ADR-010 |
| I33 | Customer-provided API credentials (BYOK) | 6 | todo | | | | |
| I34 | Reconciliation & financial operations | 6 | todo | | | | → M6 |
| I35 | Server render pipeline, manifests, cache & exports | 7 | todo | | | | |
| I36 | Interactive 3D viewer | 7 | todo | | | | |
| I37 | 2D/3D component linking & material sync | 7 | todo | | | | → M7 |
| I38 | Production specification core & BOM | 8 | todo | | | | |
| I39 | Measurements, POMs, tolerances & grading | 8 | todo | | | | |
| I40 | Construction, colorways, artwork, labels & quality | 8 | todo | | | | |
| I41 | Specification validation & production readiness | 8 | todo | | | | |
| I42 | Tech pack export | 8 | todo | | | | |
| I43 | Spec review, release, change impact & supplier access | 8 | todo | | | | |
| I44 | AI-assisted specification drafting | 8 | todo | | | | → M8 |
| I45 | Platform administration console | 9 | todo | | | | |
| I46 | Observability & audit tooling | 9 | todo | | | | |
| I47 | Security hardening, API tokens, export & deletion | 9 | todo | | | | |
| I48 | Production deployment, backups & runbooks | 9 | todo | | | | |
| I49 | Release hardening | 9 | todo | | | | → M9 |

## Milestones

| Milestone | Status | Date | Tag |
|---|---|---|---|
| M1 Walking skeleton | todo | | `m1-walking-skeleton` |
| M2 Secure multi-tenant base | todo | | `m2-secure-base` |
| M3 Structured editor alpha | todo | | `m3-editor-alpha` |
| M4 AI-assisted design alpha | todo | | `m4-ai-alpha` |
| M5 Review workflow | todo | | `m5-review` |
| M6 Commercial beta | todo | | `m6-commercial-beta` |
| M7 Visualization | todo | | `m7-visualization` |
| M8 Production tech packs | todo | | `m8-techpacks` |
| M9 Launch | todo | | `m9-launch` |

## Environment facts (fill in as decided)

| Item | Value |
|---|---|
| Node.js | _set in I01_ |
| pnpm | _set in I01_ |
| Ports | web 3000 · api 4000 · postgres 5432 · redis 6379 · object store 9000/9001 · mailpit 8025 (confirm in I02) |
| Object store | _ADR-021, set in I02_ |
| Auth library | _ADR-006, set in I05_ |
| AI providers | _ADR-009, set in I22_ |
| Payment provider | _ADR-010, set in I32_ |

## Decisions awaiting owner review
_(Claude lists here any Open ADR it resolved with a default while the owner was unavailable.)_
- none yet

## Deviations from plan
_(date — iteration — what changed — why — ADR link)_
- none yet

## Session log
_Newest first. One entry per session. Keep entries short but sufficient for another machine to resume._

### 2026-10-22 — Planning session (no code)
- Analyzed all 11 documents in `docs/init/` and produced `docs/plan/` (architecture, conventions, domain model, roadmap with 49 iterations, decision log, traceability, playbook, environment setup, backlog) plus `CLAUDE.md` and slash-command sources in `docs/plan/claude-commands/` (`.claude/` could not be written remotely; I01 installs them).
- Found: `docs/init/02-subsystem-breakdown.md` duplicates `08-tech-pack.md`; ARCH-GDP-002 (subsystem breakdown) is missing — subsystem map reconstructed in `01-architecture.md` §2.
- **Next step:** start I01 (`docs/plan/iterations/I01-monorepo-bootstrap.md`).
