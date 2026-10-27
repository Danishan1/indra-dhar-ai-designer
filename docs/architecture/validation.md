# Design-structure validation (I20)

Checks **how a design is put together** — never production readiness (CST-006, FR-EDT-124; tech-pack checks
are I41). Decisions: ADR-055. Spec: SPEC-003 §15, SPEC-007 §17.

## Engine (`packages/garment-model/src/validation/`)

- `engine.ts` — `runDesignValidation(state, constraintSet)`: runs the structural checks (`validateDesignState`:
  schema, references, units, evidence) and every rule of the set that applies to the garment type. Each
  finding gets a stable `findingId` (hash of rule + entity + path), a `severity` (`blocking | warning | info`),
  the `ruleVersion` and a `category`; the list is sorted (severity, rule, id). Same state + same set version ⇒
  identical report (CST-004).
- Outcomes stay `valid | warning | error | not_evaluated | requires_manual_review`; manual review is shown as
  its own kind and stays until the cause is gone (§15.3). Warnings never count as a pass.
- Rules (`rules/*.ts`) are code, versioned individually (`id@version`): required components, cuff needs a
  sleeve, sided pairs, collar vs hood, conflicting values (from `evaluatePropertyRules`), dimension ranges
  (typical → warning, limits → blocking), defining options chosen, rigid trims on knits, approximate
  placements (manual review), unconfirmed production-critical values (info).
- `constraint-sets/design-structure.ts` — `design-structure@1.0.0` with ranges per garment type. **Never change a
  released version**: add a new version (the API logs `constraint_set_changed` when rules differ from the stored
  row).

## API (`apps/api/src/modules/validation/`, owns `constraint_sets`, `validation_runs`, `validation_findings`)

| Route (`/v1/orgs/:orgId/…`)                                        | Permission                       |
| ------------------------------------------------------------------ | -------------------------------- |
| `POST designs/:designId/validation-runs` `{ target, revisionId? }` | `design.view` (design)           |
| `GET designs/:designId/validation-runs/latest?target=&revisionId=` | `design.view` (design)           |
| `GET validation-runs/:runId`                                       | `design.view` (`validation_run`) |

- Constraint sets are recorded at API start. A run stores target (`working_copy` at its version, or a hash-verified
  revision), the state's semantic hash, the set ref, counts and findings; an identical earlier run is returned
  instead of a new one. Working-copy runs are **stale** when the working copy's version moved on; the newest 5 per
  design are kept. Event: `validation.findings_updated`.
- Commits store `validationSummary = { errors, warnings, manualReview, info, constraintSet }` computed with the same
  engine (designs module, `validationSummaryOf(state)`). Blocking findings do not block saving or committing;
  approvals (I28) and tech packs (I41) decide what they gate.

## Editor (`apps/web/src/features/editor/validation/`)

- `ValidationProvider` reads the latest working-copy run and asks the server to re-run 1.2 s after each saved
  change (a failed automatic run is not retried for the same version). Old results stay visible, marked stale.
- `ValidationPanel` (bottom "Validation" tab with a count): scope label, constraint set + version, counts and
  filters by kind (Blocking / Warning / Needs review / Info), message → resolution, rule id, Show (selects the
  component; relationship findings go to their target), Re-run.
- Inline: property rows show findings whose path is that property; the properties panel lists the selected
  component's findings; the tree shows the worst kind; the canvas shows a badge per component (or on its nearest
  drawn ancestor when the component is not drawn).
- Icons and text, never colour alone (FR-EDT-119).
