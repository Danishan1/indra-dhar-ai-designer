# Designs, working copies and revisions (I12)

A **design** lives in a project and has exactly one **working copy** (the mutable draft) and an append-only list of **revisions** (immutable snapshots). The state in both is a `GarmentDesignState` from `packages/garment-model` — read its README first. Decisions: ADR-003, ADR-018, ADR-047.

## Rules

1. **Only `WorkingCopyService` writes working copies**, and only the operations module calls its state writer (`writeOperationState`).
2. **Draft changes are design operations (I14, `docs/architecture/operations.md`).** They never create revisions; the I12 full-state `PUT …/working-copy` was removed (full replacement is the internal `replace_state` operation).
3. **Every saved or committed state is structurally validated** (`validateDesignState`). Errors → `VALIDATION_BLOCKED` (422) with `details.findings`; warnings come back on the working copy.
4. **Committing** locks the working-copy row, checks the version, validates, diffs against the head (`NO_CHANGES` when nothing semantic changed), writes the revision (`DSN-000123-R004`, canonical snapshot, hashes, parent = head, pinned artifact revision and asset refs, generated change summary + diff counts, validation summary) and rebases the working copy — one transaction, plus audit + `designs.revision_committed`.
5. **Revisions are immutable in the database** (trigger blocks UPDATE/DELETE). Every snapshot read re-hashes it; mismatch → `INTEGRITY_CHECK_FAILED` and an `alert: revision_integrity` log line.
6. **Restore** puts revision R into the draft (`baseRevisionId = R`, `restoredFromRevisionId = R`). The next commit gets the current head as parent and records `restoredFromRevisionId`. History is never changed.
7. **Old schema versions** are upgraded on read (`readAnyVersion`); stored snapshots are never rewritten.
8. **Lists never load snapshots** (summary columns only).
9. **Duplication** copies the latest revision (new component ids, provenance `duplicate`, no approval). Project duplication copies all designs via the lifecycle registry's duplicator hook.
10. Designs inherit project restriction and are read-only while the project is completed/archived.

## API (`/v1/orgs/:orgId/…`)

| Route                                                               | Permission (resource)                             |
| ------------------------------------------------------------------- | ------------------------------------------------- |
| `GET/POST projects/:projectId/designs`                              | `design.view` / `design.create` (project)         |
| `GET designs/:designId` · `GET designs/:designId/working-copy`      | `design.view` (design)                            |
| `PUT designs/:designId/working-copy`                                | `design.edit`                                     |
| `POST designs/:designId/revisions` (idempotent) · `GET …/revisions` | `design.commit` / `design.view`                   |
| `GET designs/:designId/compare?from=<rev>&to=<rev\|working>`        | `design.view`                                     |
| `POST designs/:designId/restore`                                    | `design.restore`                                  |
| `POST designs/:designId/duplicate` (`targetProjectId?`)             | `design.create` (+ checked on the target project) |
| `GET revisions/:revisionId`                                         | `design.view` (revision)                          |

## Code

`apps/api/src/modules/designs/` — `designs.service.ts` (create, list, duplicate, resolvers, project hooks), `working-copy.service.ts` (save/commit/restore), `revision.service.ts` (insert, verify, history), `compare.service.ts`, `change-summary.ts` (pure: summaries, refs, counts). Web: `apps/web/src/features/designs/` (developer views until the editor, I15–I19).
