# I37 — 2D/3D component linking & material sync

| Field | Value |
|---|---|
| Phase | 7 — Advanced visualization |
| Subsystems | SS-10 Rendering & Visualization, SS-04 Editor, SS-03 Garment Model, SS-05 Artifact Registry |
| Depends on | I36 |
| Estimated sessions | 2 |
| Spec references | `docs/init/10-visualization.md` §6.1, §10.1 (FR-RV-044…048), §11.1 (FR-RV-056/057), §12 (FR-RV-072…086), §14 (FR-RV-096…108), §19 (FR-RV-165), §20.2 (FR-RV-179…183), §26, AC-RV-005/006/007/013; `docs/init/07-editor.md` §7.2 (FR-EDT-020), §16.3 (FR-EDT-110…112), AC-EDT-009; `docs/init/03-artifact-schema.md` §13.1, §13.3 (VIS-001…007) |
| Open decisions to resolve first | Node naming convention for component mapping (propose `cmp:<componentType>:<side?>` + explicit mapping table override) |

## 1. Goal
Link the 3D scene to the canonical component graph so the 2D and 3D views behave as one design (synchronization level **S2 — component-linked**): selecting a component highlights it in both views and the properties panel; supported appearance changes (color, fabric texture, visibility, trim visibility) applied in the canonical model propagate to the 3D materials; each view declares its sync level and clearly discloses what is not synchronized. No geometry editing in 3D and no S3/S4 claims.

## 2. Scope
### In scope
- Component ↔ mesh mapping: automatic by node-name convention + editable mapping table per `Model3DAsset` (stored as metadata, not design state); unmapped components listed.
- Mapping editor UI (for designers/admins): pick a node in 3D, assign component ID; validation that IDs exist in the bound revision.
- Selection sync (FR-EDT-020, FR-RV-179): shared selection store; 3D raycast picking → component ID; hierarchy/2D selection → 3D highlight (outline/emissive, not material change).
- Visibility/isolate sync (FR-RV-056).
- Material resolver (FR-RV-072): canonical color & fabric references (artifact revisions) → PBR material (base color, texture map with scale/orientation from fabric artifact visual properties) applied per mapped mesh; deterministic for a fixed state (FR-RV-076).
- Visual vs physical properties kept separate; "screen color ≠ physical color approval" notice (FR-RV-084/085).
- Sync level per view relationship declared in manifest and UI: `S2` when mapping coverage > 0, otherwise `S1` (FR-RV-101/102).
- Disclosure for unsupported sync: e.g. sleeve length change shows "3D geometry not updated — approximate model" (FR-RV-100, FR-EDT-112).
- Stale state: 3D shows which working version materials reflect (FR-RV-108).
- GLB export of the viewed scene with applied materials + manifest disclosing G3/S2 (FR-RV-165) — via worker using the same material resolver.
- Artifact swap scenario (§26): replacing a sleeve artifact updates 2D; 3D updates only if new artifact has a compatible 3D asset, else disclosed placeholder.

### Out of scope (deferred to)
- 3D geometry editing, S3 geometry sync, S4 pattern-linked sync, cloth simulation (→ backlog).
- AI-generated textures (→ backlog).

## 3. Deliverables
- `packages/render-contracts`: `ComponentMeshMapping`, `SyncLevel`, `MaterialDescriptor`
- `packages/garment-render/src/materials/resolve-material.ts` (pure: canonical props + artifact visual props → `MaterialDescriptor`)
- `apps/web/src/features/editor/viewport-3d/{picking.ts, highlight.ts, apply-materials.ts, mapping-editor/}`
- `apps/api/src/modules/rendering/model3d/mapping.controller.ts`
- `apps/worker/src/processors/gltf-export.processor.ts`
- Migration `…_i37_component_mapping`

## 4. Data model changes
- `model3d_component_mappings` (model3d_asset_id, node_name, component_type, component_id?, side?, mapped_by, source `convention|manual`) — versioned by asset; does not alter design revisions.
- `render_manifests.sync_level` populated for 3D representations.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/models3d/{id}/mappings` | `design.view` | Current mapping + coverage |
| `PUT /v1/models3d/{id}/mappings` | `design.edit` | Update manual mappings (expectedVersion) |
| `POST /v1/designs/{designId}/renders` (purpose `3d_export`) | `design.export` | GLB export job with manifest |

Events: `Model3DMappingUpdated`.

## 6. UI
- Selecting in 3D highlights in hierarchy + 2D and opens properties; vice versa.
- Sync badge in split view: "S2 · selection & appearance linked; geometry not linked".
- Inline disclosures when a property change cannot be reflected in 3D.
- Mapping editor panel with coverage meter and list of unmapped components/nodes.

## 7. Implementation tasks (ordered checklist)
1. [ ] Decide & document node-naming convention; update fixtures with conforming node names.
2. [ ] Pure material resolver + tests; reuse fabric artifact visual props from I13/I18.
3. [ ] Mapping persistence & API; auto-map on validation (I36 processor extension).
4. [ ] Picking/highlight; shared selection store integration.
5. [ ] Material application & visibility sync; partial updates without scene rebuild (FR-RV-064).
6. [ ] Disclosure rules registry: which property keys are 3D-reflected.
7. [ ] GLB export processor + manifest.
8. [ ] Artifact swap scenario test; update PROGRESS.md.

## 8. Tests
- Unit: material resolver determinism; sync-level computation; disclosure registry.
- Playwright: select sleeve in 3D → hierarchy & 2D highlight (AC-EDT-009); change body color → 3D material updates; change sleeve length → disclosure shown; unmapped model shows S1.
- Integration: exported GLB manifest states G3/S2 and source revision (AC-RV-013); mapping edits don't create design revisions.

## 9. Acceptance criteria
- [ ] AC1 — Selection is synchronized across hierarchy, 2D and 3D for mapped components (FR-EDT-020, FR-EDT-110, FR-RV-179).
- [ ] AC2 — Supported appearance changes in the canonical model update 2D and 3D; unsupported ones are disclosed (FR-RV-097, FR-RV-100, AC-RV-006/007, AC-EDT-009).
- [ ] AC3 — Each 2D/3D relationship declares its sync level; nothing claims S3/S4 (FR-RV-101/102).
- [ ] AC4 — Materials resolve from exact artifact revisions and keep visual vs physical properties separate (FR-RV-072/073, AC-RV-005).
- [ ] AC5 — 3D exports disclose geometry capability and limitations (FR-RV-165, AC-RV-013).
- [ ] AC6 — Screen color is never presented as physical color approval (FR-RV-085).

## 10. Risks & notes
- Keep highlight effects separate from material state to avoid "dirty" colors after deselect.
- Large textures: generate downscaled previews via Sharp for interactive use.

## 11. Handoff
- I42 may include a 3D snapshot image in tech packs only as "visual reference" with its fidelity label.
- Backlog: S3 geometry sync and pattern-linked 3D (G5) require a geometry engine decision.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
