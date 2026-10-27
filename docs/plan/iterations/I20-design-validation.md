# I20 — Design validation engine & findings UI

| Field                           | Value                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 3 — Structured 2D editor                                                                                                                                                                                                                                              |
| Subsystems                      | SS-12 Validation & Quality, SS-03, SS-04                                                                                                                                                                                                                              |
| Depends on                      | I19                                                                                                                                                                                                                                                                   |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                     |
| Spec references                 | `docs/init/03-artifact-schema.md` §15 (constraints, outcomes, CST-001…007), §18 (state dimensions); `docs/init/07-editor.md` §17 (FR-EDT-117…124); `docs/init/06-project-lifecycle.md` FR-PRJ-063…072 (readiness concepts); `docs/init/01-overview.md` FR-055, FR-063 |
| Open decisions to resolve first | none                                                                                                                                                                                                                                                                  |

## 1. Goal

Provide a **versioned, repeatable design-structure validation engine** that evaluates a working copy or revision against a constraint set and returns structured findings (severity, rule, entity, explanation, resolution). The editor shows findings inline and in a summary panel, marks stale results, and commits record the validation summary. This is design-structure validation only — production readiness for tech packs comes in I41 and must never be implied here.

## 2. Scope

### In scope

- Pure rule engine in `garment-model/validation` (shared by web for instant hints and api for authoritative runs):
  - Rule interface `{ id, version, appliesTo(garmentType), evaluate(state, ctx) → Finding[] }`.
  - Initial rule categories (SPEC-003 §15.2): type compatibility, allowed placement regions, component dependency (e.g. cuff requires sleeve), geometric bounds (dimension ranges per template), required property presence (design-level), mutually exclusive options, material compatibility (e.g. trim on knit vs woven warnings), rendering capability (component lacks geometry → `requires_manual_review`), relationship endpoint validity, unconfirmed production-critical values (warning, informative only).
  - Outcomes `valid | warning | error | not_evaluated | requires_manual_review`; severity `blocking | warning | info`.
- `ConstraintSet` records: seeded platform set `design-structure@1.0.0` per garment type; version recorded on every run (CST-004).
- `validation` module (backend): `ValidationRun`, `ValidationFinding` persistence; run on demand, on commit (summary stored in `DesignRevision.validation_summary`), and asynchronously after operations (debounced) for working copies; staleness: a run is stale when target version ≠ current working copy version (FR-EDT-121).
- Operation validator (I14) delegates constraint checks to this engine for consistency.
- UI: inline finding icons on properties/components (FR-EDT-117), canvas markers on affected components, Validation panel with counts by severity, filters, click-to-navigate (FR-EDT-120), stale banner, "Re-run validation".
- Clear labelling: "Design structure validation — not production readiness" (FR-EDT-124, CST-006).

### Out of scope (deferred to)

- Tech-pack/production rules, exceptions & overrides (→ I41)
- Validation of AI outputs (→ I25)

## 3. Deliverables

- `packages/garment-model/src/validation/{engine.ts, rules/*.ts, constraint-sets/*.ts}` + tests
- `apps/api/src/modules/validation/{validation.module.ts, validation.service.ts, validation.controller.ts, repository.ts}`
- Prisma models `ConstraintSet`, `ValidationRun`, `ValidationFinding` + migration `…_i20_validation`
- `apps/web/src/features/editor/validation/{ValidationPanel.tsx, InlineFinding.tsx, CanvasFindingMarkers.tsx}`

## 4. Data model changes

`ConstraintSet` (key, version, rules JSONB/registry ref, applies_to), `ValidationRun` (target_type `working_copy|revision`, target_id, target_version, rule_set_version, status, is_stale), `ValidationFinding` (rule_id, severity, outcome, entity refs, message, recommended_resolution, blocking).

## 5. API / contracts

