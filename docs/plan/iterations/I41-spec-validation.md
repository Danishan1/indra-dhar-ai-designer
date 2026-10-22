# I41 — Specification validation & production readiness

| Field                           | Value                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 8 — Tech pack & production specification                                                                                                                                                                                            |
| Subsystems                      | SS-12 Validation & Quality, SS-15 Tech Pack, SS-02 Project Lifecycle                                                                                                                                                                |
| Depends on                      | I40, I20 (validation engine: constraint sets, runs, findings)                                                                                                                                                                       |
| Estimated sessions              | 2                                                                                                                                                                                                                                   |
| Spec references                 | `docs/init/08-tech-pack.md` §21, §22 (FR-TP-132), §31.2, AC-TP-006; `docs/init/06-project-lifecycle.md` FR-PRJ-063..072; `docs/init/03-artifact-schema.md` §15, §18, PROD-006, PROD-010; `docs/plan/05-decisions.md` §3 (OD-TP-008) |
| Open decisions to resolve first | Production-ready policy per seeded category (default: all `required` POMs with base-size target + tolerance, main fabric composition confirmed, construction sequence present, care label present)                                  |

## 1. Goal

Turn the specification into something that can be judged: versioned, template-bound rule sets evaluate a fixed spec revision (and its fixed design revision), produce structured findings with severity and blocking status, support governed exceptions, go stale when relevant inputs change, and yield a derived readiness status — never claiming completeness just because fields are filled.

## 2. Scope

### In scope

- Extend the I20 validation engine with `target_type=spec_revision`; rule sets keyed by template revision + org policy (FR-TP-119, FR-TP-121, FR-TP-132).
- Rule catalog (pure functions in `packages/techpack-model/rules`): structural completeness, data type & unit correctness, cross-section consistency (BOM↔colorways, construction↔BOM, placements↔components, callouts↔records), design-reference consistency (source revision exists, technical views match), artifact availability & version identity, measurement & grading (from I39 checks), construction completeness, required evidence & confirmation status, exportability prerequisites (FR-TP-120, §21.1 dims 1–11).
- Unconfirmed AI/inferred values count as unresolved for required fields (FR-TP-127, AC-TP-005).
- Findings schema per §21.2 (rule id + version, severity, blocking, affected section/record, explanation, recommended resolution, resolution status/actor).
- Exceptions: request + approve with reason, scope, actor, expiry; finding retained (FR-TP-123, FR-TP-124, FR-PRJ-071).
- Staleness: any edit to relevant sections, new template migration, or rule-set version bump marks run stale (FR-TP-125, FR-PRJ-070).
- Readiness derived status `NOT_CHECKED | BLOCKED | READY_WITH_WARNINGS | READY` per (design revision, spec revision, rule-set version) (FR-PRJ-064, FR-PRJ-069, FR-PRJ-072).
- Spec lifecycle transition `in_progress → validated` gated on a fresh passing run (FR-TP-007).
- Async run via job (NFR-TP-002) with SSE progress; small specs may run inline.
- Validation UI: summary panel, per-section inline findings, navigate-to-record, exception workflow.

### Out of scope (deferred to)

- Review/approval/release transitions (→ I43)
- Export integrity checks (→ I42 adds its own "exportability" stage)
- Market/customer-specific compliance packs beyond configurable required-field rules (→ backlog)

## 3. Deliverables

- `packages/techpack-model/src/rules/*.ts` (+ rule registry with ids and versions)
- `apps/api/src/modules/validation/` extensions (spec target, rule-set resolver, exception service)
- `apps/api/src/modules/techpack/readiness.service.ts`
- `apps/web/src/features/techpack/validation/` — summary drawer, inline markers, exception dialog
- Seed: production-readiness rule sets for the two templates (versioned)

## 4. Data model changes

- Reuse `ConstraintSet` (`key=spec:<template>`, version), `ValidationRun` (`target_type=spec_revision`, plus `design_revision_id`), `ValidationFinding`, `ValidationException` from I20; add `readiness_status` derived column/view on run.
- Org-level policy overrides: `SecurityPolicy`-like `spec_policy` JSONB on organization settings (required fields, warning-allowed flags) within admin-defined bounds (FR-TP-132).

