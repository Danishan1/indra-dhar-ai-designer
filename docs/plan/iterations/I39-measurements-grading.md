# I39 — Measurements, POMs, tolerances & grading

| Field                           | Value                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 8 — Tech pack & production specification                                                                                                                                                                                         |
| Subsystems                      | SS-15 Tech Pack & Production Spec                                                                                                                                                                                                |
| Depends on                      | I38, I35 (technical-flat renders for POM diagrams)                                                                                                                                                                               |
| Estimated sessions              | 2–3                                                                                                                                                                                                                              |
| Spec references                 | `docs/init/08-tech-pack.md` §13, §14, §15, §31.1–31.2, AC-TP-003, AC-TP-004; `docs/init/03-artifact-schema.md` §17.3 (measurement record), GEO-002, PROD-003/004; `docs/plan/05-decisions.md` ADR-020, §3 (OD-TP-004, OD-TP-011) |
| Open decisions to resolve first | Size ranges per seeded category (default: shirt XS–XXL, base M; tee XS–XXL, base M) — confirm with owner or record default                                                                                                       |

## 1. Goal

Give every specification a structured, unit-safe measurement table: points of measurement (POM) from a versioned per-category library, a base size, a size range, target values, symmetric/asymmetric tolerances and explicit grade rules whose derived values keep their provenance. Image-derived or AI-proposed measurements remain estimates until confirmed. This is the technical heart of production readiness.

## 2. Scope

### In scope

- `PomLibrary` (versioned): POM definitions with stable id, name, definition, measurement method, diagram ref, category applicability, unit, required flag, default tolerance policy (§13.2). Seed for woven shirt & knit tee (chest width, body length HPS, shoulder width, sleeve length, cuff opening, armhole, neck width/drop, hem sweep, collar length …) — **definitions only, no numeric targets**.
- Measurement specification section in spec content: units, base size, size range, POM rows × size columns, method refs, source & confirmation status per value (FR-TP-049..060).
- Unit conversion with explicit precision/rounding rules (FR-TP-051): canonical mm (ADR-020), display cm/in, round-half-even to configured decimals; conversion is reversible within tolerance and logged.
- Tolerance rules: symmetric & asymmetric, unit, size scope, measurement stage, source (customer/internal/factory/user), approval status (FR-TP-070..075).
- Grading: size range config (FR-TP-061), grade rules per POM (increment per step, per-size exceptions — FR-TP-067), derived values marked `derived` with rule version + base measurement ref (FR-TP-064), manual overrides with reason & status (FR-TP-066), no universal default grading (FR-TP-063).
- Imported grading tables (CSV upload) with source/version recorded (FR-TP-062, FR-TP-069 basic).
- Measurement-specific checks available as functions (range, non-numeric, missing, discontinuities, duplicate/missing sizes — FR-TP-059, FR-TP-065, FR-TP-068) used inline now and registered as rules in I41.
- POM diagram: annotated technical flat (from I35 SVG render) with POM markers placed by user; stored as structured annotations (FR-TP-053).
- Spreadsheet-like measurement table UI with keyboard navigation, paste from Excel, unit toggle.

### Out of scope (deferred to)

- Full validation runs & readiness status (→ I41) — inline findings only
- Export of measurement table to XLSX/CSV/PDF (→ I42)
- AI-suggested POM mapping or values (→ I44)
- External pattern/grading system integrations (→ backlog)

## 3. Deliverables

- `packages/techpack-model/src/{measurement,pom,tolerance,grading,unit-conversion}.ts` + tests
- `apps/api/src/modules/techpack/{measurement.service.ts, pom-library.service.ts, grading.service.ts}` and controller routes
- `apps/api/prisma/seed/platform/pom-libraries.ts`
- `apps/web/src/features/techpack/measurements/` — table grid, grade-rule editor, tolerance editor, POM diagram annotator, CSV import dialog

## 4. Data model changes

- `PomLibrary` (key, category, version, definitions JSONB, status) — immutable versions.
- Spec content section `measurement_specification`: `{ unitSystem, baseSize, sizeRange[], pomLibraryVersion, points: [{ pomId, method, required, tolerance, gradeRule, values: { [size]: PropertyValue<number> } }] }` (ADR-027 JSONB). `PropertyValue.sourceType` ∈ `user_input | measurement_record | formula | ai_job | imported_data | uploaded_image`.
- Migration only for `pom_libraries`.

## 5. API / contracts

