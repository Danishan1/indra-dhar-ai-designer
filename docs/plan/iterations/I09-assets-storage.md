# I09 — Asset & storage service

| Field                           | Value                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 2 — Core domain                                                                                                                                                                                                                                                                                                  |
| Subsystems                      | SS-11 Asset & Storage                                                                                                                                                                                                                                                                                            |
| Depends on                      | I07                                                                                                                                                                                                                                                                                                              |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                |
| Spec references                 | `docs/init/11-tech-stack.md` §3.6, §3.9; `docs/init/03-artifact-schema.md` §12 (AST-001…010), §21 (SEC-002, 004, 008, 010); `docs/init/09-specification.md` §12.6, §14.3 (FR-SEC-176, 177), §18 (FR-SEC-216, 223); `docs/init/10-visualization.md` §9.3 (FR-RV-035, 036 SVG sanitization), §17.2 (FR-RV-144…149) |
| Open decisions to resolve first | ADR-029 (scanner hook now, ClamAV in I47) — confirm                                                                                                                                                                                                                                                              |

## 1. Goal

Provide a single, secure way to store and retrieve every file in the platform: authorized uploads with type sniffing and size limits, private object storage with tenant-prefixed keys, checksums and provenance metadata in Postgres, derived thumbnails produced by a worker using Sharp, quarantine/scan hook, and short-lived signed download URLs. Every later feature (sources, artifacts, AI outputs, renders, exports) uses this service.

## 2. Scope

### In scope

- `ObjectStorage` (from I02) completed: put/get/head/delete/presign-get/presign-put/copy; buckets `assets-original`, `assets-derived`, `exports`; keys `org/{orgId}/{yyyy}/{mm}/{assetId}/{variant}`.
- Upload flow (choose one, document): **two-step presigned PUT** (`POST /assets/uploads` → presigned URL → client PUT → `POST /assets/{id}/complete`) with server-side verification of size/checksum/content sniffing on complete; fallback proxied multipart upload for small files.
- Validation: allowlist of media types per `asset_type` (images: png/jpeg/webp; vector: svg; documents: pdf; 3D: glb/gltf later in I36), magic-byte sniffing, max sizes (configurable), image dimension/pixel limits (decompression-bomb protection with Sharp `limitInputPixels`) (AST-008; FR-SEC-176, 177).
- SVG sanitization (strip scripts, event handlers, external references, `foreignObject`) before any rendering (FR-RV-035, 036).
- Scanning hook: asset status `pending_upload → quarantined → ready | rejected`; `ScannerPort` with a no-op implementation (dev) and ClamAV adapter added in I47.
- Worker processor `asset-derivatives`: thumbnails (256, 1024 WebP), normalized preview, EXIF stripping for derived variants, metadata extraction (dimensions, color space).
- Checksums (sha256) for originals and derived; dedup is **not** cross-tenant (AST-003).
- Provenance JSON (`source_type`: `user_upload`, `ai_job`, `render`, `export`, `import`; `source_entity_id`, job/attempt refs) and `is_derived`/`parent_asset_id` (AST-002, 005).
- Download: `GET /assets/{id}/url?variant=` returns short-lived (≤5 min) presigned URL after authorization; or streaming endpoint for sensitive exports (SEC-002; FR-SEC-124).
- Soft delete with retention; deletion blocked when referenced by immutable records (reference registry: modules register "isReferenced" checks) (AST-006, FR-RV-149 tombstone).
- Resource resolver + isolation tests for assets.

### Out of scope (deferred to)

- Malware scanner implementation (→ I47)
- Render outputs/manifests (→ I35)
- GLB validation (→ I36)
- Retention/erasure jobs (→ I47)

## 3. Deliverables

- `apps/api/src/modules/assets/` (`assets.controller.ts`, `assets.service.ts`, `upload.service.ts`, `validation/{sniff.ts,svg-sanitize.ts,limits.ts}`, `repository.ts`, `reference-registry.ts`)
- `apps/worker/src/processors/asset-derivatives.ts`
- `packages/contracts/src/assets/*.ts`
- `apps/web/src/features/assets/{use-upload.ts,upload-dropzone.tsx,asset-thumbnail.tsx}`
- Integration tests with real object store

## 4. Data model changes