| Method & path                                                  | Permission    | Purpose                     |
| -------------------------------------------------------------- | ------------- | --------------------------- |
| `POST /v1/designs/{id}/validation-runs` (`target: working_copy | revision`)    | `design.view`               | Run validation |
| `GET /v1/designs/{id}/validation-runs/latest?target=`          | `design.view` | Latest findings + staleness |
| `GET /v1/validation-runs/{runId}`                              | `design.view` | Detail                      |

Events: `ValidationFindingsUpdated` (consumed by editor via polling/SSE later).

## 6. UI

Validation panel (bottom/side), inline markers, canvas badges, stale indicator, commit dialog shows summary (errors/warnings counts).

## 7. Implementation tasks (ordered checklist)

1. [x] Rule interface and engine with deterministic ordering & stable finding ids (hash of rule+entity).
2. [x] Implement initial rules + per-template ranges.
3. [x] Seed constraint set v1.0.0 per garment type.
4. [x] Backend module, persistence, staleness computation.
5. [x] Hook into commit (store summary) and into operation validator.
6. [x] Editor UI: panel, inline, canvas markers, navigation.
7. [x] Tests; Playwright: create invalid state (cuff without sleeve) → blocking finding → fix → finding disappears.
8. [x] Update PROGRESS.md.

## 8. Tests

- Unit: every rule positive/negative; warnings never silently become pass (§15.3); repeatability — same revision + same rule set version ⇒ same findings.
- Integration: commit stores validation summary with rule-set version; stale detection after new op.

## 9. Acceptance criteria

- [x] AC1 — Findings identify affected entity, rule, explanation, recommended resolution. (CST-002, FR-EDT-122)
- [x] AC2 — Blocking errors, warnings and info are distinguishable (text+icon). (CST-003, FR-EDT-119)
- [x] AC3 — Validation is repeatable against a specific revision and constraint-set version. (CST-004)
- [x] AC4 — Changes to dependent components trigger revalidation; old results marked stale. (CST-005, FR-EDT-121)
- [x] AC5 — Passing design validation is never presented as production readiness. (CST-006, FR-EDT-124, AC-EDT-013)
- [x] AC6 — Findings navigable to the component in canvas/tree. (FR-EDT-120)
- [x] AC7 — `requires_manual_review` findings remain visible until resolved/accepted. (§15.3)

## 10. Risks & notes

- Keep rules data-light and code-heavy for now; a rule DSL is not needed until I41 templates.
- Avoid running heavy validation synchronously on every keystroke — client runs cheap rules, server authoritative run debounced.

## 11. Handoff

- I25 uses the engine to validate AI-applied structured changes (Level 3 design consistency).
- I41 extends the engine pattern for production specifications.

## 12. Completion record

- Completed on: 2026-10-27
- Sessions used: 1
- Deviations from plan (ADR-055):
  - One authoritative pass on the server, re-run 1.2 s after each saved change, instead of a separate client-side "cheap rules" pass; results are the same engine either way.
  - The operation router does not call the engine (findings never block saving); artifact-dependent checks (allowed regions, compatibility) stay in the router at change time, so engine results depend only on the design state (repeatable).
  - Routes are org-scoped (`/v1/orgs/:orgId/designs/:designId/validation-runs`, `…/latest`, `/v1/orgs/:orgId/validation-runs/:runId`); revisions are validated on request (and summarised at commit) rather than stored as a run at commit time.
  - `ConstraintSet` stores rule refs and ranges; the rules are code. Only the newest 5 working-copy runs per design are kept.
  - Files are kebab-case (`validation/{validation-context.tsx, validation-panel.tsx, component-findings.tsx, canvas-markers.tsx, severity.tsx, api.ts}`); inline findings live in the property rows and a per-component list.
  - Fixed on the way: `classifyDiff` read relationship targets as `component` instead of `design_component` (I19 highlights for relationship changes).
- Tests: garment-model 140 (+9 engine), web unit 84 (+3), api integration 132 (+4 validation; tenant isolation covers `validation-runs/:runId`), e2e 29 (+1 sleeveless sleeve with cuff → blocking finding → Show → remove cuff → gone).
- Follow-ups added to backlog: see "From I20".