| Method & path                                                           | Permission      | Purpose                                           |
| ----------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| `GET /v1/pom-libraries?category=`                                       | `techpack.view` | POM definitions                                   |
| `PUT /v1/spec-revisions/{revId}/measurements/config`                    | `techpack.edit` | Unit system, base size, size range, POM selection |
| `PATCH /v1/spec-revisions/{revId}/measurements/values`                  | `techpack.edit` | Batch cell updates (expectedVersion)              |
| `PUT /v1/spec-revisions/{revId}/measurements/points/{pomId}/tolerance`  | `techpack.edit` | Tolerance rule                                    |
| `PUT /v1/spec-revisions/{revId}/measurements/points/{pomId}/grade-rule` | `techpack.edit` | Grade rule; triggers derived-value recompute      |
| `POST /v1/spec-revisions/{revId}/measurements:override`                 | `techpack.edit` | Override derived value with reason                |
| `POST /v1/spec-revisions/{revId}/measurements:import`                   | `techpack.edit` | Import graded table (asset id of CSV)             |
| `PUT /v1/spec-revisions/{revId}/measurements/diagram`                   | `techpack.edit` | POM markers on technical view                     |

Events: `SpecificationRevisionUpdated` (section=`measurements`).

## 6. UI

- Measurement grid: POM rows, size columns, base-size column highlighted, unit toggle (display only), per-cell status colour **plus icon** (non-colour indicator), derived cells italic with "derived from M via rule v3" tooltip, overridden cells flagged.
- Side panel for selected POM: definition, method, diagram thumbnail, tolerance editor (± or +/−), grade-rule editor with preview of resulting values.
- Inline findings list (missing required targets, non-numeric, discontinuity).
- Estimates banner: values with `sourceType=uploaded_image|ai_job` show "Estimate — not a confirmed physical dimension" (FR-TP-056).

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm seeded size ranges/base sizes; record in PROGRESS.md.
2. [ ] Implement unit conversion with explicit precision table + tests (round-trip, rounding mode).
3. [ ] POM library schema + seed two category libraries (definitions & methods; no numbers).
4. [ ] Measurement section schema; config endpoint; batch value updates with concurrency.
5. [ ] Tolerance model (sym/asym) + validation of numeric/unit compatibility/bounds (FR-TP-073).
6. [ ] Grading engine (pure): increments, exceptions, derived values with `{ ruleVersion, baseValueRef }`; recompute on rule/base change; never overwrite overrides silently (overrides kept, flagged as diverging).
7. [ ] CSV import: parse, map POM/size columns, report unsupported fields (NFR-TP-010), store source asset + version.
8. [ ] Inline check functions (range, missing, discontinuity, duplicate sizes).
9. [ ] Diagram annotator using I35 technical-flat SVG + annotation storage with coordinate space (GEO-001).
10. [ ] Web grid with paste support and keyboard navigation (NFR-TP-004: virtualize large tables).
11. [ ] Tests; PROGRESS.md.

## 8. Tests

- Unit: conversion precision; grading (linear, exceptions, discontinuity detection); asymmetric tolerance; derived provenance; override retains reason; image-derived value keeps `inferred` status.
- Integration: grade-rule change recomputes derived cells and records rule version (AC-TP-004); overrides survive recompute; import records source; units stored canonical mm.
- E2E: set base size M, enter base values, add grade rules, see graded sizes, override one with reason.

## 9. Acceptance criteria

- [ ] AC1 — Structured measurement table with POM ids, units, base size, size range (FR-TP-049..052, PROD-003).
- [ ] AC2 — Image/AI-estimated values remain marked inferred/estimate until confirmed (AC-TP-003, FR-TP-055, FR-TP-056, GEO-002).
- [ ] AC3 — Graded values record rule version and source base measurement (AC-TP-004, FR-TP-064); overrides are recorded with source, reason, status (FR-TP-066).
- [ ] AC4 — No default/universal grade increment is applied automatically (FR-TP-063).
- [ ] AC5 — Symmetric and asymmetric tolerances supported with unit validation (FR-TP-070, FR-TP-073, FR-TP-074).
- [ ] AC6 — Inconsistent size range / grade rules / duplicate or missing sizes are detected (FR-TP-065, FR-TP-068, FR-TP-059).
- [ ] AC7 — Unit conversions are explicit with documented precision (FR-TP-051, NFR-TP-009).

## 10. Risks & notes

- Floating point: store numbers as decimal strings or integers in micrometres internally if rounding drift appears; never compare floats for equality in rules.
- Measurement method matters: two "chest" definitions are different POMs (FR-TP-058).
- Do not derive measurements from the garment-model `dimension.*` properties automatically; at most offer "copy as proposed" (I44).

## 11. Handoff

- I41 registers the inline checks as versioned rules; I42 exports the table; I44 maps components → POM templates.
- Note library versions & size ranges in PROGRESS.md.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
