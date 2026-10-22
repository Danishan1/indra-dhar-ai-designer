# I36 — Interactive 3D viewer

| Field | Value |
|---|---|
| Phase | 7 — Advanced visualization |
| Subsystems | SS-10 Rendering & Visualization, SS-04 Editor, SS-11 Assets, SS-05 Artifact Registry |
| Depends on | I35 (manifests, representations, render-contracts) |
| Estimated sessions | 2 |
| Spec references | `docs/init/11-tech-stack.md` §3.8; `docs/init/10-visualization.md` §10.2 (G-classes), §11 (FR-RV-054…071), §12 (FR-RV-072…086), §13.1 (FR-RV-087), §19 (FR-RV-165), §21 (FR-RV-190…192), AC-RV-003/004/013/016; `docs/init/07-editor.md` §6 (FR-EDT-009…017), §16.2–16.3 (FR-EDT-108…116), AC-EDT-010; `docs/init/03-artifact-schema.md` §13.2 (F-levels), AST-010 |
| Open decisions to resolve first | ADR-019 (viewer only — accepted); minimum supported browsers/GPU (FR-RV-061) — define in-session |

## 1. Goal
Add an interactive 3D viewport (Three.js + React Three Fiber + Drei) that loads supplied GLB/glTF garment models bound to a design revision (or to an artifact revision), with orbit/pan/zoom, camera presets, materials and textures, component isolation where node data allows, clear provenance and capability disclosure (3D-L1 / G3 "approximate"), robust loading/error states and a graceful fallback to 2D — without promising geometry generation or simulation.

## 2. Scope
### In scope
- GLB/glTF upload as a `Model3DAsset` attached to a design revision or artifact revision (variant label, e.g. "base mannequin fit").
- Server-side validation job (worker): size limits, parse with glTF validator / three loader in Node, triangle/texture limits, reject external URIs & embedded scripts, extract node names & materials, compute bounding box; quarantine on failure (FR-RV-060, FR-RV-190…192).
- Draco/Meshopt decoding support optional (decide in-session; document).
- Viewer: R3F canvas, Drei `OrbitControls`, `Environment`/lights, presets (front, back, side, ¾), fit-to-view, reset, progressive loading + suspense, error boundary.
- Capability label: displays `3D-L1 Interactive visualization` / geometry `G3 Approximate` unless asset metadata proves otherwise (FR-EDT-108, AC-EDT-010); provenance panel (uploaded by, source revision, asset ID).
- Model variant selection where several assets exist.
- Representation record + manifest (`representation_type='3d_scene'`, `geometry_capability='G3'`, `sync_level='S1'` initially).
- Fallback: WebGL unsupported/failure → message + switch to 2D view (FR-RV-062, FR-EDT-116).
- Viewport state (camera) never modifies design state (FR-RV-066).
- Split view 2D | 3D in editor (FR-EDT-009/014).

### Out of scope (deferred to)
- Selection sync, material/color propagation (→ I37).
- AI/automatic mesh generation, cloth simulation, pattern-linked geometry (→ backlog, ADR-019).
- GLB export of edited scenes (→ I37 for supported scenes).

## 3. Deliverables
- `apps/web/src/features/editor/viewport-3d/` (Viewer, controls, presets, capability badge, fallback)
- `apps/worker/src/processors/model3d-validate.processor.ts`
- `apps/api/src/modules/rendering/model3d/` (upload registration, list, attach to revision/artifact)
- `packages/render-contracts` additions: `Model3DMetadata`, capability levels enum
- Sample GLB fixtures (license-safe, simple shirt mesh with named nodes) in `packages/test-utils/fixtures/3d/`
- Migration `…_i36_model3d`

## 4. Data model changes
- `model3d_assets` (organization_id, asset_id, design_id?, design_revision_id?, artifact_revision_id?, variant_label, capability_level `3D-L1`, geometry_capability `G3`, node_names JSONB, materials JSONB, bounds JSONB, validation_status, validated_at)
- `representations` rows for 3D scenes.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{designId}/revisions/{revisionId}/models3d` | `design.edit` | Register uploaded GLB (asset from I09 upload) → validation job |
| `POST /v1/artifacts/{artifactId}/revisions/{revId}/models3d` | `artifact.create` | Attach GLB to artifact revision (new artifact revision if required — revisions immutable) |
| `GET /v1/designs/{designId}/models3d?revisionId=` | `design.view` | List variants + status |
| `GET /v1/models3d/{id}/download` | `design.view` | Signed URL for viewer |

Events: `Model3DValidated`, `Model3DRejected`.

## 6. UI
- View switcher: Reference | 2D | 3D | Split | Compare.
- 3D toolbar: presets, fit, reset, wireframe toggle (inspection), environment light toggle, variant dropdown.
- Badges: "3D-L1 · approximate geometry · not production-validated"; provenance popover.
- Loading skeleton with progress; error card with retry and "switch to 2D".

## 7. Implementation tasks (ordered checklist)
1. [ ] Define supported browsers/GPU baseline; document in decisions.
2. [ ] Worker validation processor with limits; fixtures.
3. [ ] API registration/list/download; attach to artifact revisions respecting immutability.
4. [ ] Viewer components with R3F + Drei; lazy-load the 3D bundle (keep editor initial load fast).
5. [ ] Capability/provenance badges; fallback & error boundary.
6. [ ] Split view integration with existing viewport state store (ADR-015).
7. [ ] Performance check: representative scene ready p95 < 3 s on reference device (SPEC-010 §22).
8. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: metadata extraction; capability label resolver.
- Integration: oversized/malformed/external-URI GLB rejected (AC-RV-016); viewer download re-authorized; cross-tenant 404.
- Playwright: load fixture, rotate via presets, verify camera change doesn't create working-copy version; WebGL-disabled context shows fallback.

## 9. Acceptance criteria
- [ ] AC1 — Supported GLB/glTF loads with orbit, pan, zoom, presets and loading/error states (FR-RV-054/055, FR-EDT-109).
- [ ] AC2 — Every displayed model shows its source revision, provenance and capability level; nothing is labelled editable or production-valid (FR-EDT-108, FR-EDT-113, AC-EDT-010, AC-RV-004).
- [ ] AC3 — Invalid or unsafe 3D files are rejected or quarantined before use (FR-RV-060, AC-RV-016).
- [ ] AC4 — 3D failure or unsupported device falls back to 2D without affecting design state (FR-RV-062, FR-EDT-116).
- [ ] AC5 — Camera/viewport changes never modify canonical design or create revisions (FR-RV-066, FR-RV-098).
- [ ] AC6 — Raster/AI images are never presented as 3D models (FR-RV-058, AC-RV-003).

## 10. Risks & notes
- Three.js bundle is large — code-split the 3D feature.
- Licence-check any sample models; prefer self-made simple meshes.

## 11. Handoff
- I37 uses `node_names` metadata to map nodes ↔ component IDs and to propagate materials.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
