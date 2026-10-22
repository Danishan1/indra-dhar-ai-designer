# I35 — Server render pipeline, manifests, cache & exports

| Field                           | Value                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 7 — Advanced visualization                                                                                                                                                                                                                                                                                                        |
| Subsystems                      | SS-10 Rendering & Visualization, SS-09 Jobs, SS-11 Assets, SS-17 Audit                                                                                                                                                                                                                                                            |
| Depends on                      | I16 (`packages/garment-render` parametric SVG), I21 (durable jobs + SSE)                                                                                                                                                                                                                                                          |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                                 |
| Spec references                 | `docs/init/10-visualization.md` §5, §6.2, §7, §8 (FR-RV-011…020), §9.2–9.4 (FR-RV-027…043), §16 (FR-RV-124…138), §17 (FR-RV-139…149), §18 (FR-RV-150…160), §19 (FR-RV-161…172), §21, §22, §25, AC-RV-001/009/010/011/012/014/018/019; `docs/init/07-editor.md` §15 (FR-EDT-100…107); `docs/init/03-artifact-schema.md` §12.3–12.4 |
| Open decisions to resolve first | ADR-012 (PDF via headless Chromium — confirm); SVG→PNG library (resvg-js vs Sharp's librsvg — pick in-session by fidelity test)                                                                                                                                                                                                   |

## 1. Goal

Produce traceable, cached, server-side renders of a design revision: versioned render profiles, render jobs on the shared job infrastructure (ADR-023), render manifests binding outputs to exact source revision + artifact revisions + profile version, an authorization-safe render cache, and exports of technical flats as SVG, PNG and PDF. Also generate thumbnails for project/design lists and mark stale renders in the editor.

## 2. Scope

### In scope

- `RenderProfile` (versioned, immutable): `interactive_preview`, `thumbnail`, `technical_flat_v1`, `design_review`, `presentation_export` (purposes from SPEC-010 §8.2), each declaring format, resolution, line styles, fidelity limits.
- Render request API (§8.1/§25.1): source design + explicit revision (or working-copy version for previews; never silently "latest", FR-RV-012), purpose, profile, scope (full/component), outputs.
- Render jobs: `jobs.kind = 'render'` with render states (`created…completed_with_warnings…expired`), attempts, cancellation, dedupe of equivalent in-flight requests (FR-RV-133).
- Worker renderer: load immutable snapshot → `garment-render` SVG (same code as browser) → sanitize → rasterize PNG/WebP → PDF via headless Chromium HTML template (ADR-012) → store via assets service.
- Render manifest per output (§16.3): source revision, representation type, geometry capability (`G2` for flats), sync level, profile id+version, render method, artifact revisions, outputs, validation status.
- Render validator: files exist/readable, metadata present, geometry structural checks, required views (front/back) — missing back view → warning `BACK_VIEW_NOT_AVAILABLE`, never fabricated by mirroring (FR-RV-030).
- Cache: key = hash(org, source revision, artifact revs, garment-render version, renderer version, profile version, format, resolution) — tenant-scoped (FR-RV-139…141).
- Thumbnails on `RevisionCommitted` (outbox consumer) for project/design lists.
- Editor: "Export" menu (SVG/PNG/PDF technical flat), job progress via SSE, stale-render indicator when render version ≠ current working version (FR-EDT-102, FR-RV-177).
- Security: SVG sanitization (no scripts/external refs), size/time limits on worker (FR-RV-190…193).

### Out of scope (deferred to)

- 3D scene rendering (→ I36/I37).
- Tech-pack PDF composition (→ I42). Note: a minimal headless-Chromium HTML→PDF service is first introduced in I31 for invoices; this iteration generalizes it into the shared `pdf` worker service that I42 reuses.
- AI-generated representations (already stored as candidates in I25; manifests for them added here only by reference: `ai_trace_ref`).

## 3. Deliverables

- `packages/render-contracts` (request/result/manifest/profile zod schemas)
- `apps/api/src/modules/rendering/` (controller, service, cache, manifest repository)
- `apps/worker/src/processors/render.processor.ts`, `apps/worker/src/render/{svg-to-raster.ts, pdf-service.ts, validators.ts}`
- PDF HTML templates `apps/worker/src/render/templates/technical-flat.html`
- Web: export menu, render status toasts, stale badge, thumbnails in lists
- Infra: worker image includes Chromium (document in `infra/docker`)
- Migration `…_i35_render_pipeline`

## 4. Data model changes

- `render_profiles` (key, version, purpose, params JSONB, limitations, immutable)
- `render_manifests` (organization_id, source_design_id, source_revision_id, working_copy_version?, representation_type, geometry_capability, sync_level, profile_id, profile_version, render_method, renderer_versions JSONB, artifact_revision_refs, outputs JSONB, validation JSONB, cache_key, job_id, ai_trace_ref?)
- `representations` rows created for persisted outputs (`is_authoritative_design_state=false`).
- Index on `(organization_id, cache_key)`.

## 5. API / contracts

| Method & path                                 | Permission                                          | Purpose                                             |
| --------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `POST /v1/designs/{designId}/renders`         | `design.view` + `design.export` for export purposes | Request render (Idempotency-Key) → job or cache hit |
| `GET /v1/renders/{renderId}`                  | `design.view`                                       | Manifest + outputs (re-authorized, FR-RV-134)       |
| `GET /v1/renders/{renderId}/outputs/{format}` | `design.view`                                       | Signed download                                     |
| `GET /v1/jobs/{jobId}/events`                 | job scope                                           | Progress (existing SSE)                             |
| `GET /v1/render-profiles`                     | authenticated                                       | Available profiles                                  |

Events: consumes `RevisionCommitted` (thumbnails); emits `RenderCompleted`, `RenderFailed`.

## 6. UI

- Editor toolbar Export: format, view (front/back), quality profile; progress; result download; warnings shown.
- Project and design cards use generated thumbnails (FR-EDT / NFR-EDT-005).
- Stale badge on previews when based on an older working version.

## 7. Implementation tasks (ordered checklist)

1. [ ] `packages/render-contracts`; seed profiles.
2. [ ] Rendering service: validate revision access, resolve artifacts, compute cache key, dedupe.
3. [ ] Worker processor; SVG rasterizer choice by fidelity test (fonts, patterns, hatching).
4. [ ] PDF service (Chromium) reusable by I42; resource limits.
5. [ ] Validator + manifest persistence; last valid output preserved on failure (NFR-RV-016).
6. [ ] Thumbnail consumer.
7. [ ] Web export menu, stale indicators, thumbnails.
8. [ ] Regression scenes: golden SVG snapshots per garment template.
9. [ ] Update PROGRESS.md, ADR-012 status.

## 8. Tests

- Unit: cache key composition; manifest schema; validator rules.
- Integration: render bound to exact revision (AC-RV-001); retry keeps same revision/profile (FR-RV-132); failed render doesn't overwrite previous output (AC-RV-010); cache never crosses orgs or revisions (AC-RV-011); result retrieval re-authorized (AC-RV-019); malicious SVG sanitized.
- Visual regression: golden snapshots of technical flats (tolerant comparison).
- E2E: export PDF technical flat containing revision ID metadata (AC-RV-012).

## 9. Acceptance criteria

- [ ] AC1 — Every persisted render has a manifest identifying source revision, profile version, method, artifact revisions (FR-RV-135/136, AC-RV-001/009).
- [ ] AC2 — Technical-flat SVG/PNG/PDF exports carry source revision metadata; SVG preserves component IDs (FR-RV-034, AC-RV-012).
- [ ] AC3 — Cache hits only for identical inputs within the same tenant scope (AC-RV-011).
- [ ] AC4 — Render failure leaves canonical state and previous outputs intact (FR-RV-005, AC-RV-010).
- [ ] AC5 — Render validation results are labelled as render validity, not production validity (FR-RV-156/157, AC-RV-014).
- [ ] AC6 — Editor stays usable during render jobs and shows stale indicators (AC-RV-018, FR-EDT-102).

## 10. Risks & notes

- Use the same `garment-render` code in browser and worker to avoid divergence; pin font files in the repo for deterministic rasterization.
- Chromium increases worker image size — consider a dedicated `worker-render` queue/process (document; optional now).

## 11. Handoff

- I36 adds 3D representation types to the manifest; I42 uses the PDF service and technical-flat outputs for tech packs (FR-RV-172).

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
