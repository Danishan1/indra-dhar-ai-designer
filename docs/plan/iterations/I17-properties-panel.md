# I17 — Hierarchy, selection & contextual properties

| Field                           | Value                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 3 — Structured 2D editor                                                                                                                                                                                                                                                  |
| Subsystems                      | SS-04 Editor Interaction, SS-03 Garment Design Model, SS-06                                                                                                                                                                                                               |
| Depends on                      | I16                                                                                                                                                                                                                                                                       |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                         |
| Spec references                 | `docs/init/07-editor.md` §7 (hierarchy & selection FR-EDT-018…027), §8 (contextual properties FR-EDT-028…038); `docs/init/03-artifact-schema.md` §8 (components), §9 (property value, status, provenance PROP-001…007); `docs/init/01-overview.md` FR-032…034, FR-040…042 |
| Open decisions to resolve first | none                                                                                                                                                                                                                                                                      |

## 1. Goal

Users can navigate the garment's **component hierarchy**, select components from the tree or canvas with synchronized highlighting, and edit their properties through **schema-driven controls** that respect data types, units, enums and constraints — with every value showing its status (confirmed / inferred / proposed / missing / needs review / n.a.) and provenance. All changes go through operations (I14); nothing calls AI.

## 2. Scope

### In scope

- Hierarchy panel: tree from `components[].parentComponentId`, garment-type ordering, icons per component type, repeated components (left/right sleeves, multiple pockets), visibility eye, lock toggle, rename, context menu (add/remove component where template allows).
- Selection sync tree ↔ canvas ↔ properties panel (FR-EDT-020); multi-select with Shift/Ctrl; components without canvas geometry are selectable from tree with an explanation (FR-EDT-026).
- Properties panel generated from `garment-model` property definitions: control types — enum select / segmented, number with unit (display in user unit, stored mm), color (with color reference code field), boolean, text, artifact reference (read-only here; attach in I18).
- Design-level properties panel when nothing is selected (garment type, name, target market metadata).
- Value status UI: `<ValueStatusBadge>` + provenance popover (source type, source refs, confirmed by/at); actions "Confirm", "Mark needs review", "Reset to default/previous" (FR-EDT-034, 035, 037) via `set_property_status` / `reset_property` ops.
- Client-side validation from zod + server findings display inline (blocking vs warning) (FR-EDT-030, 038).
- Dependent property rules surfaced (e.g. `cuff_type` hidden when `sleeve.length=short`) using `garment-model` dependency rules; unresolved conflicts listed (FR-EDT-033).
- Bulk edit for multi-selected compatible components with scope disclosure (FR-EDT-036).
- Render-refresh-pending indicator if re-render lags (FR-EDT-031).

### Out of scope (deferred to)

- Artifact browser/attachment (→ I18); full validation summary panel (→ I20)
- AI suggestion generation (→ I25/I26; this iteration only displays statuses)

## 3. Deliverables

- `apps/web/src/features/editor/hierarchy/{HierarchyPanel.tsx, TreeNode.tsx, useHierarchy.ts}`
- `apps/web/src/features/editor/properties/{PropertiesPanel.tsx, controls/*.tsx, PropertyRow.tsx, ProvenancePopover.tsx, BulkEditBar.tsx}`
- `apps/web/src/components/ValueStatusBadge.tsx` (shared)
- `garment-model` additions if missing: property definition metadata (label, group/namespace `appearance.*`, `dimension.*`…, control hint, visibility rules, min/max, unit, `productionCritical` flag)

## 4. Data model changes

None in DB. Possible minor version bump of garment-model property-definition metadata.

## 5. API / contracts

Uses `POST /v1/designs/{id}/operations` (I14) and `.../operations/validate`. No new endpoints.

## 6. UI

- Left: hierarchy tree with eye/lock icons. Right: properties grouped by namespace (Appearance, Construction, Dimensions, Material, Placement) with collapsible sections; progressive disclosure for advanced fields (SPEC-007 §3.6).
- Status badges are text+icon (not color-only) (FR-EDT-129).

## 7. Implementation tasks (ordered checklist)

