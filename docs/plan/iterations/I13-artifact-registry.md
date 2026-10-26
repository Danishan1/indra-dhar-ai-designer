# I13 — Artifact registry & built-in library

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 2 — Core domain                                                                                                                                                                                                                                                                                                                                                                    |
| Subsystems                      | SS-05 Artifact Registry                                                                                                                                                                                                                                                                                                                                                            |
| Depends on                      | I09, I11                                                                                                                                                                                                                                                                                                                                                                           |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                                                                                  |
| Spec references                 | `docs/init/03-artifact-schema.md` §8.4 (component vs artifact identity), §11 (ART-001…014, scopes §11.5, update policy §11.6), §15 (constraints), §21 (SEC-001, 003, 005), §25 (AC-02, AC-03, AC-11); `docs/init/01-overview.md` §3.5 (FR-050…056); `docs/init/09-specification.md` §12.2 (FR-SEC-114…119); `docs/init/10-visualization.md` §29.5 (geometry availability metadata) |
| Open decisions to resolve first | ADR-008 (built-in library content follows the chosen categories)                                                                                                                                                                                                                                                                                                                   |

## 1. Goal

Deliver a reusable-artifact registry: platform (built-in), organization and user-private artifacts such as sleeves, collars, cuffs, pockets, plackets, fabrics, lace/trims, embroidery motifs, buttons and artwork — each with stable identity, immutable revisions, preview assets, machine-readable compatibility rules, geometry-availability metadata, search, and lifecycle (active/deprecated/deactivated). A seeded built-in library makes the editor useful from day one.

## 2. Scope

### In scope

- `Artifact` (display ids by category prefix: `SLV`, `COL`, `CUF`, `PKT`, `PLK`, `FAB`, `LAC`, `TRM`, `EMB`, `BTN`, `ART`, `NCK`), `ArtifactRevision` (immutable, `…-R004`), owner scope `platform|organization|user` (project scope reserved) (ART-001…007; §11.5).
- Revision `definition` JSONB: `compatibleTargetTypes`, `preferredPlacementRegions`, `repeatable`, `placementMode` options, parametric geometry overrides for `garment-render` (e.g. sleeve shape parameters) (I16 consumes), `previewAssetRef`, `geometryRefs`, `model3dRef` (I36), `geometryCapability` (`G0`…`G2` initially).
- Revision `properties` separated into `visual` vs `physical/manufacturing` groups using `PropertyValue` envelopes; artifacts may be visually valid while physical properties are `missing` (ART-008, ART-014).
- Creating a new revision never changes design references (ART-005; AC-02) — enforced because designs pin revision ids (I12) and the registry never mutates revisions.
- Compatibility evaluation function in `garment-model` (or registry service): `checkCompatibility(artifactRevision, targetComponent, region)` → findings (ART-012; FR-055).
- Permissions: use vs edit vs publish vs delete independent (SEC-003; FR-SEC-116, 118). Platform artifacts are read/use-only for orgs; org artifacts invisible to other orgs (FR-SEC-115).
- Lifecycle: deactivate (hidden from browse, still resolvable for historical revisions), delete only if unreferenced and policy allows (ART-010, 011).
- Search & filter: category, type, tags, name, compatibility with component type, owner scope; thumbnails via asset service; pagination (FR-052; FR-EDT-050 backend).
- Duplicate artifact (e.g. copy platform artifact into org library to customize) with `derived_from` provenance (ART-009).
- Seed built-in library for ADR-008 categories (≈30–50 items): sleeve variants (short/long/raglan-style params), collars (point, button-down, mandarin, spread), cuffs (barrel, french, rib), pockets (patch, flap), plackets, necklines (crew, V), fabrics (solid colors, chambray, oxford, jersey textures with tileable previews), lace borders (2–3), embroidery motifs (2–3), buttons (2–3). Previews are simple generated SVG/PNG assets stored via asset service (seed script uploads them).
- Usage registry: which design revisions reference which artifact revisions (query from `design_revisions.artifact_revision_refs`) for "where used" and deletion checks.
- Web: Library page (browse/search/filter, detail drawer with revisions and where-used, create/edit org artifact with preview upload, new revision, deactivate).

