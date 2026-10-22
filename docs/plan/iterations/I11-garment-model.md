# I11 — Canonical garment model package

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 2 — Core domain                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Subsystems                      | SS-03 Garment Design Model (+ shared rules used by SS-05, SS-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Depends on                      | I01 (pure package; can run in parallel with Phase 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Spec references                 | `docs/init/03-artifact-schema.md` §4 (principles), §6 (conventions, units), §7 (DSN-001…014), §8 (component schema, catalog §8.2, CMP-015…021), §9 (PropertyValue, status vocab §9.2, provenance §9.3, PROP-001…007, namespaces §9.5), §10 (relationships, types §10.3, REL-001…008), §13.2 (fidelity), §14 (coordinate spaces, GEO-001…007), §15 (constraints, CST-001…007), §16.3 (preservation), §19 (versioning, VER-001…006), §20.1 (serialization), §25 (AC-01…12); `docs/init/01-overview.md` §2.4 (FR-003); `docs/plan/03-domain-model.md` §1–2 |
| Open decisions to resolve first | **ADR-008** (initial garment categories; default woven shirt + knit T-shirt) — confirm with owner before starting; ADR-020 (mm canonical)                                                                                                                                                                                                                                                                                                                                                                                                               |

## 1. Goal

Create `packages/garment-model`: the pure-TypeScript, framework-free definition of what a garment design _is_. It contains zod schemas for the canonical design state, the component-type catalog, a property-definition registry with units and status/provenance envelopes, relationship types, constraint definitions, canonical JSON hashing, structural diffing, schema versioning/migration hooks, and starter garment templates for the initial categories. Backend persistence (I12), the operation engine (I14), the renderer (I16), the editor (I17) and validation (I20) all depend on it.

## 2. Scope

### In scope

**Schemas (zod, exported types):**

- `PropertyValue<T>`: `{ value: T | null, unit?: Unit | null, status: ValueStatus, sourceType: ValueSourceType, sourceRefs: SourceRef[], confidence?: number | null, reviewRequired: boolean, confirmedBy?: string | null, confirmedAt?: string | null }` with `ValueStatus = confirmed|inferred|proposed|missing|needs_review|not_applicable` (§9.2) and `ValueSourceType` (from `03-domain-model.md`). Rule helpers: `isConfirmed`, `promote()` refuses AI→confirmed without explicit user confirmation (PROP-007, §9.2 last line).
- `DesignComponent`: `componentId` (stable `cmp_…`), `componentType`, `displayName`, `parentComponentId`, `side` (`left|right|center|none`), `properties: Record<PropertyKey, PropertyValue>`, `artifactBindings: ArtifactBinding[]` (artifactId + **artifactRevisionId** pinned, ART-004), `geometryRefs`, `assetRefs`, `tags`, `visible`, `locked` (editor flags kept but documented as non-physical).
- `DesignRelationship`: `relationshipId`, `type`, `source: EntityRef`, `target: EntityRef`, `placement?: Placement`, `constraints: string[]`, `status`, `provenanceRefs` (§10.2).
- `Placement`: target region/anchor, translation/rotation/scale, orientation, offset with unit, **`coordinateSpace`** (`image_px|image_normalized|design_2d|component_local|world_3d|pattern`), geometry revision ref, `approximate: boolean` (§14.2, GEO-001…007).
- `Constraint`: `constraintId`, `constraintType` (§15.2 categories), `scope`, `rule`, `severity` (`error|warning|info`), `version`.
- `GarmentDesignState` (root snapshot): `schemaVersion` (semver), `garmentType`, `garmentCategory`, `components[]`, `relationships[]`, `annotationsRef?`, `metadata` (non-evidence, DSN-007), `provenance`.
- `ValidationFinding` shape (outcome vocab §15.3) for reuse in I20.

**Registries:**

- **Component type catalog** (§8.2): `garment_body`, `front_body_panel`, `back_body_panel`, `sleeve`, `cuff`, `collar`, `neckline`, `placket`, `pocket`, `waistband`, `hem`, `yoke`, `hood`, `lining`, `facing`, `gusset`, `seam_group`, `decorative_region`, `artwork_placement_region`, `custom` — each with allowed parents, repeatability (left/right, multiple pockets — CMP-017), allowed property keys, default display name, applicable garment categories.
- **Property definition registry** with namespaces (§9.5) `appearance.*`, `construction.*`, `dimension.*`, `material.*`, `placement.*`, `production.*`, `simulation.*`: key, data type (`enum|number|boolean|color|text|composition|reference|dimension`), unit kind, allowed enum values (+ registered extensions PROP-004), default status for new designs (`missing` not invented defaults — PROP-005), `manufacturingCritical` flag (PROP-006), UI hints (label, control type, group). Initial keys for shirt/T-shirt: e.g. `appearance.color`, `appearance.silhouette`, `construction.sleeve_type`, `dimension.sleeve_length`, `construction.cuff_type`, `construction.collar_type`, `construction.neckline_type`, `construction.placket_type`, `construction.pocket_type`, `placement.pocket_position`, `material.fabric_ref`, `material.composition`, `material.gsm`, `construction.hem_type`, `dimension.body_length`, `dimension.chest_width`.
- **Relationship type registry** (§10.3): `attached_to`, `contains`, `overlays`, `applied_to`, `decorative_trim_applied_to`, `embroidery_placed_on`, `lining_for`, `aligned_with`, `derived_from`, `constrained_by`, `connected_to`, `replaces`, `references` — each with allowed source/target entity types, cardinality, validation hook (REL-002…005).
- **Units** (`units.ts`): length (`mm` canonical, `cm`, `in`), mass/area (`gsm`), angle (`deg`), percentage; deterministic conversion + rounding rules; physical dimensions without unit rejected (PROP-003; ADR-020).

**Functions:**

- `validateDesignState(state, catalog)` → structural findings (type safety, references valid, parent types allowed, units present, relationship endpoints exist, pinned artifact revisions present) — business constraint sets come in I20.
- `canonicalize(state)` (stable key order, normalized numbers, sorted arrays where order is not semantic) + `contentHash(state)` → `sha256:…` (ADR-003).
- `diffDesignStates(a, b)` → `{ components: {added, removed, changed: [{componentId, properties: [{key, before, after}], bindings, flags}]}, relationships: {...}, artifactRefs: {...}, metadataOnly: boolean }` distinguishing semantic vs metadata/editor-flag changes (DSN-011; FR-PRJ-031).
- `createComponentId()`, `cloneWithNewIds()` (for duplication).
- Schema versioning: `SCHEMA_VERSION = '1.0.0'`, `migrations` registry `(fromVersion) → (state) → state` with guard that unknown/non-confirmed values never become confirmed (VER-001…006); `readAnyVersion(state)` upgrades for reading without mutating stored snapshots.
- **Garment templates** (`templates/`): `woven_shirt` (body, front/back panels, left/right sleeves, left/right cuffs, collar, placket, optional chest pocket, hem) and `knit_tshirt` (body, panels, sleeves, neckline/rib, hem) producing a valid `GarmentDesignState` with properties defaulting to `missing`/`proposed` template defaults clearly marked `sourceType: template` (never `confirmed`).

### Out of scope (deferred to)

- Persistence (→ I12), operations (→ I14), geometry/SVG (→ I16), versioned business constraint sets (→ I20), production spec model (→ I38 `techpack-model`).

## 3. Deliverables

- `packages/garment-model/src/`
  - `schema/{property-value.ts,component.ts,relationship.ts,placement.ts,constraint.ts,design-state.ts,finding.ts,entity-ref.ts}`
  - `registry/{component-types.ts,property-definitions.ts,relationship-types.ts,garment-categories.ts}`
  - `units.ts`, `status.ts`, `ids.ts`
  - `canonical/{canonicalize.ts,hash.ts}` (hash via Web Crypto/`@noble/hashes` so it runs in browser and Node)
  - `diff/diff-design-states.ts`
  - `validation/structural.ts`
  - `versioning/{version.ts,migrations.ts}`
  - `templates/{woven-shirt.ts,knit-tshirt.ts,index.ts}`
  - `index.ts` (public API)
- `packages/garment-model/README.md` (concepts + examples)
- ADR-008 recorded as Accepted (or changed categories) in `05-decisions.md`

## 4. Data model changes

None in the database. Defines the JSON stored in `WorkingCopy.state` and `DesignRevision.snapshot` (I12).

## 5. API / contracts

Package exports only (no HTTP). Public API surface: schemas + inferred types, registries (read-only), `validateDesignState`, `canonicalize`, `contentHash`, `diffDesignStates`, `migrateToLatest`, `templates.create(category)`, units helpers, status helpers.

## 6. UI

None. (`ValueStatusBadge` from I04 maps to `ValueStatus`.)

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-008 with owner (or record default); list categories in `registry/garment-categories.ts`.
2. [ ] Status, source types, units with tests.
3. [ ] PropertyValue schema + generic typed variants per data type.
4. [ ] Component/relationship/placement/constraint/design-state schemas.
5. [ ] Registries (component types, properties, relationships) with self-consistency tests (every property used by a component type is defined; every relationship type has endpoint rules).
6. [ ] Structural validation.
7. [ ] Canonicalization + hash (cross-runtime test: same hash in Node and jsdom/browser env).
8. [ ] Structural diff.
9. [ ] Versioning + migration framework (with a fake 0.9→1.0 migration test).
10. [ ] Templates for shirt and T-shirt; validate they pass structural validation.
11. [ ] README with examples; dependency-boundary lint confirms no React/Nest/Prisma imports.
12. [ ] Update `PROGRESS.md`.

## 8. Tests

- Unit (target ≥90% coverage in this package): schema accept/reject tables; unit conversions round-trip; physical dimension without unit rejected; enum extension registration; hash stability under key reordering and insignificant whitespace; hash changes when any semantic field changes; diff detects add/remove/property change/artifact revision change and flags metadata-only changes; migration never upgrades `inferred` to `confirmed`; templates valid; repeated components (left/right sleeves) addressable independently; two components bound to the same artifact revision keep independent properties (SPEC-003 AC-03).
- Property-based tests (fast-check) for canonicalize/hash idempotence.

## 9. Acceptance criteria

- [ ] AC1 — Every property supports value, unit, status, provenance and review info; status vocabulary matches SPEC-003 §9.2 exactly (PROP-001…006).
- [ ] AC2 — Component catalog covers SPEC-003 §8.2 and is extensible without schema redesign (§4.4; CMP-015…018).
- [ ] AC3 — Relationship registry covers §10.3 with endpoint/cardinality rules (REL-001…005).
- [ ] AC4 — Artifact bindings always pin an explicit artifact revision (ART-004).
- [ ] AC5 — Deterministic canonical hash and structural diff exist and are tested (DSN-010, DSN-011).
- [ ] AC6 — Schema version recorded on every state; migrations deterministic and never promote unknown values (VER-001…003).
- [ ] AC7 — Shirt and T-shirt templates produce valid states with no invented confirmed values (PROP-005, AC-06 SPEC-003).
- [ ] AC8 — Package has zero dependencies on React, NestJS, Prisma or AI providers (TECH §4).

## 10. Risks & notes

- This schema becomes hard to change once revisions exist — spend time here. Prefer additive evolution; reserve `custom` component type and extension property keys.
- Don't encode geometry here beyond refs/placements; parametric shapes are in `garment-render` (I16).
- Keep editor-only flags (`visible`, `locked`) excluded from "semantic" diff and documented as non-physical (FR-EDT-024).

## 11. Handoff

- I12 stores `GarmentDesignState` and uses `contentHash`/`diffDesignStates`.
- I13 reuses PropertyValue and compatibility types for artifact revisions.
- I14 builds operations as pure functions over `GarmentDesignState`.
- I16 maps component types + properties to SVG geometry.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