1. [ ] Extend garment-model property definitions metadata (coordinate version bump).
2. [ ] Hierarchy tree with keyboard navigation (arrow keys, Enter to select) and ARIA tree roles.
3. [ ] Selection sync through editor-core `SelectionModel`; canvas highlight from I16.
4. [ ] Control factory mapping property definitions → controls; unit conversion helpers.
5. [ ] Wire edits to operations (debounced for sliders/number inputs → grouped single undo step).
6. [ ] Status badge + provenance popover + confirm/reset actions.
7. [ ] Dependency rule evaluation and hidden/disabled reasons.
8. [ ] Bulk edit flow with confirmation of scope.
9. [ ] Tests + Playwright journey.
10. [ ] Update PROGRESS.md.

## 8. Tests

- Unit: control factory for each data type; unit conversions round-trip; dependency rules.
- Component: invalid number shows error and is not submitted.
- E2E: select left sleeve in tree → canvas highlights it → change length → flat updates → undo restores; confirm an `inferred` value → badge becomes `confirmed` and provenance shows user/time.

## 9. Acceptance criteria

- [x] AC1 — Hierarchy shows all components incl. repeated ones; selection syncs across tree, canvas and panel. (FR-EDT-018…020, CMP-017)
- [x] AC2 — Properties panel shows only properties valid for the selected component/garment type. (FR-EDT-028, FR-042)
- [x] AC3 — Invalid values are rejected before submission; server findings shown inline. (FR-EDT-030, PROP-002)
- [x] AC4 — Statuses confirmed/inferred/proposed/missing/needs_review/n.a. are visible and distinguishable without color. (FR-EDT-034, FR-EDT-129, FR-032)
- [x] AC5 — Confirming a value is an explicit, attributed operation; AI-origin values are never auto-confirmed. (PROP-006, SPEC-003 AC-06)
- [x] AC6 — Property change does not trigger any AI call. (FR-EDT-032, AC-EDT-001/002)
- [x] AC7 — Visibility/lock are distinct from design properties and do not modify geometry. (FR-EDT-023, 024)
- [x] AC8 — Unsupported operation on a selection is explained, never applied to another component. (FR-EDT-027)

## 10. Risks & notes

- Keep property definitions data-driven so new garment categories need no UI code (NFR-EDT-009).
- Visibility/lock: decide whether stored in working copy (design presentation) or editor state; per SPEC-007 §20, lock/visibility for editing convenience are editor state — but I14 defined ops for them; store them in working copy `editorHints` namespace flagged non-design so they never appear in diffs as design changes.

## 11. Handoff

- I18 adds artifact reference controls into this panel.
- I20 consumes the inline finding slots.

## 12. Completion record

- Completed on: 2026-10-27
- Sessions used: 1
- Deviations from plan (ADR-052):
  - Files are kebab-case: `hierarchy/{hierarchy-panel.tsx, use-hierarchy.ts}` (tree rows inside the panel file), `properties/{properties-panel.tsx, property-row.tsx (+ provenance popover), controls.tsx, value-input.ts}`; bulk edit is part of the panel (scope box + "Edit all N"), not a separate `BulkEditBar`. `ValueStatusBadge` already existed (I04) and is reused. New shared `components/ui/popover.tsx`.
  - Property definitions gained `ui.advanced` only (label, group, control, min/max, unit kind and `manufacturingCritical` already existed); no schema version bump (registry metadata, not stored data).
  - Visibility/lock stay `visible`/`locked` component fields (already excluded from semantic diff/hash since I11) — no `editorHints` namespace. Lock is enforced in the UI only.
  - Dependency rules are a new `garment-model` module (none existed): sleeveless, short sleeve → no cuff, zip/no closure → no button count, no placket/pocket/collar → dependent values. The example "cuff hidden when sleeve short" is shown as disabled-with-reason (and a conflict when a value is still set) rather than hidden, so nothing silently disappears.
  - Design-level panel is read-only (no operation for design name/category/metadata yet).
  - Colour reference code: the hex code field doubles as the code; a separate colour-standard reference (Pantone etc.) needs a property → backlog.
  - Render-pending indicator uses React `useDeferredValue` ("Updating drawing…").
  - The dev debug panel was removed; e2e specs now edit through the properties panel.
- Tests: garment-model 127 (+4 rules), web unit 72 (+value input, hierarchy, property row, store refusals), e2e 26 (+1 I17 journey: tree ↔ canvas ↔ panel sync, type-specific properties, invalid value not submitted, redraw + undo, confirm with provenance, dependency conflict, keyboard navigation, lock without geometry change, bulk edit with scope, no non-operation writes).
- Follow-ups added to backlog: see "From I17".
