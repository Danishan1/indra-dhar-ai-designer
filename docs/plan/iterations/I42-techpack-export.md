# I42 — Tech pack export (PDF / XLSX / CSV / JSON)

| Field                           | Value                                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase                           | 8 — Tech pack & production specification                                                                                                                                                                                                                           |
| Subsystems                      | SS-15 Tech Pack, SS-10 Rendering (PDF/technical views), SS-09 Jobs, SS-11 Assets                                                                                                                                                                                   |
| Depends on                      | I41, I35 (render pipeline + headless Chromium in worker)                                                                                                                                                                                                           |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                |
| Spec references                 | `docs/init/08-tech-pack.md` §24.1, §25, §31.4, AC-TP-011, NFR-TP-002/003/005/006; `docs/init/06-project-lifecycle.md` §6.7, §7.4, FR-PRJ-073..078, §16.6; `docs/init/10-visualization.md` §19, FR-RV-172; `docs/plan/05-decisions.md` ADR-012, §3 (launch formats) |
| Open decisions to resolve first | ADR-012 confirm (HTML → PDF via Playwright/Chromium in worker)                                                                                                                                                                                                     |

## 1. Goal

Generate faithful, traceable tech pack deliverables from a **fixed specification revision** (and its fixed design revision): a template-driven PDF, XLSX workbook, CSV measurement table and a versioned JSON package. Drafts are watermarked, every export is integrity-checked before it is marked successful, and retries never create ambiguous or duplicate records. Release itself happens in I43.

## 2. Scope

### In scope

- Export job kind `techpack_export` (ADR-023) with states mapped to the tech-pack export vocabulary (`DRAFT`, `GENERATING`, `VALIDATION_FAILED`, `READY_FOR_REVIEW`, … see 03-domain-model §1).
- Export template revisions (layout) linked to spec template; export records template version + renderer version (FR-TP-134, FR-TP-166).
- **PDF**: HTML/CSS layout rendered by headless Chromium in worker; sections per §25.2 (cover, revision & approval info, design overview, technical flats & detail views with callouts, colorways, BOM, materials, measurement table + POM diagrams, grading & tolerances, construction, artwork, labels & packaging, quality & compliance refs, revision history, outstanding exceptions). Page headers/footers with style ID, spec revision, design revision, page x/y (FR-TP-158). Tables split safely across pages, no clipped labels (FR-TP-164).
- **XLSX** (BOM, measurements with tolerances & grading, construction) and **CSV** (measurement table) (FR-TP-155).
- **JSON package**: versioned schema (`techpack-package/v1`) with manifest + content + asset references/checksums (FR-TP-156, NFR-TP-008).
- Missing/unconfirmed value policy: render explicitly as "MISSING" / "UNCONFIRMED" markers, never substitute (FR-TP-160, FR-PRJ-078).
- Draft/review watermark for non-released revisions (FR-TP-163).
- Integrity validation stage: required sections present, page count > 0, embedded images resolved, measurement table cell count matches content, checksums computed (FR-TP-159).
- Confidentiality: costing & restricted commercial fields excluded unless requester has permission and export profile is internal (FR-TP-165, FR-TP-183).
- Export retrieval via authorized signed URLs; export provenance metadata (FR-TP-157, FR-TP-166).
- Idempotent retry: same (spec revision, template version, format, profile) → reuse job/record; failed export never touches spec status (NFR-TP-005, NFR-TP-006, FR-TP-162).

### Out of scope (deferred to)

- Release, release manifest, supersession (→ I43)
- Supplier distribution (→ I43)
- PLM/ERP export mappings (→ backlog)

## 3. Deliverables

- `apps/worker/src/processors/techpack-export/{pdf.ts, xlsx.ts, csv.ts, json-package.ts, integrity.ts}`
- `apps/api/src/modules/techpack/export.service.ts`, `export.controller.ts`
- `packages/techpack-model/src/export/{package-schema.ts, export-profile.ts}`
- Export HTML templates: `apps/worker/src/templates/techpack/*.html|tsx` (rendered server-side to static HTML)
- Library choice for XLSX recorded (e.g. `exceljs`) in PROGRESS.md
- `apps/web/src/features/techpack/export/` — export dialog, export history list

