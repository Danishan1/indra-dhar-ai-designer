# I10 — Projects & lifecycle core

| Field                           | Value                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 2 — Core domain                                                                                                                                                                                                                                                                 |
| Subsystems                      | SS-02 Project Lifecycle                                                                                                                                                                                                                                                         |
| Depends on                      | I07                                                                                                                                                                                                                                                                             |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                               |
| Spec references                 | `docs/init/06-project-lifecycle.md` §6.1, §7.1, §7.5, §8.1 (FR-PRJ-001…008), §8.2 (FR-PRJ-009…013), §8.9 (FR-PRJ-083…092), §8.10, §12, §13.1, §14, §15, §17 (AC-001, AC-012); `docs/init/01-overview.md` FR-020, FR-021; `docs/init/09-specification.md` §12.1 (FR-SEC-106…108) |
| Open decisions to resolve first | none                                                                                                                                                                                                                                                                            |

## 1. Goal

Users can create, rename, organize, list, search, put on hold, complete, reopen, archive, restore and (logically) delete garment projects inside their organization, with explicit project lifecycle state transitions, audit events, optimistic concurrency on metadata, project-level access grants, and a project dashboard UI. Designs inside projects come in I12.

## 2. Scope

### In scope

- `Project` aggregate: display id (`PRJ-000123`), name, status (`ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`, `DELETED`), metadata JSONB (product category, season, brand, target market, style number, tags), `default_design_id` (nullable now), version.
- State machine per SPEC-006 §7.5 implemented as an explicit transition table (`INVALID_STATE_TRANSITION` otherwise), each transition audited with actor/reason (FR-PRJ-083…088, 093, 094).
- Completion policy hook (configurable checks; initially none) (FR-PRJ-085).
- Logical deletion only (`DELETED` + `deleted_at`), dependency warning endpoint listing dependents (designs, reviews, deliverables — counts from registered providers, empty for now) (FR-PRJ-089…092).
- Project duplication API **stub** returning 501 until designs exist? — No: implement metadata-only duplication now; design copying added in I12 (FR-PRJ-007).
- Project access: org members with `project.view`; optional project-level `ResourceGrant`s for restricted projects (`visibility`: `organization` | `restricted`) (FR-PRJ-010, 011; FR-SEC-094).
- Listing with filters (status, category, season, brand, text search on name/style number), cursor pagination, sort by updated/created/name (FR-PRJ-012, 013). Postgres `ILIKE`/trigram index.
- Metadata history via audit events (FR-PRJ-009).
- Domain events per SPEC-006 §15 (`ProjectCreated`, `ProjectMetadataUpdated`, `ProjectPlacedOnHold`, `ProjectResumed`, `ProjectCompleted`, `ProjectReopened`, `ProjectArchived`, `ProjectRestored`, `ProjectDeleted`).
- Web: Projects dashboard (grid/list toggle, filters, search, status badges), create-project dialog, project overview page (metadata form, lifecycle actions with confirmations, access tab, designs placeholder, sources placeholder).

### Out of scope (deferred to)

- Designs, revisions, source asset intake (→ I12, I26)
- Reviews/approvals (→ I28)
- Physical erasure (→ I47)
- Project thumbnails from renders (→ I35)

## 3. Deliverables

- `apps/api/src/modules/projects/` (`projects.controller.ts`, `projects.service.ts`, `project-state-machine.ts`, `repository.ts`, `dependents-registry.ts`)
- `packages/contracts/src/projects/*.ts`
- `apps/web/src/features/projects/{dashboard,create-dialog,overview,lifecycle-actions,access-tab}.tsx`
- Resource resolver for `project`; isolation tests

## 4. Data model changes

