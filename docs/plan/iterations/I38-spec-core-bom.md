# I38 — Production specification core & BOM

| Field | Value |
|---|---|
| Phase | 8 — Tech pack & production specification |
| Subsystems | SS-15 Tech Pack & Production Spec, SS-02 Project Lifecycle, SS-05 Artifact Registry |
| Depends on | I28 (review/approval records), I13 (artifact revisions) — plus I12 revisions |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/08-tech-pack.md` §5, §7, §8, §9, §11, §12, §22, §33 Phase 1; `docs/init/03-artifact-schema.md` §17 (PROD-001..010); `docs/init/06-project-lifecycle.md` §6.6, FR-PRJ-063..065, FR-PRJ-073; `docs/plan/03-domain-model.md` "techpack" |
| Open decisions to resolve first | ADR-027 (spec revision storage — confirm JSONB sections); ADR-008 (categories → which templates to seed) |

## 1. Goal
Introduce the production specification as a **structured data product** (FR-TP §5.1), separate from design approval. At the end, an authorized user can create a specification for an approved (or explicitly authorized) design revision, pick a versioned template, fill in style identity and a structured Bill of Materials with explicit units, artifact-revision links and per-field confirmation status — without the system ever inventing supplier or material facts. Every spec revision is pinned to an exact design revision.

## 2. Scope
### In scope
- `packages/techpack-model` (pure TS, ADR-028): zod schemas for `ProductionSpecification`, `SpecificationRevision` content (sections), `StyleIdentity`, `DesignReference`, `BOMItem`, `MaterialSpecification`, `EvidenceReference`; `PropertyValue` envelope reuse from `garment-model`; null / absent / unconfirmed / not-applicable semantics (§8.4); quantity type `{ value, unit }` with unit catalog.
- Spec lifecycle state machine (`not_created → draft → in_progress → needs_review …`) — only draft/in_progress transitions implemented here; review/approve/release transitions are defined in the model but exposed in I43.
- `SpecTemplate` / `SpecTemplateRevision` (versioned, immutable revisions) with required sections, field definitions, BOM categories, required BOM categories per garment category (FR-TP-031, FR-TP-128/129).
- Seed templates: `APPAREL-WOVEN-SHIRT-01`, `APPAREL-KNIT-TEE-01` (per ADR-008) including BOM category lists.
- Create spec from design revision (FR-TP-001/002, FR-TP-015); style identity fields configurable per template (FR-TP-014, §9.1).
- Design-divergence indicator: spec references a revision that is no longer the latest approved one (FR-TP-019) — read-only indicator; impact workflow in I43.
- BOM CRUD + reorder in editable revisions (FR-TP-030..038): category, description, design component refs (stable component IDs, FR-TP-016), artifact + exact artifact revision (FR-TP-037), composition, colorway ref placeholder, width/weight with units, unit of measure, consumption quantity/formula with inputs & assumptions (FR-TP-033/034), supplier refs optional, approved/alternative status (FR-TP-036), confirmation status per field.
- Material specification sub-record with material-category-specific fields (FR-TP-042..048) and composition total check (FR-TP-044, basic).
- Spec revision history: new revision creation (copy-forward of content), revision list (FR-TP-145, FR-TP-153).
- Spec workspace UI (tab inside project): overview, style identity, BOM table.

### Out of scope (deferred to)
- Measurements, POM, grading, tolerances (→ I39)
- Construction, colorways, artwork, labels, quality (→ I40)
- Validation engine & readiness (→ I41); only inline schema validation here
- Export (→ I42); review/approve/release/supersede, impact assessment (→ I43)
- AI drafting (→ I44); costing (optional, off by default — field present, permission-gated, hidden)

## 3. Deliverables
- `packages/techpack-model/src/{schema,units,lifecycle,bom,material,template}.ts` + tests
- `apps/api/src/modules/techpack/` — `techpack.module.ts`, `spec.controller.ts`, `spec.service.ts`, `spec.repository.ts`, `template.service.ts`, `bom.service.ts`, `events.ts`
- `apps/api/prisma/seed/platform/spec-templates.ts`
- `apps/web/src/features/techpack/` — spec list, create-spec dialog, spec workspace shell (section nav), style identity form, BOM grid
- Permission keys added to catalog: `techpack.view`, `techpack.create`, `techpack.edit`, `techpack.view_costing` (others for I43 reserved now: `techpack.review`, `techpack.approve`, `techpack.release`, `techpack.withdraw`, `techpack.distribute`, `techpack.export`)

## 4. Data model changes
- `ProductionSpecification` (display_id `TPS-…`, project_id, design_id, style_identity JSONB, status, current_revision_id, released_revision_id).
- `SpecificationRevision` (display_id `TPS-…-R01`, revision_number, parent_revision_id, source_design_revision_id **not null**, template_revision_id, schema_version, content JSONB (sections), status, version int for optimistic concurrency, frozen_at). DB trigger: once `frozen_at` set (approved/released), content immutable.
- `SpecTemplate`, `SpecTemplateRevision` (immutable).
- Optional normalized `spec_bom_index` (spec_revision_id, artifact_revision_id, category) for "where-used" queries (ADR-027).
- Migration name: `…_i38_production_specification`.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/spec-templates?category=` | `techpack.view` | Eligible templates (FR-TP-128, FR-TP-133 compatibility) |
| `POST /v1/projects/{projectId}/specifications` | `techpack.create` | Create spec from `designRevisionId` + `templateRevisionId` |
| `GET /v1/specifications/{specId}` | `techpack.view` | Spec + current revision summary + divergence flag |
| `GET /v1/specifications/{specId}/revisions` | `techpack.view` | Revision history |
| `POST /v1/specifications/{specId}/revisions` | `techpack.edit` | New editable revision from latest (copy-forward) |
| `PATCH /v1/spec-revisions/{revId}/style-identity` | `techpack.edit` | Update style identity (expectedVersion) |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/bom-items[/{itemId}]` | `techpack.edit` | BOM CRUD (expectedVersion) |
| `POST /v1/spec-revisions/{revId}/bom-items:reorder` | `techpack.edit` | Reorder |
| `POST /v1/spec-revisions/{revId}/fields:confirm` | `techpack.edit` | Confirm/unconfirm field values (records actor/time) |

Events: `SpecificationCreated`, `SpecificationRevisionCreated`, `SpecificationRevisionUpdated` (outbox). Consumes `RevisionCommitted` / approval events to update divergence flag.

## 6. UI
- Project → "Tech pack" tab: spec list with status, source design revision, template.
- Create dialog: choose design revision (approved revisions highlighted; non-approved requires explicit acknowledgement if policy allows), template.
- Spec workspace: left section nav (all §8.1 sections; unimplemented ones show "coming in later iteration" placeholder only in dev), header showing spec display ID, revision, source design revision (+ divergence badge), lifecycle status.
- BOM grid: category grouping, unit pickers, artifact picker (pinned revision shown), `<ValueStatusBadge>` per field, "confirm" action, empty supplier fields shown as `missing`, never prefilled.

## 7. Implementation tasks (ordered checklist)
1. [ ] Confirm ADR-027; create `packages/techpack-model` with schemas, unit catalog (length mm/cm/in, mass g/kg, gsm, count/pcs, m/yd, %) and conversion helpers (reuse `garment-model/units`).
2. [ ] Model null semantics: `PropertyValue.status` distinguishes `missing` vs `not_applicable`; absent key ≠ not applicable (§8.4).
3. [ ] Template schema + seed two templates; template compatibility check against garment category & schema version (FR-TP-133).
4. [ ] Prisma models + migration + immutability trigger on frozen revisions.
5. [ ] `spec.service`: create spec (binds exact design revision; refuses unknown/inaccessible revision), new revision (copy-forward), optimistic concurrency.
6. [ ] BOM service: CRUD, reorder, artifact revision resolution through `artifacts` service (pinned, FR-TP-037), consumption formula storage with inputs & assumptions, composition total check (warning only here).
7. [ ] Field confirmation endpoint storing actor/time; AI-sourced values cannot be confirmed without explicit user action (prepared for I44).
8. [ ] Divergence projection: on new approved design revision, mark specs referencing older revisions (FR-TP-019, FR-TP-020 — never auto-migrate).
9. [ ] Costing fields gated by `techpack.view_costing` and excluded from API responses otherwise (FR-TP-183 groundwork).
10. [ ] Web UI: list, create, workspace shell, style identity, BOM grid.
11. [ ] Audit events for create / revision / confirm (FR-TP-178).
12. [ ] Tests; update PROGRESS.md.

## 8. Tests
- Unit (techpack-model): quantity requires unit (FR-TP-032); missing vs not_applicable semantics; composition sum rule; template compatibility.
- Integration: spec creation binds exact design revision; later design commit does not change it (AC-TP-001, FR-TP-020); BOM item artifact ref stays pinned after artifact gets new revision; frozen revision update rejected by DB trigger; concurrency conflict → 409; cross-tenant access to spec → 404; costing fields absent without permission.
- E2E: create spec from approved shirt revision, add main fabric + buttons + care label BOM rows, confirm one field.

## 9. Acceptance criteria
- [ ] AC1 — Spec revision always references an exact design revision; changing the design never changes it (AC-TP-001, FR-TP-002, FR-TP-015, FR-TP-020, PROD-001).
- [ ] AC2 — BOM items are structured records with explicit units, category, artifact revision refs and confirmation status; incomplete items allowed (AC-TP-002, FR-TP-030..038, PROD-002).
- [ ] AC3 — No supplier, composition, certification or price is ever pre-filled as confirmed; unknown values are `missing` (FR-TP-040, AC-TP-005, §5.3).
- [ ] AC4 — Templates are versioned; each spec revision records its template revision (FR-TP-129); template change does not alter existing revisions (FR-TP-130).
- [ ] AC5 — Spec revision history is preserved and identifiers are stable/unique (FR-TP-145, FR-TP-153).
- [ ] AC6 — Divergence indicator appears when a newer approved design revision exists (FR-TP-019).
- [ ] AC7 — Design approval status and spec status are displayed separately (FR-PRJ-063, §5.2).

## 10. Risks & notes
- Do not let the spec "follow" the working copy — always a committed revision (FR-PRJ-073).
- Keep design properties and production values distinct: a sleeve "length" in the garment model is not a POM value (§5.4).
- JSONB content can grow large; API should support section-level reads/patches to avoid loading whole content (TECH §9.1).
- Approval of the source design revision is a configurable prerequisite (FR-PRJ-074) — implement as template/org policy flag, default "required for release, warning for draft".

## 11. Handoff
- I39 adds `measurement_specification` section to the same content schema; keep section registry extensible.
- Record seeded template IDs and any schema decisions in PROGRESS.md.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
