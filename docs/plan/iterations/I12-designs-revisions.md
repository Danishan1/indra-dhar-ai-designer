# I12 — Designs, working copies & immutable revisions

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 2 — Core domain                                                                                                                                                                                                                                                                                                                                                                                                       |
| Subsystems                      | SS-03 Garment Design Model (persistence), SS-02 Project Lifecycle (revision lifecycle)                                                                                                                                                                                                                                                                                                                                |
| Depends on                      | I09, I10, I11                                                                                                                                                                                                                                                                                                                                                                                                         |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Spec references                 | `docs/init/06-project-lifecycle.md` §4.1–4.2, §6.2–6.4, §8.3 (FR-PRJ-014…025), §8.4 (FR-PRJ-026…040), §10.1, §11 (revision snapshot & dependency pinning), §14 (commands), §16.1, §17 (AC-002…005, AC-008, AC-013); `docs/init/03-artifact-schema.md` §7 (DSN-001…014), §20.3 (API-001…005), §25 (AC-01, 02, 08, 10); `docs/init/01-overview.md` FR-021, FR-024, FR-043; `docs/plan/05-decisions.md` ADR-003, ADR-018 |
| Open decisions to resolve first | ADR-003 (JSONB snapshots + hash), ADR-018 (single working copy, no branches) — confirm                                                                                                                                                                                                                                                                                                                                |

## 1. Goal

Persist garment designs inside projects with a clear separation between the **mutable working copy** (optimistically versioned, autosaved) and **immutable design revisions** (snapshot + content hash + lineage + pinned artifact/source references). Users (via API) can create a design from a blank or category template, save working-copy changes with conflict detection, commit revisions, list history, fetch any revision, compare two revisions structurally, and restore an old revision into the working copy — without ever modifying history.

## 2. Scope

### In scope

- `Design` within a project: display id `DSN-000456`, name, garment type/category, `status` (`DRAFT` initially; other states driven by I28), `head_revision_id`, `approved_revision_id` (null), `working_copy_id`; project `default_design_id` set on first design (FR-PRJ-003, 006, 008; DSN-001…006).
- `WorkingCopy`: JSONB `state` (`GarmentDesignState`), `base_revision_id`, integer `version`, `last_modified_by`; full-state replace endpoint with `expectedVersion` (operations-based updates arrive in I14 and reuse the same versioning) (FR-PRJ-014, 019, 024; API-001, 002).
- Server validation of every saved state with `garment-model` structural validation (blocking structural errors rejected; warnings returned).
- Commit: transaction locks working copy row, verifies `expectedVersion`, canonicalizes + hashes state, inserts `DesignRevision` (`DSN-000456-R003`, revision_number, parent ids, snapshot, content_hash, artifact_revision_refs + source_asset_refs extracted from state, change_summary (auto-generated from diff + user text), validation_summary, schema_version), updates `head_revision_id`, rebases working copy (`base_revision_id` = new revision), outbox `RevisionCommitted` (FR-PRJ-021…023, 026…029; §10.1).
- Immutability: DB trigger rejecting UPDATE of `snapshot`, `content_hash`, `parent_revision_ids`, `revision_number` and DELETE on `design_revisions` (DSN-008; FR-PRJ-026).
- Integrity check on read/restore/export: recompute hash, mismatch → error + alert log (FR-PRJ-023).
- Commit with no semantic changes → reject with `NO_CHANGES` (configurable) to avoid noise.
- History listing (paged; author, time, summary, validation summary; review status placeholder) (FR-PRJ-029).
- Compare API: `diffDesignStates` between any two revisions or revision vs working copy (FR-PRJ-030, 031; DSN-011; AC-08).
- Restore: creates a new working state from revision R (base = R, records `restored_from_revision_id`); committing produces a new revision with parents [current head] and `restored_from` link; history untouched (FR-PRJ-033, 034; AC-004).
- Schema migration on read (`migrateToLatest`) for working copy; original snapshot left untouched (FR-PRJ-040; VER-004).
- Design duplication (within/between projects in same org): copies head snapshot into a new design's first revision with provenance `derived_from`, **no approvals copied** (FR-PRJ-007); extends project duplication from I10.
- Project dependents registry: designs count.
- Domain events: `DesignCreated`, `WorkingCopySaved`, `RevisionCommitted`, `RevisionRestoredToWorkingCopy`.
- Minimal web: project overview "Designs" tab listing designs + "New design" (blank/template) dialog; design detail page with history list and JSON-ish compare view (developer-quality; real editor UI in I15–I19).

