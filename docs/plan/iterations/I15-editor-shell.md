# I15 — Editor shell, editor-core & autosave

| Field                           | Value                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 3 — Structured 2D editor                                                                                                                                                                                                                                                                                    |
| Subsystems                      | SS-04 Editor Interaction, SS-02 Project Lifecycle (working copy), SS-06                                                                                                                                                                                                                                     |
| Depends on                      | I04, I14                                                                                                                                                                                                                                                                                                    |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                         |
| Spec references                 | `docs/init/07-editor.md` §3, §5 (layout, FR-EDT-001…008), §12 (undo/redo FR-EDT-079…085), §13 (autosave FR-EDT-086…092), §18 (keyboard FR-EDT-125…127), §20 (interaction state model), §22 (error handling); `docs/init/06-project-lifecycle.md` §8.3 (FR-PRJ-014…025); `docs/init/01-overview.md` §2.1–2.2 |
| Open decisions to resolve first | ADR-015 (Zustand) — confirm                                                                                                                                                                                                                                                                                 |

## 1. Goal

Deliver the professional editor **workspace** — a full-viewport, panel-based, desktop-software-like screen at `/projects/{projectId}/designs/{designId}` — plus the pure `packages/editor-core` engine (command stack, selection, tool state, undo/redo, operation grouping) and a reliable save pipeline (autosave, durable acknowledgement, conflict handling, recovery). The canvas area is a placeholder until I16 renders the garment.

## 2. Scope

### In scope

- `packages/editor-core` (pure TS): `CommandStack` (push/undo/redo, grouping by transaction id, max depth configurable), `SelectionModel` (single/multi, by stable component id), `ToolState`, `ViewportState` (zoom, pan; not persisted as design data), `PendingOpsQueue` (optimistic local ops awaiting server ack), save-state machine (`saved`, `saving`, `unsaved`, `save_failed`, `conflict`, `offline`).
- Editor store (Zustand, ADR-015) wiring editor-core to React; selectors to avoid whole-editor re-render (TECH §9.3).
- Workspace layout: header (project/design name, save status, revision info, primary actions), tool bar, left panel (hierarchy placeholder), center viewport, right panel (properties placeholder), bottom/side panel for operations & history, status bar; resizable/collapsible panels; layout prefs persisted per user (localStorage guarded with try/catch, non-critical).
- Load: `GET /v1/designs/{id}/editor-state` (working copy + version + head/approved revision ids + design status) — add to `designs` module if not present.
- Edit pipeline: UI intent → operation (from `design-operations`) → optimistic local apply → submit with `expectedVersion` + idempotency key → on ack replace with server state; on 409 → conflict state with options (reload, view diff of server vs local, re-apply my pending ops on top).
- Undo/redo issue **inverse operations** to the server (not local-only snapshots) so history stays consistent (FR-EDT-082/085).
- Autosave semantics: every op is persisted immediately (server is the store); "autosave" here means batching rapid ops (debounce ~500 ms into one `batch` op) and retry with backoff; offline detection with pending queue preserved in memory + IndexedDB recovery snapshot (try/catch; optional).
- Keyboard shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z / Ctrl+Y, Ctrl+S (forces flush), Esc (clear selection), with input-focus guard (FR-EDT-127).
- Unsaved-changes guard on navigation (FR-PRJ-018).
- Distinguish working copy vs latest committed revision vs approved revision in the header (NFR-PRJ-013).

### Out of scope (deferred to)

- Garment rendering, hit-testing (→ I16); hierarchy & properties content (→ I17); commit dialog/history (→ I19)
- Multi-user live presence (→ backlog)

## 3. Deliverables

- `packages/editor-core/src/{command-stack.ts, selection.ts, viewport.ts, tools.ts, pending-ops.ts, save-state.ts, index.ts}` + tests
- `apps/web/src/features/editor/{EditorPage.tsx, layout/*, store.ts, api.ts, hooks/useOperationSubmit.ts, components/SaveStatus.tsx, components/ConflictDialog.tsx, shortcuts.ts}`
- Route `apps/web/src/app/(app)/projects/[projectId]/designs/[designId]/page.tsx`
- API: `GET /v1/designs/{designId}/editor-state`

## 4. Data model changes

None (optional `user_preferences` JSONB on User for editor layout — or keep client-side only; prefer client-side).

## 5. API / contracts

| Method & path                                  | Permission    | Purpose                                                              |
| ---------------------------------------------- | ------------- | -------------------------------------------------------------------- |
| `GET /v1/designs/{designId}/editor-state`      | `design.view` | Working copy, version, revision pointers, status, capabilities flags |
| `POST /v1/designs/{designId}/operations` (I14) | `design.edit` | All edits                                                            |

## 6. UI