### Out of scope (deferred to)

- Attaching artifacts in the editor (→ I18)
- "Save selection as artifact" from editor (→ I18)
- Cross-organization sharing/marketplace (→ backlog; SPEC-003 open decision 6)
- 3D model refs population (→ I36)

## 3. Deliverables

- `apps/api/src/modules/artifacts/` (`artifacts.controller.ts`, `artifact-revisions.controller.ts`, `artifacts.service.ts`, `compatibility.service.ts`, `repository.ts`, `where-used.service.ts`)
- `packages/garment-model/src/artifacts/{artifact-schema.ts,compatibility.ts}` (pure schemas + compatibility rules)
- `packages/db/prisma/seed/platform/artifacts/` (definitions + preview generation/upload script, idempotent)
- `packages/contracts/src/artifacts/*.ts`
- `apps/web/src/features/library/{library-page,artifact-card,artifact-detail-drawer,artifact-form}.tsx`
- Resolver + isolation tests

## 4. Data model changes

| Model               | Notes                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Artifact`          | `display_id`, `artifact_type`, `category`, `name`, `description`, `owner_scope`, `organization_id` (null for platform), `owner_user_id` (user scope), `current_revision_id`, `lifecycle_status`, `tags text[]`, `derived_from_artifact_revision_id` |
| `ArtifactRevision`  | `artifact_id`, `display_id`, `revision_number`, `parent_revision_id`, `definition jsonb`, `properties jsonb`, `preview_asset_id`, `geometry_capability`, `validation_status`, `schema_version`, `created_by` — immutable (trigger)                  |
| `CompatibilityRule` | optional table for org-defined extra rules: `scope jsonb`, `rule jsonb`, `severity`, `version`                                                                                                                                                      |

Platform artifacts use `organization_id = NULL`; tenant filters must explicitly include `OR owner_scope='platform'` for read-only paths (documented helper).

## 5. API / contracts

| Method & path                                              | Permission         | Purpose                                             |
| ---------------------------------------------------------- | ------------------ | --------------------------------------------------- |
| `GET /v1/orgs/{orgId}/artifacts`                           | `artifact.view`    | Search/filter (platform + org + own user artifacts) |
| `GET /v1/orgs/{orgId}/artifacts/{artifactId}`              | `artifact.view`    | Detail + revisions                                  |
| `GET …/artifacts/{artifactId}/revisions/{revisionId}`      | `artifact.view`    | Exact revision (works for deactivated)              |
| `POST /v1/orgs/{orgId}/artifacts`                          | `artifact.create`  | Create org/user artifact + R001                     |
| `POST …/artifacts/{artifactId}/revisions`                  | `artifact.edit`    | New immutable revision                              |
| `PATCH …/artifacts/{artifactId}`                           | `artifact.edit`    | Name/tags (non-revisioned metadata)                 |
| `POST …/artifacts/{artifactId}/deactivate` · `/reactivate` | `artifact.edit`    | Lifecycle                                           |
| `DELETE …/artifacts/{artifactId}`                          | `artifact.delete`  | Only if unreferenced                                |
| `POST …/artifacts/{artifactId}/duplicate`                  | `artifact.create`  | Copy (e.g. platform → org)                          |
| `POST …/artifacts/{artifactId}/publish`                    | `artifact.publish` | Make user-private artifact org-visible              |
| `GET …/artifacts/{artifactId}/where-used`                  | `artifact.view`    | Referencing design revisions (same org only)        |
| `POST …/artifacts/compatibility-check`                     | `artifact.use`     | Check revision vs component type/region             |

Events: `ArtifactCreated`, `ArtifactRevisionCreated`, `ArtifactDeactivated`, `ArtifactPublished`.

## 6. UI

- Library page: category tabs (Sleeves, Collars, Cuffs, Pockets, Fabrics, Trims & Lace, Embroidery, Buttons, Artwork), search, filters (owner: Built-in / Organization / Mine; compatible with …), grid with thumbnails and badges (Built-in, Deactivated, geometry capability).
- Detail drawer: preview, properties split Visual vs Physical with status badges, revisions list, where-used.
- Create/edit form with preview upload (asset service) and definition fields per category (compatible targets, placement regions).

## 7. Implementation tasks (ordered checklist)

1. [x] Artifact schemas + compatibility rules in `garment-model` (pure, unit-tested).
2. [x] Models + migration + immutability trigger.
3. [x] Service: create, revise, lifecycle, duplicate, publish, delete-if-unreferenced.
4. [x] Scope-aware queries (platform + org + user) and authorization (use/edit/publish/delete separate).
5. [x] Where-used query against design revisions.
6. [x] Seed library + preview generation; idempotent re-run.
7. [x] Controllers/contracts; resolvers; isolation tests.
8. [x] Library UI.
9. [x] Update `PROGRESS.md`.

## 8. Tests

- Unit: compatibility (lace allowed on sleeve hem, not on collar if rule says so); revision numbering.
- Integration: updating artifact to R002 leaves designs referencing R001 unchanged (AC-02 SPEC-003; ART-005); revision rows immutable; Org B cannot read/modify Org A artifact or its assets (AC-11; FR-SEC-115); Designer can use platform artifact but cannot edit it (FR-SEC-116); deactivated artifact still resolvable by revision id but hidden from browse (ART-010); delete blocked when referenced; seed idempotent.
- E2E: browse library, create org lace artifact, add revision, deactivate.

## 9. Acceptance criteria

- [x] AC1 — Artifacts have stable identities and immutable revisions with parent links (ART-001…003; FR-053).
- [x] AC2 — Revising an artifact never alters existing design revisions (ART-005; FR-056; SPEC-003 AC-02).
- [x] AC3 — Platform, organization and user-private scopes with independent use/edit/publish/delete permissions (ART-006, 007; SEC-003; FR-SEC-114…118).
- [x] AC4 — Visual vs physical/manufacturing properties are distinguished; no artifact labelled production-validated without validation (ART-008, ART-014).
- [x] AC5 — Compatibility rules are machine-readable and evaluable (ART-012; FR-055).
- [x] AC6 — Deactivation preserves history; deletion respects references (ART-010, ART-011).
- [x] AC7 — Built-in library seeded for the initial categories (FR-050).

## 10. Risks & notes

- Keep `definition` geometry parameters aligned with I16's renderer contract — define a `ParametricShapeParams` type in `garment-model` now and let I16 extend it.
- Platform artifacts are cross-tenant by design: make sure only read/use paths include them, never write paths.
- Don't overbuild the seed visuals; simple, clean SVG previews are fine.

## 11. Handoff

- I18 uses search + compatibility + exact revision fetch for attachment and "save as artifact".
- I16 consumes `definition` parametric params for rendering sleeves/collars/cuffs/pockets/trims.
- I38 links BOM items to artifact revisions.

## 12. Completion record

- Completed on: 2026-10-26
- Sessions used: 1
- Deviations from plan (ADR-048):
  - Built-in library synced at API start from code (`platform-library/`) instead of a seed script; previews are inline generated SVGs served by `GET …/artifact-revisions/:id/preview` (platform rows have no tenant to own assets).
  - Exact revision route is `/v1/orgs/:orgId/artifact-revisions/:artifactRevisionId` (route rule).
  - Scope enforcement added to the PDP (`platformAccess`, `privateOwnerOf` resolver hooks).
  - Delete route declares `artifact.edit`; shared artifacts additionally need `artifact.delete` in the service. Deletion is logical.
  - No `CompatibilityRule` table yet (optional in the plan) — backlog I20. Artifact refs in design revisions stay `text[]` (backlog I18).
  - Also registered asset-reference checks for design revisions (`source_asset_refs`) and artifact previews.
- Tests: garment-model 123, api unit 99 (library 4), integration api 112 (artifacts 8; security incl. artifact routes), e2e 21 (library spec).
- Follow-ups added to backlog: see `09-backlog.md` "From I13".