### Out of scope (deferred to)

- Operation-based updates and undo/redo (→ I14/I15)
- Branch/merge (→ backlog, ADR-018; schema keeps `parent_revision_ids` array and `branch_id` nullable for future)
- Review/approval (→ I28)
- Visual comparison (→ I19, I35)

## 3. Deliverables

- `apps/api/src/modules/designs/` (`designs.controller.ts`, `revisions.controller.ts`, `designs.service.ts`, `working-copy.service.ts`, `revision.service.ts`, `compare.service.ts`, `repository.ts`)
- Migration incl. immutability trigger SQL
- `packages/contracts/src/designs/*.ts`
- `apps/web/src/features/designs/{designs-tab,new-design-dialog,design-history,compare-view}.tsx`
- Resource resolvers for `design`, `revision`; isolation tests

## 4. Data model changes

| Model            | Notes                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Design`         | `project_id`, `display_id`, `name`, `garment_type`, `garment_category`, `status`, `head_revision_id`, `approved_revision_id`, `working_copy_id`, `revision_counter`                                                                                                                                                                                                                                           |
| `WorkingCopy`    | `design_id` unique, `base_revision_id`, `state jsonb`, `schema_version`, `version int`, `last_modified_by`, `restored_from_revision_id`, `updated_at`                                                                                                                                                                                                                                                         |
| `DesignRevision` | `design_id`, `display_id`, `revision_number` (unique per design), `branch_id` nullable, `parent_revision_ids uuid[]`, `restored_from_revision_id`, `snapshot jsonb`, `content_hash`, `schema_version`, `artifact_revision_refs uuid[]`, `source_asset_refs uuid[]`, `change_summary`, `change_diff_summary jsonb`, `validation_summary jsonb`, `operation_ids uuid[]`, `created_by`, `created_at` — immutable |

## 5. API / contracts

| Method & path                                        | Permission                     | Purpose                                                                                      |
| ---------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `POST /v1/orgs/{orgId}/projects/{projectId}/designs` | `design.edit` + `project.edit` | `CreateDesign` (blank or template category) — creates working copy and initial revision R001 |
| `GET …/projects/{projectId}/designs`                 | `design.view`                  | List                                                                                         |
| `GET /v1/orgs/{orgId}/designs/{designId}`            | `design.view`                  | Design + pointers (head, approved, working copy version)                                     |
| `GET …/designs/{designId}/working-copy`              | `design.view`                  | Working copy state + version                                                                 |
| `PUT …/designs/{designId}/working-copy`              | `design.edit`                  | `SaveWorkingCopy` (expectedVersion; full state)                                              |
| `POST …/designs/{designId}/revisions`                | `design.commit`                | `CommitRevision` (expectedVersion, summary; idempotent)                                      |
| `GET …/designs/{designId}/revisions`                 | `design.view`                  | `GetDesignHistory`                                                                           |
| `GET …/designs/{designId}/revisions/{revisionId}`    | `design.view`                  | Snapshot (integrity-checked)                                                                 |
| `GET …/designs/{designId}/compare?from=&to=`         | `design.view`                  | `CompareRevisions` (`to` may be `working`)                                                   |
| `POST …/designs/{designId}/restore`                  | `design.restore`               | `RestoreRevisionToWorkingCopy` (expectedVersion)                                             |
| `POST …/designs/{designId}/duplicate`                | `design.edit` (target project) | Duplicate design                                                                             |

Error codes: `CONCURRENT_MODIFICATION` (with current version), `REVISION_NOT_FOUND`, `NO_CHANGES`, `VALIDATION_BLOCKED`.

## 6. UI

- Designs tab in project overview; new-design dialog (name, category: shirt / T-shirt / blank).
- Design detail (temporary): history table, "compare with previous", restore button with confirmation explaining history is preserved. Replaced by editor panels in I19.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-003/018.
2. [ ] Models + migration + trigger; display id prefixes `DSN` and revision suffix `-Rnnn`.
3. [ ] Design creation from `garment-model` templates (initial revision R001 committed automatically with summary "Created from template").
4. [ ] Working copy save with optimistic concurrency + structural validation.
5. [ ] Commit transaction (row lock, hash, extract refs, diff summary, outbox) + idempotency.
6. [ ] History, get, compare, integrity check.
7. [ ] Restore + commit-after-restore lineage.
8. [ ] Duplication (no approvals copied).
9. [ ] Dependents registry, resolvers, isolation tests.
10. [ ] Minimal web views.
11. [ ] Update `PROGRESS.md`.

## 8. Tests

- Unit: change-summary generation from diff; reference extraction (artifact revisions, assets) from state.
- Integration: autosave does not create revisions; commit creates immutable revision (AC-002, AC-003); direct SQL UPDATE of snapshot fails; R1,R2,R3 → restore R1 → commit → R4 with parent R3 and restored_from R1; R2,R3 still present (AC-004); two concurrent saves with same expectedVersion → one 409 (AC-008); same idempotency key commit twice → one revision (AC-013); hash mismatch detected when snapshot tampered (simulate by disabling trigger in test); revision pins artifact revision ids (AC-005 SPEC-006, AC-02 SPEC-003 — full check after I13); duplicate carries no approval; cross-tenant 404s.
- E2E: create design from shirt template, save change via dev UI, commit, compare, restore.

## 9. Acceptance criteria

- [ ] AC1 — Working copy and revisions are separate; autosave never creates revisions (FR-PRJ-014, 020; SPEC-006 AC-002).
- [ ] AC2 — Committed revisions are immutable at the DB level and reconstructable (DSN-008, DSN-010; FR-PRJ-026; AC-003).
- [ ] AC3 — Each revision records parents, hash, schema version, artifact revision and source asset refs (FR-PRJ-027, 028; §6.4).
- [ ] AC4 — Conflicting writes are detected and never silently overwrite (FR-PRJ-024, 025; API-002; AC-008).
- [ ] AC5 — Restore creates new working state; commit creates a new revision; history intact (FR-PRJ-033, 034; AC-004).
- [ ] AC6 — Structural comparison distinguishes components, properties, relationships, artifact references (DSN-011; AC-08 SPEC-003).
- [ ] AC7 — Duplicates never inherit approval status (FR-PRJ-007).

## 10. Risks & notes

- **Cross-iteration (planning review):** the `PUT …/working-copy` full-state save built here is temporary. From I14 on, editor edits must go through `OperationsService` (structured operations); I14 removes or restricts this endpoint to internal/system use. Design `Annotation` records are **not** created here — they belong to I27 (and review comments to I28).
- Snapshot size: shirts are small, but don't load snapshots in list endpoints (TECH §9.1 "avoid loading large JSONB").
- Keep commit atomic (SPEC-006 §10.1): no partial revisions visible; orphan cleanup unnecessary since snapshot is inline JSONB.
- Expect I14 to change _how_ working copies are mutated (operations) — keep `WorkingCopyService` the single writer.

## 11. Handoff

- I14 routes structured operations into `WorkingCopyService` with the same versioning.
- I19 builds editor UI for history/compare/restore on these APIs.
- I28 sets design status and `approved_revision_id`.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
