# I49 — Release hardening: performance, E2E, accessibility

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 9 — Administration, observability, hardening, launch                                                                                                                                                                                                                                                                                                                                                          |
| Subsystems                      | All                                                                                                                                                                                                                                                                                                                                                                                                           |
| Depends on                      | I48 (staging environment)                                                                                                                                                                                                                                                                                                                                                                                     |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                                                                                                             |
| Spec references                 | `docs/init/11-tech-stack.md` §9 (esp. §9.5 targets), §3.10; `docs/init/07-editor.md` §18, §23 (NFR-EDT-001..005), §25.3–25.4, AC-EDT-*; `docs/init/10-visualization.md` §22 targets (NFR-RV-001..010), AC-RV-018; `docs/init/06-project-lifecycle.md` NFR-PRJ-001..004; `docs/init/08-tech-pack.md` NFR-TP-001..004; `docs/init/09-specification.md` NFR-SEC-002, NFR-SEC-007; `docs/init/01-overview.md` §12 |
| Open decisions to resolve first | Reference workload definition (default: 50 concurrent users, 20 orgs, designs with ≤ 40 components, 200-revision histories, BOM ≤ 150 rows, measurement table 30 POM × 8 sizes, 10 concurrent AI jobs via fake adapter with realistic latency)                                                                                                                                                                |

## 1. Goal

Prove the platform is ready for real users: measure against the documented performance targets on representative data, run a full-lifecycle end-to-end suite and failure-injection scenarios, close accessibility gaps in the editor and core screens, re-verify every milestone acceptance criterion, and complete a launch checklist — then tag the release.

## 2. Scope

### In scope

- **Load & performance** (k6 scripts in `tests/perf/`): API p95 < 300 ms typical (TECH §9.5), project list/metadata p95 < 2 s (NFR-PRJ-001/002), spec open p95 < 2 s (NFR-TP-001), authz decision p95 ≤ 100 ms (NFR-SEC-002), job status visibility usually < 2 s, cached preview p95 < 500 ms and standard async preview p95 < 10 s (SPEC-010 §22), revocation within 60 s (NFR-SEC-007).
- **Client performance** (Playwright traces + web-vitals): editor interaction feedback p95 < 100 ms, local property update < 250 ms (NFR-EDT-001/002), project initial load p95 < 2.5 s, 2D viewport update < 100 ms, interactive 3D ready < 3 s on reference device (SPEC-010 §22).
- Realistic data generator (`infra/scripts/seed-perf.ts`) for the reference workload.
- Optimization pass on findings: indexes, N+1 removal, JSONB partial loads, pagination, caching, React re-render profiling (TECH §9.1–9.3).
- **Full-lifecycle Playwright suite** (`tests/e2e/lifecycle/*`): register → org → invite → project → design from photo (fake AI) → edit/attach artifact → generate → apply candidate → commit → review/approve (SoD) → spec → BOM/POM/grading/construction → validate → export → release → supplier download → billing usage visible → invoice preview.
- **Failure injection** (SPEC-007 §25.4, SPEC-004 §27.3): network drop during save, server error during revision commit, duplicate submission, provider timeout → `outcome_unknown`, delayed generation after edits (stale), render outage, artifact access loss, permission revocation mid-session, concurrent edits.
- **Accessibility**: axe-core automated checks on all main routes; manual keyboard walkthrough of editor (FR-EDT-125..133), focus management in dialogs, screen-reader labels, non-colour status indicators; fix blocking issues.
- **Visual regression** baseline for key screens and reference renders (SPEC-007 §25.2).
- **Milestone re-verification**: rerun M1–M8 demo scenarios on staging; spot-check acceptance criteria from SRS §12.
- **Launch checklist** (`docs/deployment/launch-checklist.md`): security DoD (SPEC-009 §30), backups verified, monitoring/alerts live, legal pages placeholders (terms, privacy, AI data processing disclosure per provider — FR-SEC-211), support contact, pricing pages, data retention doc, known limitations doc (3D level, AI preservation limits).

### Out of scope (deferred to)

- Third-party pen test and legal review (owner-arranged)
- Features in `09-backlog.md`

## 3. Deliverables

- `tests/perf/*.js` (k6) + `tests/perf/README.md` with how to run against staging
- `infra/scripts/seed-perf.ts`
- `tests/e2e/lifecycle/*.spec.ts`, `tests/e2e/failure-injection/*.spec.ts`, `tests/e2e/a11y/*.spec.ts`
- `docs/deployment/{performance-report.md, launch-checklist.md, known-limitations.md}`
- Fix commits for performance/a11y findings

## 4. Data model changes

Indexes/migrations only as required by performance findings (each reviewed).

## 5. API / contracts

No new endpoints expected; any change must keep OpenAPI snapshot compatibility or be versioned.

## 6. UI

Accessibility and performance fixes only; "known limitations" link in help menu.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm reference workload; generate perf dataset on staging.
2. [ ] Write k6 scenarios; run baseline; record results in performance report.
3. [ ] Profile & fix top regressions; re-run until targets met or documented exceptions accepted by owner.
4. [ ] Client perf measurements on reference device/browser.
5. [ ] Lifecycle E2E + failure-injection suites green on staging.
6. [ ] axe + manual a11y pass; fix blockers.
7. [ ] Visual regression baselines.
8. [ ] Re-run milestone demos; complete launch checklist.
9. [ ] Update PROGRESS.md (all iterations done), tag `v1.0.0` / `m9-launch`, move remaining items to backlog.

## 8. Tests

- Performance: k6 thresholds encode the targets (fail run on breach).
- E2E: lifecycle, failure injection, a11y suites (Playwright).
- Regression: full `pnpm verify`, `test:integration`, security suite, restore drill (from I48) once more.

## 9. Acceptance criteria

- [ ] AC1 — Performance targets in TECH §9.5, SPEC-010 §22, NFR-EDT-001/002, NFR-PRJ-001/002, NFR-TP-001, NFR-SEC-002 met on the reference workload, or deviations documented and accepted.
- [ ] AC2 — Full-lifecycle E2E passes on staging.
- [ ] AC3 — Failure-injection scenarios behave per specs (no silent data loss, no duplicate charges/revisions, stale results never overwrite newer work) (AC-EDT-006, AC-EDT-011, AC-EDT-015, SPEC-004 AC-14/15).
- [ ] AC4 — No blocking axe violations; editor fully keyboard-operable for essential actions (FR-EDT-125..129).
- [ ] AC5 — Editor stays usable while async renders/jobs run (NFR-EDT-004, AC-RV-018).
- [ ] AC6 — Launch checklist complete; SRS §12 acceptance spot-checked; release tagged.

## 10. Risks & notes

- Do not "optimize" by weakening authorization caching beyond revocation targets.
- Load tests must use the fake AI adapter (no real spend); a separate small, budget-capped smoke test against the real provider is optional and owner-approved.

## 11. Handoff

- Post-launch work comes from `09-backlog.md`; create new iteration files `I50+` using `_TEMPLATE.md` and append them to `04-roadmap.md` and `PROGRESS.md`.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
