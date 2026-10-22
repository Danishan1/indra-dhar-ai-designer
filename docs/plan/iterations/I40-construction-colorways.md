# I40 — Construction, colorways, artwork, labels & quality

| Field | Value |
|---|---|
| Phase | 8 — Tech pack & production specification |
| Subsystems | SS-15 Tech Pack & Production Spec, SS-10 Rendering (technical views), SS-11 Assets |
| Depends on | I39, I35 (technical-flat renders bound to design revisions for callouts/diagrams) |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/08-tech-pack.md` §10, §16, §17, §18, §19; `docs/init/03-artifact-schema.md` §14 (placement & coordinate spaces); `docs/init/10-visualization.md` §12.3 (colour accuracy), FR-RV-172 |
| Open decisions to resolve first | none (costing remains off by default) |

## 1. Goal
Complete the remaining specification sections so a tech pack can fully describe how a garment is built and checked: ordered construction instructions linked to components and BOM items, colorways with colorway-specific materials, production-critical artwork placements, labels and packaging, quality requirements, compliance evidence, and technical views with numbered callouts — all with explicit confirmation status and no claims of legal compliance.

## 2. Scope
### In scope
- **Technical views** section: select views (front/back/side/detail) from render pipeline outputs bound to the spec's source design revision (FR-TP-017, FR-TP-022, FR-TP-027); view provenance (FR-TP-018); numbered callouts as structured annotations referencing instructions / BOM items / POMs / placements (FR-TP-023, FR-TP-024, FR-TP-029); detail views (FR-TP-028). AI fashion images flagged as non-technical (FR-TP-026).
- **Construction instructions**: structured records (sequence, target component, operation category, text, stitch/seam spec, method, finishing, BOM refs, applicable sizes/colorways, QC checkpoint, status, source) with reorder (FR-TP-076..085). Seed instruction templates per category (as `proposed` templates, not confirmed).
- **Colorways**: named colorways, colour references (code + system + swatch asset), colorway-specific BOM overrides (FR-TP-038, FR-TP-086, FR-TP-087, FR-TP-090); display-limitation notice (FR-TP-091).
- **Artwork placements**: target component/region, coordinate space, anchor, offset, dimensions + units, orientation, repeat/spacing, colorway, artwork artifact revision (FR-TP-088, FR-TP-089, FR-TP-092, FR-TP-093).
- **Labels & packaging**: configurable label types per template/market (FR-TP-095), packaging/packing instructions (FR-TP-096).
- **Compliance & evidence**: attach documents (assets) as `EvidenceReference` with status `attached | verified | expired` distinct from claims (FR-TP-097..101); expiry dates and warnings.
- **Quality requirements**: inspection criteria with acceptance rule & source standard; planned tests vs completed test results (FR-TP-102..107).
- Section-level change attribution and optional change reason capture (FR-TP-085, FR-TP-148 groundwork).

### Out of scope (deferred to)
- Cross-section validation rules & readiness (→ I41)
- PDF layout of these sections (→ I42)
- AI construction drafting (→ I44)
- Market-specific rule packs beyond configurable label lists (→ backlog)

## 3. Deliverables
- `packages/techpack-model/src/{construction,colorway,artwork,labels,packaging,quality,evidence,technical-views}.ts`
- `apps/api/src/modules/techpack/{construction.service, colorway.service, artwork.service, labels.service, quality.service, evidence.service, technical-views.service}.ts` + routes
- `apps/web/src/features/techpack/{construction,colorways,artwork,labels,quality,evidence,views}/`
- Seed: construction instruction templates & label type lists for the two seeded templates.

## 4. Data model changes
- Spec content JSONB sections: `technical_views`, `construction_instructions`, `colorways`, `artwork_placements`, `labels`, `packaging`, `quality_requirements`, `compliance` (ADR-027).
- `EvidenceReference` stored inside content, pointing to `Asset` ids; evidence assets classified `confidential`.
- No new tables expected (optionally `spec_evidence_index` for expiry sweeps).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `PUT /v1/spec-revisions/{revId}/technical-views` | `techpack.edit` | Select views (render manifest ids) |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/callouts[/{id}]` | `techpack.edit` | Numbered callouts with structured refs |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/construction[/{id}]`, `…:reorder` | `techpack.edit` | Instructions |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/colorways[/{id}]` | `techpack.edit` | Colorways & BOM overrides |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/artwork-placements[/{id}]` | `techpack.edit` | Placements |
| `PUT /v1/spec-revisions/{revId}/labels`, `/packaging` | `techpack.edit` | Labels & packaging |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/quality-requirements[/{id}]` | `techpack.edit` | Quality |
| `POST/PATCH/DELETE /v1/spec-revisions/{revId}/evidence[/{id}]` | `techpack.edit` | Evidence attachments & status |