## 4. Data model changes

- `ExportArtifact` (spec_revision_id, design_revision_id, format, export_profile (`internal`,`supplier`), template_revision_id, renderer_version, asset_id, checksum, page_count, status, watermark, generated_by, generated_at, job_id, idempotency_key unique). Released exports become immutable in I43 (trigger prepared now: `locked_at`).
- Migration `…_i42_export_artifacts`.

## 5. API / contracts

| Method & path                             | Permission                                            | Purpose                                                |
| ----------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `POST /v1/spec-revisions/{revId}/exports` | `techpack.export`                                     | Request export(s): formats[], profile; Idempotency-Key |
| `GET /v1/spec-revisions/{revId}/exports`  | `techpack.view`                                       | Export history                                         |
| `GET /v1/exports/{exportId}`              | `techpack.view`                                       | Status, provenance                                     |
| `GET /v1/exports/{exportId}/download`     | `techpack.view` (+ costing perm for internal profile) | Short-lived signed URL                                 |
| `GET /v1/jobs/{jobId}/events`             | (existing)                                            | SSE progress                                           |

Events: `TechPackGenerationRequested`, `TechPackGenerated`, `TechPackExportFailed`.

## 6. UI

- Export dialog: formats checkboxes, profile (internal/supplier), shows readiness status and warns when not READY (export still allowed as draft with watermark).
- Export history table: format, revision, status, generated by/at, size, download.
- Progress via SSE with retry button on failure.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-012; ensure worker image/dev setup has Chromium (Playwright already installed for E2E).
2. [ ] JSON package schema & builder (pure) — base for all formats (single source of data).
3. [ ] HTML templates + PDF render; page-break rules for tables; callout numbering consistent with technical views.
4. [ ] XLSX/CSV builders with units and POM IDs in headers (FR-TP-060).
5. [ ] Integrity validator; mark `VALIDATION_FAILED` with details on failure.
6. [ ] Export service: idempotency key derivation, job creation, profile filtering of restricted fields, store asset with checksum.
7. [ ] Watermark logic driven by spec lifecycle status at export time.
8. [ ] Web dialog + history.
9. [ ] Visual regression snapshot for a reference spec PDF (compare page images with tolerance).
10. [ ] Tests; PROGRESS.md.

## 8. Tests

- Unit: package builder deterministic for same input; restricted-field filter; missing-value markers.
- Integration: export bound to revision (metadata contains spec & design revision ids — FR-TP-157); failed export leaves spec status unchanged (AC-TP-011); retry with same key does not duplicate records; supplier profile excludes costing (FR-TP-183); export from a revision edited afterwards still reflects original content.
- E2E: generate PDF + XLSX for seeded demo spec and download.

## 9. Acceptance criteria

- [ ] AC1 — PDF generated from a specific spec revision + template revision with required sections and revision identifiers (FR-TP-154, FR-TP-157, FR-TP-158, FR-PRJ-073).
- [ ] AC2 — XLSX/CSV/JSON exports available and versioned (FR-TP-155, FR-TP-156, NFR-TP-008).
- [ ] AC3 — Exports integrity-validated before success (FR-TP-159); tables legible, not clipped (FR-TP-164).
- [ ] AC4 — Missing/unconfirmed values never fabricated; follow configured policy (FR-TP-160, FR-PRJ-078).
- [ ] AC5 — Drafts watermarked (FR-TP-163); confidential fields excluded per permission/profile (FR-TP-165, FR-TP-183).
- [ ] AC6 — Failures don't alter spec status; retries don't duplicate (AC-TP-011, FR-TP-162, NFR-TP-005/006).
- [ ] AC7 — Export provenance retained (FR-TP-166) and runs asynchronously with progress (NFR-TP-002/003).

## 10. Risks & notes

- Chromium memory: cap concurrency (`WORKER_CONCURRENCY_EXPORT=1–2`), set timeouts, kill browser on failure.
- Fonts: bundle fonts in the worker image for reproducible PDFs.
- Never generate a PDF from the working copy or a "latest" pointer — always explicit IDs.

## 11. Handoff

- I43 locks exports used in a release and builds the release manifest from `ExportArtifact` ids.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