- Editor workspace with the 8 logical regions of SPEC-007 §5.1; dark neutral theme default.
- Save status chip with states: Saving… / Saved / Unsaved changes / Save failed (Retry) / Conflict (Resolve) / Offline.
- Conflict dialog: Reload server version · Re-apply my changes · Cancel.
- Read-only mode when user lacks `design.edit` (controls disabled with tooltip; server still enforces).

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-015; add Zustand to `apps/web`.
2. [ ] Implement editor-core modules with exhaustive unit tests (undo/redo grouping, max depth, redo cleared on new op).
3. [ ] Editor-state endpoint + contract.
4. [ ] Layout components with resizable panels (shadcn `Resizable`), keyboard focus management.
5. [ ] Operation submit hook: debounce/batch, idempotency key per batch, retry with backoff for network errors only, no retry on 4xx.
6. [ ] Conflict handling flow + tests with mocked 409.
7. [ ] Undo/redo via inverse ops; non-invertible ops mark history boundary (FR-EDT-084) with a toast explaining "restore a revision instead".
8. [ ] Navigation guard; offline indicator via `navigator.onLine` + failed fetch heuristics.
9. [ ] Playwright: open editor, perform a property op via dev-only debug panel, see "Saved"; simulate conflict with second browser context.
10. [ ] Update PROGRESS.md.

## 8. Tests

- Unit: command stack, grouping, save-state transitions, pending queue replay after conflict.
- Component: SaveStatus renders each state; shortcuts ignored inside inputs.
- E2E: two contexts editing the same design → second gets conflict dialog, no silent overwrite (AC-EDT-011).

## 9. Acceptance criteria

- [x] AC1 — Editor workspace renders with header, toolbar, hierarchy, viewport, properties, operations/history, status regions; panels resize/collapse without modifying the design. (FR-EDT-001, 002, 008)
- [x] AC2 — Save status distinguishes saving, saved, unsaved, failed, conflict. (FR-EDT-005, FR-EDT-087)
- [x] AC3 — "Saved" shown only after server acknowledgement. (FR-PRJ-016)
- [x] AC4 — Undo/redo work for supported ops and never delete committed revisions. (FR-EDT-079, 080, 082; AC-EDT-007)
- [x] AC5 — Concurrent edits produce a conflict path, never a silent overwrite. (FR-PRJ-025, FR-EDT-089, AC-EDT-011)
- [x] AC6 — Failed save preserves pending changes and offers retry. (FR-EDT-091, AC-EDT-015)
- [x] AC7 — Shortcuts do not fire while typing in inputs. (FR-EDT-127)
- [x] AC8 — Header distinguishes working state, latest revision, approved revision. (NFR-PRJ-013, FR-EDT-092)

## 10. Risks & notes

- Do not store selection/viewport in the working copy (SPEC-007 §20).
- Avoid re-rendering the whole tree on each op; use store selectors and memoized panels.
- Server state is authoritative: after ack, reconcile with returned patch even if optimistic result looked identical.

## 11. Handoff

- I16 plugs the SVG canvas into the viewport region using `ViewportState` and `SelectionModel`.
- I17 fills hierarchy and properties panels.

## 12. Completion record

- Completed on: 2026-10-27
- Sessions used: 1
- Deviations from plan (ADR-050):
  - Route is org-scoped like every other: `GET /v1/orgs/{orgId}/designs/{designId}/editor-state`; it also returns the project (`editable`), revision summaries, `readOnlyReason` and the user id. Capabilities come from the PDP through the new `PolicyEnforcer.can()` (no audit).
  - The page lives in the `(editor)` route group (full viewport), not `(app)`; that layout now includes `OrganizationProvider`. A wrong `projectId` in the URL redirects to the design's project.
  - Layout files: the existing `editor-workspace.tsx` became a slot-based layout (`WorkspaceLayout`) reused by `/editor/demo` and the editor; a `status` region (status bar) was added. File names follow the repo's kebab-case convention (`editor-page.tsx`, `components/save-status.tsx`, `hooks/use-editor-shortcuts.ts`, `store-context.tsx`).
  - New ids are generated in the browser (`normalizeOperation`) so optimistic and server results agree; operation types needing server data (artifacts, AI) are sent without preview.
  - Undo right after a change saves it first; leaving the editor flushes immediately. Undo history is per editor session.
  - IndexedDB recovery snapshot (optional) not built → backlog.
  - "View diff of server vs local" in the conflict dialog not built (Reload / Re-apply / Cancel only) → backlog (needs the compare view inside the editor, I19).
  - Read-only e2e covers an archived project (single-user test); the viewer path is covered by the integration test.
- Tests: editor-core 27, web unit 60 (store 14, save chip 7, shortcuts 2 new), api integration 122 (+1 editor-state, read-only/grant assertions), e2e 23 (+2: autosave/undo/redo/conflict with two browser contexts; archived read-only).
- Follow-ups added to backlog: see "From I15".