Events: `SpecificationRevisionUpdated` with `section`; worker job `evidence-expiry-sweep` emits `EvidenceExpiring` (consumed by notifications, I29).

## 6. UI
- Technical views tab: pick render outputs (shows source revision; mismatched revision blocked unless "approved exception" noted), callout tool placing numbered pins linked to records.
- Construction tab: ordered list with drag reorder, component chip, stitch/seam fields, BOM link chips, status badges.
- Colorways tab: matrix of colorways × BOM items with override cells; swatch preview with "screen colour is not a physical match" notice.
- Artwork tab: placement form + visual preview on flat, explicit dimension/unit fields.
- Labels/packaging, quality, compliance tabs: structured forms; evidence list with "attached" vs "verified" vs "expired" badges.

## 7. Implementation tasks (ordered checklist)
1. [ ] Schemas for each section in techpack-model with PropertyValue envelopes on production-critical fields.
2. [ ] Technical view selection bound to render manifests of the source design revision; reject mismatches (FR-TP-027) unless an exception record is supplied.
3. [ ] Callout annotations stored with coordinate space and target record refs; editing callouts never touches geometry (FR-TP-029).
4. [ ] Construction CRUD + reorder + component/BOM ref validation against source revision & BOM.
5. [ ] Colorways with BOM overrides; colour reference storage independent of screen RGB (FR-RV-086).
6. [ ] Artwork placements with coordinate-space aware validation (FR-TP-093, GEO-001/004).
7. [ ] Labels/packaging/quality/evidence services; evidence expiry sweep job.
8. [ ] Ensure no compliance "claim" field can be set to verified merely by uploading (FR-TP-098, FR-TP-099): verification requires explicit actor + evidence ref.
9. [ ] Web tabs.
10. [ ] Tests; PROGRESS.md.

## 8. Tests
- Unit: instruction ordering stable; colorway override resolution; placement validation per coordinate space; evidence status transitions.
- Integration: technical view from a different design revision rejected; callout references deleted instruction → flagged; evidence expiry job emits event once (idempotent); uploading a certificate does not set any claim to verified.
- E2E: add 5-step construction sequence with BOM links, two colorways with different buttons, a chest embroidery placement with dimensions, care label, measurement QC requirement.

## 9. Acceptance criteria
- [ ] AC1 — Construction instructions are structured, ordered, linked to components/BOM, attributable (FR-TP-076..080, FR-TP-085).
- [ ] AC2 — Colorway-specific materials supported (FR-TP-038, FR-TP-087); display-limitation notice shown (FR-TP-091).
- [ ] AC3 — Artwork placements reference exact artwork artifact revisions and store explicit dimensions with units (FR-TP-088, FR-TP-089, FR-TP-092).
- [ ] AC4 — Attached evidence is distinguished from verified claims; no automatic compliance claims (FR-TP-098, FR-TP-099); expiry warnings (FR-TP-100).
- [ ] AC5 — Planned tests distinguished from completed results (FR-TP-105); no invented acceptance thresholds (FR-TP-107).
- [ ] AC6 — Technical views correspond to the spec's source design revision; AI imagery not treated as technical flats (FR-TP-026, FR-TP-027).
- [ ] AC7 — Callouts are structural links and editable without modifying garment geometry (FR-TP-024, FR-TP-029).

## 10. Risks & notes
- Many fields — resist building bespoke forms per field; drive forms from template field definitions (I38 template schema).
- Unsupported manufacturing claims (FR-TP-084): there is no "factory validated" flag unless an authorized workflow sets it; do not add one now.

## 11. Handoff
- I41 needs every section to expose stable record IDs and status fields for rules.
- I42 needs layout-ready data accessors per section.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
