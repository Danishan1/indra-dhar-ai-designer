# I19 — Revision history, commit & comparison UI

| Field | Value |
|---|---|
| Phase | 3 — Structured 2D editor |
| Subsystems | SS-02 Project Lifecycle, SS-03, SS-04, SS-10 |
| Depends on | I18 (and I12 APIs) |
| Estimated sessions | 2 |
| Spec references | `docs/init/06-project-lifecycle.md` §8.3–8.4 (FR-PRJ-021…040), §9.1, §10.1, §11, AC-002…005; `docs/init/07-editor.md` §14 (comparison FR-EDT-093…099), §13 FR-EDT-092; `docs/init/03-artifact-schema.md` §7.2 (DSN-008…014), AC-08; `docs/init/10-visualization.md` §15.3 (FR-RV-119…123), §20.3 |
| Open decisions to resolve first | none |

## 1. Goal
Users explicitly **commit** the working copy as an immutable revision with a summary, browse revision history (lineage, author, time, validation summary, approval markers), **compare** any two revisions (or a revision vs the working copy) structurally and visually, and **restore** an earlier revision as a new working state — never rewriting history.

## 2. Scope
### In scope
- Commit dialog: auto-generated change summary from operations since base revision + user-editable description; shows validation summary snapshot (from I20 if available, else "not evaluated"); `POST /v1/designs/{id}/revisions` (I12) with `expectedVersion` + idempotency.
- History panel: ordered list with display id (`DSN-…-R003`), author, timestamp, summary, markers (head, approved — once I28 exists, validation status), parent lineage indicator; pagination.
- Revision viewer: open any revision read-only in the canvas (clear "Viewing R2 (read-only)" banner).
- Comparison mode (FR-EDT-093…097): pick A/B (revision ↔ revision, revision ↔ working copy). Panels:
  - Structured diff list grouped: components added/removed, property changes (old → new, with status changes), relationship/artifact changes (incl. revision bumps), metadata/visual-only changes separated (FR-PRJ-031, FR-EDT-094).
  - Visual: side-by-side flats with synced zoom/pan, overlay with opacity slider, changed components highlighted using stable ids (FR-EDT-095, FR-RV-185).
  - Each panel labels its revision (FR-RV-121, FR-RV-184).
- Restore: "Restore R1 to working copy" → confirmation explaining effect → server creates new working state based on R1 (FR-PRJ-033); commit later yields new revision with lineage to R1 and current head (FR-PRJ-034).
- Diff API if not delivered by I12: `GET /v1/designs/{id}/compare?a=&b=` using `garment-model` diff.
- Integrity check display: content hash verified on load (FR-PRJ-023).

### Out of scope (deferred to)
- Branch creation/merge (→ backlog, ADR-018)
- Review/approval actions (→ I28)
- Server-rendered comparison images (→ I35)

## 3. Deliverables
- `apps/web/src/features/editor/revisions/{CommitDialog.tsx, HistoryPanel.tsx, RevisionViewerBanner.tsx, CompareView.tsx, DiffList.tsx, OverlayCompare.tsx, RestoreDialog.tsx}`
- `garment-model/diff` enhancements: classification `structural | property | artifact | relationship | metadata | editor_hint`
- API (if missing): compare endpoint, change-summary generator endpoint `GET /v1/designs/{id}/working-copy/summary`

## 4. Data model changes
None (uses `DesignRevision`, `DesignOperation`). Ensure `DesignRevision.operation_ids` populated at commit.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{id}/revisions` | `design.commit` | Commit working copy |
| `GET /v1/designs/{id}/revisions` | `design.view` | History |
| `GET /v1/designs/{id}/revisions/{revId}` | `design.view` | Snapshot (hash verified) |
| `GET /v1/designs/{id}/compare?a=&b=` | `design.view` | Structured diff |
| `POST /v1/designs/{id}/working-copy/restore` | `design.edit` | Restore revision into working copy (expectedVersion) |

Events: `RevisionCommitted`, `RevisionRestoredToWorkingCopy`.

## 6. UI
History side panel, compare full-screen mode with toolbar (A/B pickers, side-by-side/overlay toggle, opacity), read-only banners.

## 7. Implementation tasks (ordered checklist)
1. [ ] Summary generator from operation records since base revision.
2. [ ] Commit dialog + endpoint integration + idempotency.
3. [ ] History panel with pagination and markers.
4. [ ] Read-only revision viewing mode in editor store.
5. [ ] Diff classification in garment-model + compare endpoint.
6. [ ] Compare view (structured + visual side-by-side/overlay; synced viewport).
7. [ ] Restore flow and confirmation copy.
8. [ ] Tests; Playwright journey (commit R1, edit, commit R2, compare, restore R1, commit R3).
9. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: diff classifier (visual-only/editor-hint changes not reported as design changes).
- Integration: commit is atomic & immutable (DB trigger blocks updates); restore never deletes R2/R3; idempotent commit retry.
- E2E: described journey; overlay highlights changed sleeve.

## 9. Acceptance criteria
- [ ] AC1 — Committing creates an immutable revision; previous revisions unchanged. (FR-PRJ-021, FR-PRJ-026, DSN-008, SPEC-006 AC-002/003, SPEC-003 AC-01)
- [ ] AC2 — History lists revisions with author, time, summary, lineage. (FR-PRJ-028, FR-PRJ-029)
- [ ] AC3 — Comparison identifies component, property, relationship and artifact-reference changes, separating visual-only differences. (DSN-011, FR-PRJ-030/031, FR-EDT-094, SPEC-003 AC-08, AC-EDT-012)
- [ ] AC4 — Each comparison panel shows which revision it represents. (FR-RV-121, FR-RV-184)
- [ ] AC5 — Restoring creates a new working state; committing it yields a new revision with valid lineage; later revisions remain. (FR-PRJ-033/034, SPEC-006 AC-004)
- [ ] AC6 — The UI distinguishes autosaved working copy from committed revisions. (FR-EDT-092)
- [ ] AC7 — Revision content hash is verified when restoring/viewing. (FR-PRJ-023)

## 10. Risks & notes
- Commit must reference exact artifact revisions and source assets present in the snapshot (FR-PRJ-019, §11.2).
- Camera/zoom differences must never appear as design diffs (FR-RV-186).

## 11. Handoff
- I20 adds validation summary to commit; I28 adds review submission from the history panel.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