## 5. API / contracts

| Method & path                                             | Permission                         | Purpose                                                        |
| --------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `POST /v1/spec-revisions/{revId}/validation-runs`         | `techpack.edit`                    | Start run (idempotent per revision version + rule-set version) |
| `GET /v1/validation-runs/{runId}`                         | `techpack.view`                    | Run + findings                                                 |
| `GET /v1/spec-revisions/{revId}/readiness`                | `techpack.view`                    | Derived readiness + latest run + stale flag                    |
| `POST /v1/validation-findings/{findingId}/exceptions`     | `techpack.edit`                    | Request exception (reason, scope)                              |
| `POST /v1/validation-exceptions/{id}:approve` / `:reject` | `techpack.approve_exception` (new) | Approve/reject exception                                       |
| `POST /v1/spec-revisions/{revId}:mark-validated`          | `techpack.edit`                    | Lifecycle transition (requires fresh passing run)              |

Events: `ProductionReadinessEvaluated`, `ProductionReadinessInvalidated` (SPEC-006 §15), `ValidationExceptionApproved`.

## 6. UI

- Header readiness chip showing status **and** which design/spec revision + rule-set version it applies to (NFR-PRJ-015).
- Findings drawer grouped by section and severity (blocking/warning/info with icons), "Go to" navigation, "Request exception" for eligible findings.
- Stale banner when edits occurred after the last run.
- Explanations actionable (NFR-PRJ-016).

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm default production-ready policy for seeded categories; record in PROGRESS.md.
2. [ ] Rule registry + rules (pure) with unit tests per rule; each rule declares id, version, severity default, blocking policy, targets.
3. [ ] Rule-set resolver: template revision rule set ⊕ org overrides (bounded).
4. [ ] Spec run executor (job kind `validation`) reading fixed spec revision content + design revision snapshot + artifact availability via services.
5. [ ] Exception service with permission & audit; exception never deletes finding.
6. [ ] Staleness projection on `SpecificationRevisionUpdated`, template migration, rule-set version change.
7. [ ] Readiness derivation & lifecycle gate.
8. [ ] UI drawer, inline markers, exception dialog.
9. [ ] Tests; PROGRESS.md.

## 8. Tests

- Unit: each rule positive/negative; unconfirmed inferred value fails required-field rule; composition sum; BOM/colorway mismatch; callout to missing record.
- Integration: missing tolerance → blocking finding → cannot mark validated (AC-TP-006); exception approved → `READY_WITH_WARNINGS` only if policy allows; edit after run → run stale & readiness `NOT_CHECKED`/stale; re-run reproducible with same inputs (FR-TP-126); run records rule-set version.
- E2E: the blouse/shirt scenario from SPEC-008 §30 steps 9–11 (missing cuff tolerance + unconfirmed composition → fix → pass).

## 9. Acceptance criteria

- [ ] AC1 — Required fields validated per template & policy (FR-TP-119); cross-section rules run (FR-TP-120).
- [ ] AC2 — Every run records rule-set version; results reproducible (FR-TP-121, FR-TP-126, CST-004).
- [ ] AC3 — Blocking findings prevent `validated` (FR-TP-122, AC-TP-006); warnings allowed only per policy with recorded exception (FR-TP-123, FR-TP-124).
- [ ] AC4 — Relevant edits mark results stale (FR-TP-125, FR-PRJ-070).
- [ ] AC5 — No false completeness: filled-but-unconfirmed or inconsistent data keeps readiness below READY (FR-TP-127, PROD-006, PROD-010).
- [ ] AC6 — Readiness is derived, revision-specific, and independent of design approval (FR-PRJ-063, FR-PRJ-064, FR-PRJ-072).
- [ ] AC7 — Overrides keep the underlying finding and record actor, rationale, policy (FR-PRJ-071).

## 10. Risks & notes

- Rule explosion: keep rules data-driven where possible (required-field lists in templates) and code only for cross-section logic.
- Render validation (I35) ≠ production validation (FR-RV-156) — label clearly.
- Large specs: run async; do not block the edit API.

## 11. Handoff

- I42 requires a fresh run reference for release-grade exports; I43 release gate reads readiness.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
