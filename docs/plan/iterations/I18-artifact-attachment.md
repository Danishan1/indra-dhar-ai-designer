# I18 — Artifact browser & structured attachment

| Field | Value |
|---|---|
| Phase | 3 — Structured 2D editor |
| Subsystems | SS-04 Editor, SS-05 Artifact Registry, SS-06 Operations, SS-10 (2D trims) |
| Depends on | I13, I17 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/07-editor.md` §10 (asset & artifact browser FR-EDT-049…059); `docs/init/03-artifact-schema.md` §10 (relationships), §11 (artifact registry ART-001…014, §11.6 update policy), §14 (placement), §15 (constraints), §23 (attach-lace workflow); `docs/init/10-visualization.md` §12.2 (trims FR-RV-077…082); `docs/init/09-specification.md` §12.2 (artifact security FR-SEC-114…119) |
| Open decisions to resolve first | none |

## 1. Goal
Users browse built-in, organization and personal artifact libraries inside the editor, see compatibility with the current selection, and **attach, replace or detach** artifacts (sleeves, collars, cuffs, pockets, fabrics, lace, embroidery, trims) as structured, revision-pinned relationships with editable placement. They can also save a selected component as a new reusable artifact. This realises the platform's core reuse promise without AI.

## 2. Scope
### In scope
- Asset & artifact browser panel (tabbed): Library (platform / organization / mine), Project source assets (uploads from I09), Generated (empty until I25). Filters: category, type, tags, compatibility with selection; search; infinite scroll with thumbnails (NFR-EDT-005).
- Artifact detail drawer: preview(s), display id + revision, owner scope, visual vs physical properties (missing physical values shown as `missing`, ART-008), compatibility targets, geometry capability (raster-only vs vector).
- Compatibility feedback for current selection: compatible / compatible with review / incompatible + reason (FR-EDT-052, ART-012).
- Attach flows via operations: drag-and-drop onto canvas component or "Attach to selection" button → `attach_artifact`; component-type artifacts (e.g. sleeve template) → `replace_artifact` updating component properties from artifact definition; fabrics → material property binding; trims/lace/embroidery → relationship with placement (`region`, `anchor`, `offset_mm`, `orientation`, `repeat`).
- Placement controls in properties panel for selected relationship: region select, offset, scale, rotation, alignment; coordinate space shown (FR-EDT-054, GEO-004).
- Rendering of attached items via garment-render (fabric pattern fill; trim along boundary; embroidery/artwork placement box with preview image) with approximation indicators.
- Detach and replace as explicit operations (FR-EDT-056); relationship removal never deletes endpoints (REL-006).
- Artifact unavailability (deactivated/no access): keep pinned reference, show warning, no silent substitution (FR-EDT-059).
- "Newer revision available" indicator with explicit "Update to Rn" action creating a `replace_artifact` op (ART-005, §11.6).
- Save selection as artifact: creates artifact + revision in user or org scope (permission `artifact.create`), with preview generated from the SVG scene (FR-EDT-057).

### Out of scope (deferred to)
- AI-assisted placement or visual approximation (→ I25/I27)
- Artifact publishing to shared/global libraries & marketplace (→ I45/backlog)
- 3D artifact geometry (→ I36/I37)

## 3. Deliverables
- `apps/web/src/features/editor/library/{LibraryPanel.tsx, ArtifactCard.tsx, ArtifactDrawer.tsx, CompatibilityBadge.tsx, useArtifactSearch.ts, DragAttach.tsx}`
- `apps/web/src/features/editor/properties/PlacementControls.tsx`
- `garment-render` support for placements/trims/fabric bindings (extend I16 modules)
- API additions in `artifacts` module: `GET /v1/artifacts?compatibleWith=…` filter, `POST /v1/artifacts/from-component`
- Seed additions: built-in library entries with vector geometry for lace border, piping, 2 fabrics, 1 embroidery motif, sleeve/collar/cuff variants (if not already seeded in I13)

## 4. Data model changes
None new (uses `Artifact`, `ArtifactRevision`, relationships inside garment state). Possibly add `preview_asset_id` generation for user-created artifacts.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/artifacts` (+`compatibleWith`, `scope`, `category`, `q`) | `artifact.view` | Library search |
| `GET /v1/artifacts/{id}/revisions/{revId}` | `artifact.view` | Detail |
| `POST /v1/artifacts/from-component` | `artifact.create` | Save selected component/region as artifact |
| `POST /v1/designs/{id}/operations` | `design.edit` (+ server checks `artifact.use` on referenced revision) | attach/replace/detach/update_placement |

## 6. UI
Library panel (left/bottom tab), detail drawer, drag preview ghost, compatibility badges, placement controls, "update available" chip on bound artifacts.

## 7. Implementation tasks (ordered checklist)
1. [ ] Compatibility evaluator shared in `garment-model` (pure) used by both client hints and server validation.
2. [ ] Library panel + search hook (query keys include organizationId).
3. [ ] Drawer with visual vs physical property sections.
4. [ ] Attach/replace/detach UI → operations; optimistic render.
5. [ ] Extend garment-render for fabric fills, trims, embroidery placement boxes; approximate indicators.
6. [ ] Placement controls with unit handling.
7. [ ] Unavailable/newer-revision handling.
8. [ ] Save-as-artifact endpoint + SVG preview asset creation through assets service.
9. [ ] Tests; Playwright "attach lace to left sleeve hem".
10. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: compatibility evaluator matrix; placement transforms reproducible (GEO-005).
- Integration: attach pins exact revision; using another org's private artifact → rejected (FR-SEC-115, SPEC-003 AC-11); artifact update leaves existing design on old revision (AC-02 SPEC-003).
- E2E: drag lace onto sleeve → relationship created → flat shows lace → revision pin visible; replace with newer revision via explicit action.

## 9. Acceptance criteria
- [ ] AC1 — Users browse/search/filter artifacts they are permitted to see; previews inspectable before attaching. (FR-EDT-049…051, FR-SEC-114)
- [ ] AC2 — Compatibility with the selected component is communicated before attaching. (FR-EDT-052, ART-012)
- [ ] AC3 — Attaching creates a structured relationship with the exact artifact revision and placement. (FR-EDT-053, FR-EDT-055, AC-EDT-003, SPEC-003 AC-04)
- [ ] AC4 — Newer artifact revisions never silently change the design; migration is explicit. (ART-005, AC-EDT-004, SPEC-006 AC-005)
- [ ] AC5 — Two sleeves referencing the same artifact keep independent properties. (SPEC-003 AC-03)
- [ ] AC6 — Using an artifact does not grant edit/publish/delete rights on it. (FR-SEC-116, FR-EDT-058)
- [ ] AC7 — Unavailable artifacts keep their reference with a visible limitation; no substitution. (FR-EDT-059)
- [ ] AC8 — Approximate placements are visibly distinguished from validated ones. (REL-008, FR-RV-079)

## 10. Risks & notes
- Raster-only artifacts (no vector geometry) can be bound but render as image overlays labelled approximate — do not pretend structural attachment.
- Keep fabric visual properties separate from physical composition (no inference).

## 11. Handoff
- I19 diff must show artifact attach/replace changes; I25 uses artifact revisions as AI reference inputs.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