| Model   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Asset` | per `03-domain-model.md`: `display_id` (`AST-…`), `asset_type` (`source_image`,`sketch`,`fabric_image`,`artwork`,`document`,`generated_image`,`svg`,`texture`,`model_3d`,`export`,`mask`), `bucket`, `storage_key`, `media_type`, `size_bytes`, `checksum_sha256`, `dimensions jsonb`, `metadata jsonb`, `provenance jsonb`, `is_derived`, `parent_asset_id`, `variant` (`original`,`thumb_256`,`preview_1024`…), `classification`, `status`, `project_id` nullable, `retention_until`, `deleted_at` |

## 5. API / contracts

| Method & path                                     | Permission     | Purpose                                         |
| ------------------------------------------------- | -------------- | ----------------------------------------------- |
| `POST /v1/orgs/{orgId}/assets/uploads`            | `asset.upload` | Create pending asset + presigned PUT            |
| `POST /v1/orgs/{orgId}/assets/{assetId}/complete` | `asset.upload` | Verify, sniff, checksum, queue scan/derivatives |
| `GET /v1/orgs/{orgId}/assets/{assetId}`           | `asset.view`   | Metadata                                        |
| `GET /v1/orgs/{orgId}/assets/{assetId}/url`       | `asset.view`   | Short-lived download URL (variant)              |
| `GET /v1/orgs/{orgId}/assets?projectId=&type=`    | `asset.view`   | List (paginated)                                |
| `DELETE /v1/orgs/{orgId}/assets/{assetId}`        | `asset.delete` | Soft delete if unreferenced                     |

Events: `AssetUploaded`, `AssetReady`, `AssetRejected`, `AssetDerivativeCreated`. Internal service API `AssetService.storeGenerated(ctx|serviceCtx, buffer, provenance)` for workers (used by AI/render/export).

## 6. UI

- Reusable upload dropzone with progress, type/size errors, and thumbnail preview; asset thumbnail component that requests signed URLs lazily and refreshes on expiry.
- Dev page listing org assets (removed/merged into project views in I10).

## 7. Implementation tasks (ordered checklist)

1. [x] Finish `ObjectStorage` S3 implementation + integration tests against compose store.
2. [x] `Asset` model + migration + resolver registration for authz.
3. [x] Upload create/complete flow; presigned PUT with content-length/type conditions.
4. [x] Sniffing, limits, SVG sanitizer (use a maintained sanitizer, e.g. DOMPurify with JSDOM in Node, plus custom external-ref stripping).
5. [x] Scanner port + status transitions.
6. [x] Worker derivatives processor (Sharp), storing derived assets with `parent_asset_id`.
7. [x] Signed download endpoint; ensure keys never exposed as public URLs.
8. [x] Reference registry + soft delete.
9. [x] Web upload hook/components.
10. [x] Isolation tests; update `PROGRESS.md`.

## 8. Tests

- Unit: sniffing table (spoofed extension rejected); SVG sanitizer removes `<script>`, `onload`, `xlink:href="http…"`, `foreignObject`; key builder includes org id.
- Integration: upload → complete → derivatives created → ready; oversize/pixel-bomb rejected; checksum mismatch rejected; Org B cannot get URL for Org A asset (404) and cannot guess storage key (bucket private) (AC-11 SPEC-003; TR-SEC-012 storage); referenced asset cannot be hard-deleted; signed URL expires.
- E2E: upload a PNG in the dev page and see thumbnail.

## 9. Acceptance criteria

- [x] AC1 — Assets have stable IDs, access-controlled storage refs, format, provenance and checksum (AST-001…003).
- [x] AC2 — Source vs derived assets are distinguished; derived assets reference their parent (AST-005).
- [x] AC3 — Unsupported/malformed files are rejected or quarantined; SVGs are sanitized before use (AST-008; FR-RV-035, 036; FR-SEC-176).
- [x] AC4 — Private assets are only reachable through authorized short-lived URLs (SEC-002; FR-SEC-124).
- [x] AC5 — Tenant isolation holds across DB rows and object keys (FR-SEC-216; AST-009).
- [x] AC6 — Expensive processing runs in the worker, not in API requests (TECH §3.9).

## 10. Risks & notes

- Presigned PUT to a localhost object store from the browser: configure public endpoint vs internal endpoint separately (`S3_PUBLIC_ENDPOINT`).
- Do not trust client-sent MIME types (FR-SEC-177).
- Keep derived/original separation — AI providers in I23 receive prepared copies, originals stay intact (INP-004).

## 11. Handoff

- I10/I12 use assets for project sources; I13 for artifact previews; I22–I25 call `storeGenerated`; I35 adds render manifests.
- Note configured limits in `PROGRESS.md`.

## 12. Completion record

- Completed on: 2026-10-26
- Sessions used: 1 (spanning two days)
- Deviations from plan (ADR-044):
  - Uploads are proxied through the API (`PUT …/assets/:id/content`, streamed with a cap and sniffed) instead of presigned browser PUT + `/complete`; no bucket CORS or public write endpoint needed. `presignGet` is used for downloads; direct PUT is in the backlog.
  - Validation/processing code lives in a new `packages/media` (sniffing, SVG sanitizer, Sharp derivatives, scanner port, `processAsset`, `storeGeneratedAsset`) shared by the worker and API tests, instead of `apps/api/src/modules/assets/validation/*` and `apps/worker/src/processors/asset-derivatives.ts`. The worker job kind is `asset.process` (durable job, `jobs/handlers.ts`).
  - Sanitized SVG overwrites the stored original (metadata `svgSanitized`); the unsanitized bytes are never kept.
  - Thumbnails stream same-origin through `GET …/content?variant=` (authorized per request, sandbox CSP) rather than signed URLs refreshed on expiry.
  - The dev page is **Files** (`/files`, primary nav) — to be merged into project sources in I10. `projectId` on upload is refused until I10.
  - Scanner: `none` (dev default) and `eicar-test` (tests); ClamAV in I47 (ADR-029 accepted for the hook).
- Configured limits: images 25 MB, SVG 2 MB, PDF 50 MB, 50 MP pixel limit, signed URLs 300 s (`ASSET_*` in `.env.example`).
- Tests: media unit 9, api unit 86, worker unit 8, integration api 79 (assets 8, security 28) + worker 13, e2e 18.
- Follow-ups added to backlog: see `09-backlog.md` "From I09".
