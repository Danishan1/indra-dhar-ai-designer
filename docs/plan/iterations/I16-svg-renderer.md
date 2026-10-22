# I16 — Parametric 2D garment renderer (SVG)

| Field | Value |
|---|---|
| Phase | 3 — Structured 2D editor |
| Subsystems | SS-10 Rendering & Visualization (client 2D), SS-04 Editor, SS-03 |
| Depends on | I11, I15 |
| Estimated sessions | 3 |
| Spec references | `docs/init/10-visualization.md` §5 (principles), §6 (representation layers), §9 (2D architecture FR-RV-021…043), §10 (component geometry & capability classes FR-RV-044…053), §12.1–12.3 (materials/trims/color), §20 (UX); `docs/init/07-editor.md` §6 (viewport FR-EDT-009…017), §16.1; `docs/init/03-artifact-schema.md` §13–14 (fidelity, coordinate spaces) |
| Open decisions to resolve first | ADR-024 (parametric SVG approach — confirm); ADR-008 (initial garment categories must be decided) |

## 1. Goal
Render the canonical garment state as a **deterministic, editable, component-aware SVG technical flat** (front and back views) for the initial garment categories, entirely in software — no AI. Each SVG element carries the stable component id so selection, highlighting and later placement work on structured data, not pixels. This is the visual heart of the M3 editor and the basis for server-side technical-flat export in I35.

## 2. Scope
### In scope
- `packages/garment-render` (pure TS, no React; runs in browser and Node worker):
  - Template registry per garment type (ADR-008, e.g. `woven_shirt`, `knit_tshirt`) defining view layout (front/back), anchor points (shoulder, armhole, neck, hem, cuff edge), and the component tree it expects.
  - Geometry function per component type: `(component, properties, context) → GeometryResult { paths[], anchors, boundaryPaths (edges for trims), bbox, capability: 'G2' }` using design-space coordinates in **mm** (ADR-020) with a declared `coordinateSpace: 'design_2d'`.
  - Parameter mapping: property values (e.g. `sleeve.length`, `sleeve.silhouette`, `collar.type`, `body.fit`, `hem.shape`, `pocket.type/placement`) → geometry parameters; missing/`inferred` values fall back to template defaults **flagged as placeholder** in the result (FR-RV-004).
  - Style layer: line styles for silhouette, seam, stitch (dashed), fold, hidden edge (FR-RV-028).
  - Fill resolution: solid color, fabric texture via SVG `<pattern>` referencing an asset URL resolver callback (no network inside package), with scale/orientation.
  - Trim rendering: repeat an artifact motif along a boundary path (lace on hem/cuff) using path length sampling; fall back to labelled approximate band when boundary missing.
  - Output: a serializable scene `{ views: { front, back }, elements: [{ id, componentId, role, d, style }] }` + `toSvgString()` for server/export use.
  - Never fabricate a back view by mirroring unless the template explicitly defines it as symmetric (FR-RV-030); otherwise mark `BACK_VIEW_NOT_AVAILABLE`.
- `apps/web` canvas component `GarmentCanvas`:
  - React renders scene elements with `data-component-id`, `aria-label`.
  - Zoom (wheel/pinch), pan (space+drag / middle mouse), fit-to-view, reset; view switch Front/Back/Split (FR-EDT-009…012).
  - Hit-testing by element → component id → `SelectionModel` (editor-core); hover highlight overlay not altering design (FR-EDT-021).
  - Layer visibility for: garment, trims, artwork placeholders, annotations (future), guides.
  - Capability badge "Structured 2D (G2)" and placeholder warnings (FR-RV-049, FR-RV-053).
- Incremental re-render: only recompute geometry of changed components (memoize by component property hash) — target p95 < 100 ms for basic updates (SPEC-010 §22).

### Out of scope (deferred to)
- Properties panel & hierarchy (→ I17); attachment UI & placement controls (→ I18)
- Server-side render jobs, PNG/PDF export, cache (→ I35)
- Freehand/mask overlays (→ I27); 3D (→ I36)

