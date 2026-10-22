# I27 — Region tools, annotations & targeted edits

| Field | Value |
|---|---|
| Phase | 4 — AI execution & metering foundation |
| Subsystems | SS-04 Editor, SS-07 Compilation (masks), SS-10, SS-03 (annotations) |
| Depends on | I25 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/07-editor.md` §9 (drawing/region/annotation FR-EDT-039…048), §11 (FR-EDT-070, 071), OD-EDT-009, OD-EDT-011; `docs/init/04-ai-prompt.md` §8.1 (`targeted_image_edit`), §10 (masks, reference roles INP-003/005), §16.3, §17.3, §25.2 (Workflow B); `docs/init/03-artifact-schema.md` §14 (coordinate spaces GEO-001…007), §16.3 (preservation); `docs/init/10-visualization.md` FR-RV-110, FR-RV-111, FR-RV-181; `docs/init/11-tech-stack.md` §3.7 |
| Open decisions to resolve first | ADR-025 (Konva overlay & mask representation — confirm) |

## 1. Goal
Let users express **localized intent visually**: draw regions (lasso, polygon, rectangle, brush), place points/arrows/text notes, and request **targeted AI edits** on a selected region of an AI preview or reference image ("add embroidery here", "change this cuff to lace"), with a mask preview, explicit preservation constraints and honest disclosure that image edits may affect pixels outside the region. Annotations are persisted separately from garment geometry. Completes **M4**.

## 2. Scope
### In scope
- Konva overlay layer above the SVG/image viewport (ADR-025) sharing viewport transform from editor-core; tools: select, brush, eraser, lasso, polygon, rectangle, point, arrow, text note, measurement line (visual guide only).
- Coordinate mapping (editor-core `coords.ts`): viewport ↔ design_2d (mm) ↔ image pixel ↔ normalized image coordinates; every stored geometry declares `coordinateSpace` (GEO-001, FR-EDT-041).
- Annotations: `Annotation` records (kind `design | review | guide`) attached to design/working-copy/revision/component; editable/removable without touching garment geometry (FR-EDT-042…044); export flag default off for internal guides (FR-EDT-048).
- Region → target resolution: if region overlaps structured components, record `componentIds` as the operation target; if region is on a raster representation/reference only, mark operation as image-based (FR-EDT-047, REL-008).
- Mask generation: rasterize region to PNG mask aligned to the target image (pixel space) + store polygon in design or normalized space with mapping metadata (INP-005); mask asset with provenance.
- Targeted edit flow: select target image (AI preview representation or source reference) → draw region → choose action (preset intents: apply selected artifact as reference, change color/material appearance, add embroidery/print motif, remove detail, free-text instruction optional) → mask preview overlay (FR-EDT-046) → preservation checklist (silhouette, other components) → plan/preflight → job (`targeted_region_edit`, I23 routing requires masking capability) → candidates (I25 flow) → compare → apply as new representation.
- Disclosure: when model only supports whole-image regeneration with reference, either block (if policy requires mask capability) or show "may alter areas outside the region" warning and require acknowledgement (CON-006, FR-EDT-071).
- Optional user instruction text is stored as `user_authored_instruction` (distinguished from compiler instructions, OPR-AI-004) and treated as untrusted within templates.

### Out of scope (deferred to)
- Applying region edits to structured geometry (vector editing of outlines) (→ backlog)
- Review comments threads on regions (→ I28 reuses `Annotation` kind `review`)

## 3. Deliverables
- `packages/editor-core/src/{coords.ts, region.ts}` + tests
- `apps/web/src/features/editor/overlay/{OverlayStage.tsx, tools/*.ts, MaskPreview.tsx, AnnotationLayer.tsx, TargetedEditPanel.tsx}`
- `apps/api/src/modules/designs/annotations.{service,controller,repository}.ts`
- Worker: mask rasterization helper (Sharp) and `targeted_region_edit` template + compile mapping
- Prisma `Annotation` model if not created in I12 + migration `…_i27_annotations`

## 4. Data model changes
`Annotation` (design_id, revision_id?, working_copy_version?, component_id?, kind, geometry JSONB {coordinateSpace, shape, points}, body, style, include_in_exports, author). Mask assets as `Asset` (asset_type `mask`, parent_asset_id = target image).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/designs/{id}/annotations` | `design.view` | List |
| `POST /v1/designs/{id}/annotations` | `design.edit` (kind review: `review.comment`) | Create |
| `PATCH /v1/annotations/{id}` / `DELETE` | `design.edit` (author or admin) | Update/remove |
| `POST /v1/designs/{id}/masks` | `design.generate` | Upload/create mask asset from polygon + target asset |
| `POST /v1/designs/{id}/operations` (`targeted_region_edit`) | `design.generate` | Submit targeted edit |

## 6. UI
Tool palette in toolbar, overlay drawing with handles, mask preview tint, targeted-edit side panel with intent presets, preservation checklist, disclosure banner, annotations list in left panel.

## 7. Implementation tasks (ordered checklist)
1. [ ] Confirm ADR-025; add react-konva.
2. [ ] Coordinate mapping functions with round-trip tests (zoom/pan independent).
3. [ ] Overlay stage + tools; keyboard shortcuts (B, L, P, R, T, V) with input guard.
4. [ ] Annotation persistence + list UI.
5. [ ] Region → component resolution and image-based flagging.
6. [ ] Mask rasterization + mask asset creation.
7. [ ] Targeted edit panel → plan/preflight → job → candidates.
8. [ ] Disclosure/acknowledgement logic based on model capability profile.
9. [ ] E2E with fake adapter (mask-capable and non-mask-capable models).
10. [ ] Update PROGRESS.md; mark M4 milestone & tag `m4-ai-alpha`.

## 8. Tests
- Unit: coordinate transforms; polygon → mask raster alignment within 1px; region-component intersection.
- Integration: mask asset provenance links target asset & operation; annotation edit does not modify working copy state.
- E2E: draw lasso on cuff in AI preview → mask preview → submit → candidate → apply; non-mask model → warning acknowledgement required.

## 9. Acceptance criteria
- [ ] AC1 — Users define regions with direct drawing tools; regions map to the correct coordinate space before persistence. (FR-EDT-039…041, GEO-001, GEO-004)
- [ ] AC2 — Annotations persist on the right entity, remain editable, and are distinguishable from garment geometry and production data. (FR-EDT-042…044)
- [ ] AC3 — Region-based operations retain their target region/component and source image coordinates. (FR-EDT-045, INP-005)
- [ ] AC4 — Mask/target region previewed before submission. (FR-EDT-046)
- [ ] AC5 — Image-based (non-structural) edits are disclosed as such. (FR-EDT-047, CON-006, FR-RV-181)
- [ ] AC6 — Masked edits are routed only to models supporting masking or explicitly authorized alternatives. (STR-003, SPEC-004 AC-03, ROUTE-006)
- [ ] AC7 — Preservation is requested but never guaranteed in UI copy. (FR-EDT-071, FR-RV-111, SPEC-004 AC-16)
- [ ] AC8 — Internal guides are excluded from exports by default. (FR-EDT-048, FR-EDT-139)

## 10. Risks & notes
- Keep Konva strictly an overlay; garment geometry remains SVG/canonical model (TECH §3.7 "SVG and canvas may coexist").
- High-DPI and image letterboxing make mask alignment error-prone — test with non-square images.

## 11. Handoff
- I28 uses `Annotation` kind `review` for region comments.
- M4 demo: photo → interpretation (I26) → generation (I25) → targeted edit (I27).

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