| Model           | Notes                                                                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project`       | `display_id`, `name`, `status`, `visibility`, `metadata jsonb`, `default_design_id`, `on_hold_reason`, `completed_at`, `archived_at`, `deleted_at`, `version`; indexes (`organization_id`,`status`,`updated_at`), trigram on name |
| `ResourceGrant` | reused (resource_type `project`)                                                                                                                                                                                                  |

## 5. API / contracts

| Method & path                                 | Permission                                 | Purpose                                   |
| --------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `POST /v1/orgs/{orgId}/projects`              | `project.create`                           | Create (`ACTIVE`) (FR-PRJ-001)            |
| `GET /v1/orgs/{orgId}/projects`               | `project.view`                             | List/filter/search                        |
| `GET /v1/orgs/{orgId}/projects/{projectId}`   | `project.view`                             | Detail (`GetProjectLifecycle`)            |
| `PATCH /v1/orgs/{orgId}/projects/{projectId}` | `project.edit`                             | Update metadata (expectedVersion)         |
| `POST …/{projectId}/hold` · `/resume`         | `project.edit`                             | Hold / resume                             |
| `POST …/{projectId}/complete` · `/reopen`     | `project.edit` (reopen: `project.archive`) | Complete / reopen with reason             |
| `POST …/{projectId}/archive` · `/restore`     | `project.archive`                          | Archive / restore                         |
| `DELETE …/{projectId}`                        | `project.delete`                           | Logical delete (after dependency warning) |
| `GET …/{projectId}/dependents`                | `project.view`                             | Dependency warning                        |
| `POST …/{projectId}/duplicate`                | `project.create`                           | Duplicate (metadata now; designs in I12)  |
| `GET/POST/DELETE …/{projectId}/grants`        | `project.manage_access`                    | Restricted-project grants                 |

All mutating routes accept `Idempotency-Key`.

## 6. UI

- Dashboard: cards with name, display id, status badge, category/season, updated time; empty state CTA; archived filter hidden by default (FR-PRJ-087 "excluded from normal active-work views").
- Overview page: header with lifecycle actions (confirmation dialogs that explain effects — NFR-PRJ-017), metadata form (RHF+zod) showing conflict message on 409, access tab.

## 7. Implementation tasks (ordered checklist)

1. [ ] Model + migration + display id prefix `PRJ`.
2. [ ] State machine table + unit tests from §7.5 diagram.
3. [ ] Service with transactions, audit + outbox per transition, idempotency.
4. [ ] Listing/search with indexes; pagination.
5. [ ] Visibility + grants integration with PDP (restricted project requires grant or `project.manage_access`).
6. [ ] Dependents registry (modules register counters later).
7. [ ] Controllers/contracts; isolation tests added to harness.
8. [ ] Web dashboard + overview.
9. [ ] Update `PROGRESS.md`.

## 8. Tests

- Unit: every allowed/forbidden transition; metadata schema validation.
- Integration: create → stable id, `ACTIVE`, creator attributable (AC-001); stale `expectedVersion` → 409; archive keeps record retrievable by authorized users (AC-012 basis); retry with same idempotency key creates one project (AC-013); restricted project invisible to members without grant; cross-tenant 404s.
- E2E: create project, edit metadata, archive, find via "show archived", restore.

## 9. Acceptance criteria

- [ ] AC1 — Project creation yields stable ID, `ACTIVE` state, owning tenant, attributable creator (SPEC-006 AC-001; FR-PRJ-001).
- [ ] AC2 — Lifecycle transitions follow §7.5 exactly; invalid transitions return `INVALID_STATE_TRANSITION` (FR-PRJ-083…088).
- [ ] AC3 — Archiving/deletion never erases history; deletion is logical with dependency warning (FR-PRJ-087, 089, 091).
- [ ] AC4 — Listing supports filtering by state and metadata and search (FR-PRJ-012, 013).
- [ ] AC5 — Every transition generates an audit event with actor attribution (FR-PRJ-093, 094).
- [ ] AC6 — Project access is enforced server-side, incl. restricted projects (FR-PRJ-010; FR-SEC-106, 108).

## 10. Risks & notes

- `COMPLETED` must not imply approvals or readiness (SPEC-006 §7.1 note).
- Keep project status separate from design status (SPEC-006 §4.1).

## 11. Handoff

- I12 adds designs (`default_design_id`), extends duplication and dependents counts.
- I28 adds completion checks for unresolved reviews.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