## 3. Deliverables
- `packages/garment-render/src/{registry.ts, templates/<garmentType>/*.ts, components/{body,sleeve,collar,cuff,placket,pocket,hem,yoke}.ts, trims.ts, fills.ts, styles.ts, scene.ts, svg-string.ts, index.ts}`
- Golden-file snapshot tests (`__snapshots__/*.svg`) per template for representative property combinations
- `apps/web/src/features/editor/canvas/{GarmentCanvas.tsx, useViewport.ts, hitTest.ts, ViewTabs.tsx, CapabilityBadge.tsx}`
- Dev gallery route `/dev/garment-gallery` (non-production flag) rendering all templates × variants

## 4. Data model changes
None in the DB. `garment-model` may gain per-garment-type default property values and template ids (coordinate with I11 exports; bump schema minor version if fields added).

## 5. API / contracts
No new endpoints. Package exports: `renderGarment(state, options) → Scene`, `sceneToSvg(scene, opts)`, `listTemplates()`, `geometryCapability(state)`.

## 6. UI
- Viewport shows front/back flats; split view; zoom % in status bar; fit button; capability badge; placeholder warning chip listing components drawn with defaults.

## 7. Implementation tasks (ordered checklist)
1. [ ] Confirm ADR-008 categories and ADR-024 approach; record in 05-decisions.md.
2. [ ] Define anchor/coordinate conventions (origin at centre-front neck point, y down, mm) and document in package README.
3. [ ] Implement body/sleeve/collar/cuff/placket/pocket/hem geometry for category 1; then category 2.
4. [ ] Style + fill + trim modules; texture resolver injection.
5. [ ] Scene builder with memoization; `toSvgString` (sanitized output, no scripts).
6. [ ] Snapshot tests + property-based tests (geometry stays within bbox, no NaN paths for all enum combos).
7. [ ] `GarmentCanvas` with viewport math from editor-core; hit-test; selection highlight overlay.
8. [ ] Wire to editor store: on working-copy patch → re-render changed components.
9. [ ] Dev gallery; Playwright visual smoke (screenshot compare with tolerance; do not treat diffs as model mismatch — FR from SPEC-007 §25.2).
10. [ ] Update PROGRESS.md (document supported property→geometry mapping table).

## 8. Tests
- Unit: each component geometry for all enum values; unit conversions; trim sampling count proportional to path length; back-view rule.
- Snapshot: golden SVGs per template variant.
- Performance: benchmark re-render of single sleeve change < 16 ms in Node for typical design.
- E2E: click sleeve in canvas → selection id equals sleeve component id.

## 9. Acceptance criteria
- [ ] AC1 — Each rendered element resolves to its canonical component id; selecting it selects the component. (FR-RV-022, FR-RV-026, FR-EDT-019, FR-EDT-025)
- [ ] AC2 — Changing a supported property (e.g. sleeve length/silhouette) updates the flat deterministically without AI. (FR-RV-117, FR-EDT-032, AC-EDT-002)
- [ ] AC3 — Rendering is deterministic: same state + options ⇒ byte-identical SVG. (FR-RV-076, NFR-RV-018)
- [ ] AC4 — Views declare capability G2; components drawn from defaults are flagged placeholder. (FR-RV-049, FR-RV-004, FR-RV-053)
- [ ] AC5 — Back view never fabricated by mirroring unless template declares symmetry. (FR-RV-030)
- [ ] AC6 — Zoom/pan/fit/reset never alter garment properties. (FR-EDT-010…013, FR-RV-066)
- [ ] AC7 — Lace trim on a hem with boundary geometry follows the edge; without boundary it renders an "approximate" indicator. (FR-RV-078, FR-RV-079)
- [ ] AC8 — Basic structured viewport update p95 < 100 ms on reference device. (SPEC-010 §22, NFR-EDT-002)

## 10. Risks & notes
- **Cross-iteration (planning review):** consume and extend the `ParametricShapeParams` type that I13 defines in `packages/garment-model` for artifact geometry parameters — do not create a parallel type. Requires ADR-008 (initial garment categories) to be settled (it is decided before I11).
- This is the largest single UX investment; keep geometry functions simple and parametric — **not** a pattern-making engine (no G5 claims).
- Keep `garment-render` free of DOM APIs so the worker can reuse it in I35.
- Fabric textures shown on screen do not guarantee physical color (FR-RV-085) — add a tooltip on fills.

## 11. Handoff
- I17 consumes `Scene.elements` for hover/selection and uses the property→geometry mapping to know which properties are "visual".
- I18 uses `boundaryPaths` + anchors for placement.
- I35 calls `sceneToSvg` server-side.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
