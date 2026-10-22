# 00 — Specification Digest

A condensed, faithful summary of every requirements document in [`../init/`](../init/). Use it to orient quickly; **read the original sections** referenced by an iteration before implementing (grep by the requirement-ID prefixes listed per document).

---

## 1. Document map

| File | Doc ID | Title | Purpose |
|---|---|---|---|
| `01-overview.md` | SRS-GDP-001 v0.1 | Software Requirements Specification (high level) | Product vision, scope, principal FRs, engine list, lifecycle stages, NFRs, delivery phases |
| `02-subsystem-breakdown.md` | (labelled SPEC-GDP-008) | **Duplicate of Tech Pack spec** | See known issues — ARCH-GDP-002 is missing |
| `03-artifact-schema.md` | SPEC-GDP-003 v0.1 | Garment Design Model & Artifact Schema | Canonical garment model, components, properties+provenance, relationships, artifacts, assets, representations, constraints, operations, revisions |
| `04-ai-prompt.md` | SPEC-GDP-004 v0.1 | AI Execution, Prompt Compilation & Provider Integration | Operation contract, strategy routing, compiler, capability registry, adapters, jobs, normalization, validation, credentials, failures |
| `05-ai-usage-metering.md` | SPEC-GDP-005 v0.1 | AI Usage Metering, Subscription & Billing | Usage events, ledger, reservations, plans, allowances, pricing, charges, invoices, payments, budgets, reconciliation |
| `06-project-lifecycle.md` | SPEC-GDP-006 v0.1 | Project Lifecycle & Design Versioning | Projects, working copy, immutable revisions, review/approval, readiness, tech-pack versions, archive/delete |
| `07-editor.md` | SPEC-GDP-007 v0.1 | Editor Interaction & Visualization | Workspace layout, viewport modes, selection, properties, drawing, artifacts, AI controls, undo/redo, autosave, comparison |
| `08-tech-pack.md` | SPEC-GDP-008 v0.1 | Tech Pack & Production Specification | Spec lifecycle, BOM, materials, POM/measurements, grading, tolerances, construction, colorways, validation, release, export, supplier access |
| `09-specification.md` | SPEC-GDP-009 v0.1 | Security, Identity & Organization Access | Accounts, auth, MFA, sessions, orgs, memberships, RBAC, grants, SoD, secrets, API tokens, audit, tenant isolation |
| `10-visualization.md` | SPEC-GDP-010 v0.1 | Rendering, Visualization & 2D/3D Geometry Architecture | Representation layers, render requests/profiles/manifests, 2D/vector/raster, G0–G6 geometry, 3D scene, materials, cloth sim boundary, sync levels, render jobs, cache, export |
| `11-tech-stack.md` | TECH-GDP-001 v1.0 | Finalized Technology Stack & Implementation Plan | **Approved** stack, monorepo layout, module boundaries, AI execution pipeline, deployment, optimization targets |

## 2. Known issues in the source docs

1. **`02-subsystem-breakdown.md` is a duplicate of `08-tech-pack.md`** (identical content apart from Markdown formatting). The referenced parent document **ARCH-GDP-002 — Subsystem Requirements Breakdown and Dependency Specification is missing**. The SS-01…SS-18 subsystem map was reconstructed from cross-references and lives in [`01-architecture.md`](01-architecture.md) §2. Treat that map as authoritative.
2. `05-ai-usage-metering.md` starts with a leftover chat preamble ("The next specification is…") and ends with a stray line ("Add explicit data models and API contracts"). `09-specification.md` starts with a chat preamble ("Here is the next formal specification…"). Ignore those lines.
3. `07-editor.md` ends by recommending "`SPEC-GDP-008 — Rendering, Visualization, and 2D/3D Geometry Architecture`" — this conflicts with actual numbering: SPEC-GDP-008 is Tech Pack; rendering is **SPEC-GDP-010**.
4. `10-visualization.md` §6 contains a `<box-placeholder>` artifact (an intended diagram that is absent).
5. Referenced but **non-existent** documents: Platform Administration Specification, Payment Integration Specification, Testing and AI Quality Evaluation Plan, API specification (exact routes/payloads), Notification spec. The plan covers their minimum needs inside I45, I32, I25/I49, I03, I29 respectively.
6. Status-vocabulary casing differs between docs (SPEC-006 uses `ACTIVE`/`DRAFT`; SPEC-004/005/008 use lowercase). Keep each spec's exact spelling (see `02-conventions.md` §2).

---

## 3. SRS-GDP-001 — High-level SRS (`01-overview.md`)

**ID prefixes:** `FR-0xx`/`FR-1xx` (FR-001…FR-127), `AR-001…007`, `NFR-0xx`.

**Purpose.** Web app that feels like professional desktop design software for apparel users who are not CAD/prompt experts. Start from sketch, fabric, or reference garment → visual structured editing → reusable artifacts → deliberate AI generation → compare/approve → validated tech pack. AI usage metered/billed (platform-managed or customer-provided keys).

**Key concepts.**
- Three separate representations: **design definition** (structured), **visual outputs**, **production specification** (FR-003). An AI image is never proof of manufacturing accuracy.
- Workspace regions: navigation, artifact library, central canvas, properties panel, view controls, generation/review controls, status/activity area (§2.2).
- 17 engines (§6 table) — logical modules, not microservices (AR-007 modular monolith OK).

**Key MUST rules.**
- FR-002: visual interactions → machine-readable operations; no manual prompting for normal operations.
- FR-010–015: auth, orgs/workspaces, RBAC, distinct ordinary/org-admin/billing-admin/platform-admin.
- FR-020–024: project CRUD; lifecycle incl. approval; **design approval ≠ production readiness**; edits after approval create controlled revisions.
- FR-030–034: entry from sketch/photo/fabric; mark info confirmed/inferred/missing/needs-review; never present inferences as facts.
- FR-040–047: component selection & properties; deliberate generation (no AI per property change); 2D/3D; distinguish 3D-looking image from editable 3D; preserve unaffected details and disclose limits.
- FR-050–056: built-in + user artifacts, stable IDs, versioning, compatibility; artifact updates never silently modify approved designs.
- FR-060–065: approval records revision + artifact versions; tech packs reference exact revision; AI suggestions distinguishable from verified values.
- FR-070–083: provider abstraction, capability/cost config, routing, adapters, fallback without silently changing task; prompt compiler is internal; generation traceable.
- FR-090–094: classify ops by execution method; avoid unnecessary AI; caching/dedup; preserve isolation.
- FR-100–127: two usage modes; auditable metering; separate provider-reported vs estimated vs internal cost vs customer charge; no duplicate charges; configurable pricing (PAYG, subscriptions, allowances, overage, org plans); versioned pricing; BYOK usage not billed as platform's.
- AR-001–007: explicit interfaces; no cross-subsystem private-data modification; no provider logic in editor/lifecycle/billing UI; events for async coordination.
- NFR: responsive interactions; async long jobs; idempotent jobs/billing; secrets protected; tenant isolation; audit; traceability revision↔operation↔job↔output↔artifact version↔approval↔tech pack.

**Lifecycle stages (§7):** 1 access → 2 design initiation → 3 visual design → 4 generation request → 5 AI execution → 6 review/refine → 7 design approval → 8 production spec → 9 validation & export → 10 billing review.

**Phases (§10):** P1 core foundation (auth, projects/revisions, garment model, workspace, artifacts, AI integration, compilation, jobs, initial metering/entitlements); P2 editing & AI efficiency; P3 visualization (2D/3D); P4 production readiness. Data models for spec/billing/metering/versioning considered from the start.

**Open decisions (§11):** garment categories (ADR-008), 3D level (ADR-019), auth methods (ADR-006), AI providers (ADR-009), billing unit (ADR-011), payment/tax (ADR-010), BYOK storage (ADR-007), production-ready criteria (I41), deployment boundaries (modular monolith).

---

## 4. SPEC-GDP-003 — Garment Design Model & Artifact Schema (`03-artifact-schema.md`)

**ID prefixes:** `DSN-`, `CMP-`, `PROP-`, `REL-`, `ART-`, `AST-`, `VIS-`, `GEO-`, `CST-`, `OPR-`, `PROD-`, `APR-`, `VER-`, `API-`, `SEC-`, `AC-01…12`.

**Purpose.** Canonical data contract for designs, components, artifacts, assets, representations, provenance and production-facing records.

**Key concepts / vocabularies.**
- Entities: Project, Garment Design, Design Revision (immutable), Design Component, Design Relationship, Artifact, Artifact Revision (immutable), Asset, Property Value, Constraint, Design Operation, Representation, Production Specification, Approval Record.
- Illustrative IDs: `PRJ-000123`, `DSN-000456`, `DSN-000456-R003`, `CMP-…`, `SLV-0007-R004`, `AST-…`, `OPR-…`, `JOB-…` (UUIDs internally allowed).
- **Value status:** `confirmed`, `inferred`, `proposed`, `missing`, `needs_review`, `not_applicable` (§9.2). Property envelope: value, unit, status, source_type, source_refs, confidence, review_required, last_confirmed_by/at.
- Property namespaces: `appearance.*`, `construction.*`, `dimension.*`, `material.*`, `placement.*`, `production.*`, `simulation.*`.
- Component catalog (§8.2): body, front/back panels, sleeve, cuff, collar, neckline, placket, pocket, waistband, hem, yoke, hood, lining, facing, gusset, seam group, decorative region, artwork placement region, custom.
- Relationship types (§10.3): `attached_to`, `contains`, `overlays`, `applied_to`, `decorative_trim_applied_to`, `embroidery_placed_on`, `lining_for`, `aligned_with`, `derived_from`, `constrained_by`, `connected_to`, `replaces`, `references`.
- Artifact categories: components/templates, sleeves/collars/cuffs/pockets/plackets, fabrics, lace/trims/piping, embroidery/motifs, fasteners, artwork/logos, technical symbols. Visibility scopes: platform, organization, user-private, project.
- Fidelity levels **F0–F4** (reference image → layered → structured 2D → editable 3D → validated production geometry).
- Coordinate spaces: image pixel, normalized image, 2D design, component-local, 3D world, pattern-piece.
- Validation outcomes: `valid`, `warning`, `error`, `not_evaluated`, `requires_manual_review`.
- Separate state dimensions (§18.1): design lifecycle, structural validation, production completeness, production approval, export status.
- Versioning layers (§19.1): schema, design revision, artifact revision, asset version, constraint-set version, export version — never conflated.

**Key MUST rules.**
- Structured state authoritative; generated image never the sole truth (§4.1).
- DSN-008/014: revisions immutable; approvals refer to exact revision; post-approval changes never modify approved snapshot.
- CMP-017/020/021: repeated components supported; component instance ≠ artifact; existence ≠ manufacturing-valid geometry.
- PROP-003/005/007: physical dims carry units; unknowns explicit; appearance never establishes composition/GSM/dimensions.
- REL-004/008: placements structural when needed; approximate relationships visibly distinguished.
- ART-002/004/005: artifact revisions immutable; designs pin revisions; no silent migration (§11.6 update policy).
- AST-004/010, VIS-001–007: representations name source revision; 3D-looking raster ≠ editable 3D.
- GEO-002: no physical dims from pixels without calibration.
- CST-003/004/006: blocking vs warning; repeatable against revision + constraint-set version; structure validity ≠ manufacturability.
- OPR-001–008: operations identify target & base revision; validated before mutation; AI ops link to jobs; failed ops never commit partial revisions; idempotent retries; preservation = request, not guarantee.
- API-001–005: mutations carry revision/concurrency token; conflicts explicit; idempotency keys; distinct error types.
- SEC-001–010: tenant isolation, private storage refs, independent use/edit/publish/delete permissions, untrusted imports, no secrets in payloads.

**Reference workflows:** attach lace to sleeve (§23), AI interpretation of photo (§24).

**ACs (AC-01…12):** stable revision, artifact pinning, independent component instances, structured attachment, unsupported attachment disclosure, explicit uncertainty, representation provenance, revision comparison, manufacturing completeness, approval integrity, tenant isolation, schema migration.

**Phases (§26):** P1 canonical model foundation; P2 editor & AI integration; P3 production data; P4 advanced geometry & collaboration.

**Open decisions (§27):** persistence (ADR-003/027), geometry representation (ADR-024), 3D fidelity (ADR-019), property governance, garment taxonomy (ADR-008), artifact sharing (backlog), approval policies (I28), production completeness rules (I41), external standards (backlog), collaboration model (ADR-018).

---

## 5. SPEC-GDP-004 — AI Execution, Prompt Compilation & Providers (`04-ai-prompt.md`)

**ID prefixes:** `OPR-AI-`, `STR-`, `CMP-` (compiler), `INP-`, `REG-`, `ADP-`, `ROUTE-`, `JOB-`, `RES-`, `APP-`, `CON-`, `CRED-`, `USG-`, `ERR-`, `EVT-`, `SEC-AI-`, `OBS-`, `PERF-`, `AC-01…18`.

**Purpose.** Translate structured operations into provider requests, execute through adapters with durable jobs, normalize/validate results, apply to the canonical model under revision rules.

**Key concepts.**
- Pipeline stages (§6.1): capture → validate → strategy → task planning → provider/model selection → compilation → input prep → job execution → normalization → result validation → candidate → apply/review → usage & audit.
- **Design Operation fields** (§7.2): operation_id, operation_type, design_id, base_revision_id, requested_by, target_entities, requested_changes, preservation_constraints, source_references, execution_policy, idempotency_key, created_at.
- **Strategies** (§8.1): deterministic_model_update, vector_operation, rule_based_composition, render_only, image_interpretation, text_to_image, image_to_image, targeted_image_edit, multimodal_reasoning, geometry_generation, composite_pipeline.
- Provider-independent **intermediate request** (§9.4); versioned prompt templates separating objective/context/target/changes/preservation/references/output/uncertainty/safety.
- Reference roles (§10.3): primary source, target view, style, fabric, artifact, color, region mask, geometry, negative mask.
- **Model capability profile** (§11.3): task_types, modalities, constraints, editing capabilities, structured output, streaming/async, reference support, determinism, cost metadata, availability, profile_version; support status verified/documented/configured/unknown.
- **Job states** (§14.3): queued, preparing, submitted, running, awaiting_provider, normalizing, validating, awaiting_review, succeeded, failed, cancel_requested, cancelled, **outcome_unknown**.
- Validation levels (§16.1): L1 transport/file, L2 task conformance, L3 design consistency, L4 production readiness — passing lower ≠ higher.
- Application modes (§16.2): candidate_only, apply_structured_changes, attach_representation, require_user_approval, reject_result.
- Credential modes: A platform-managed, B customer-provided.
- Error categories (§20.1) normalized with code, safe message, diagnostics, retry recommendation.
- Events (§21.1): `design.operation.accepted`, `ai.job.queued|started|progress_updated|output_received|validation_completed|awaiting_review|completed|failed|cancelled`, `ai.provider.submission_accepted|outcome_unknown`, `ai.usage.recorded`, `design.revision.created`.

**Key MUST rules.**
- Structured operation before any AI call (OPR-AI-001); no silent scope broadening (OPR-AI-007).
- Deterministic first (STR-001); never pick a model lacking required capabilities (STR-003); report limitations instead of incompatible substitution (STR-004); record strategy rationale.
- Compiler consumes validated operation, preserves confirmed/inferred distinction, records template/mapping/profile versions, never exposes credentials, minimal context (CMP-001…012).
- INP-001/007: every input asset authorized; never send unrelated data to providers.
- Registry-driven selection; model IDs encapsulated; capability changes versioned/audited (REG-*).
- Every external call through an adapter; adapters normalize errors, distinguish sync vs async acceptance, extract usage, treat responses as untrusted (ADP-*).
- Routing filters ineligible first; fallback must preserve mandatory output requirements; no switching credential owner without authorization (ROUTE-*).
- Durable job per accepted AI operation; restart recovery; acceptance ≠ success; **unknown outcomes never blindly resubmitted** (JOB-*, ERR-*).
- Results normalized, stored via asset subsystem, never infer geometry from raster (RES-*).
- AI results validated before mutating canonical state; candidates ≠ committed; structured changes create new revision (APP-*).
- Jobs retain base revision; stale results never overwrite newer changes; rebases explicit (CON-*).
- Raw credentials never to browser/logs/prompts; encrypted; no silent BYOK→platform fallback (CRED-*).
- Provider usage stored separately from billing; timeouts not assumed zero cost; idempotent usage emission (USG-*).
- Events at-least-once, consumers idempotent, transactional outbox (EVT-*).
- Uploaded content untrusted; embedded text can't override policy (SEC-AI-*).

**Reference workflows (§25):** A deterministic attachment, B AI local edit, C BYOK, D timeout/unknown outcome, E stale revision.

**ACs (AC-01…18):** structured intake, deterministic-first, capability-aware selection, provider-independent compilation, internal prompts, revision provenance, async tracking, normalization, invalid output rejection, candidate vs committed, stale protection, credential isolation, usage attribution, unknown outcome, usage idempotency, preservation disclosure, external-processing restrictions, auditability.

**Phases (§29):** P1 execution foundation (one adapter, durable jobs, basic validation, credential storage, usage events); P2 multi-provider (registry, routing, fallback, BYOK, reconciliation); P3 garment-aware generation (component-aware prompts, masks, preservation, review/conflict); P4 advanced pipelines.

**Open decisions (§30):** task scope, provider set (ADR-009), output fidelity, prompt retention (05-decisions §3), BYOK providers (I33), fallback consent, provider idempotency, application policy (never auto-apply), quality evaluation (I25/I49), usage reconciliation (I34), data residency (backlog), SLOs.

---

## 6. SPEC-GDP-005 — Usage Metering, Subscription & Billing (`05-ai-usage-metering.md`)

**ID prefixes:** `TAX-`, `USE-`, `LED-`, `SUB-`, `ALL-`, `PRICE-`, `PRE-`, `COST-`, `CHG-`, `OUT-`, `INV-`, `PAY-`, `BUD-`, `REC-`, `ADJ-`, `UIB-`, `AUD-`, `AC-01…18`.

**Purpose.** Measure usage, enforce entitlements, calculate charges, track provider cost, collect payments — with metering, billing, and payment as separate responsibilities.

**Four distinct concepts (§4.1):** execution usage, provider cost, customer charge, payment status. Plus credential ownership mode in every record.

**Key concepts.**
- Usage categories (§6.1): AI image generation/editing, text inference, image interpretation, geometry generation, rendering, asset processing, storage, export generation, platform feature usage. Normalized units: `operation`, `image`, `input_token`, `output_token`, `compute_second`, `storage_byte_hour`, `credit`.
- Usage event required fields (§7.1) incl. idempotency_key, credential_ownership_mode, measurement_source (provider-reported/internally measured/estimated/derived).
- **Usage lifecycle** (§8.2): reserved → observed → pending_reconciliation → settled → adjusted/released/disputed (ledger entries preferred over mutable status).
- Plans/entitlements (§9): features, allowances, concurrency, rate, budget, storage, provider/model restriction, seats. **Subscription states:** trial, active, renewal_pending, past_due, suspended, cancelled, expired, pending_plan_change.
- Allowance models: credit, category-specific, resource, hybrid; versioned credit conversion; overage policies (reject, confirm, bill within budget, PAYG, admin-authorized, grace).
- Three pricing layers: provider cost rates, customer-facing rates, subscription pricing (§11.1); immutable pricing versions with effective times.
- Preflight sequence (§12.2) with atomic reservation.
- Cost status: estimated, provider_reported, reconciled, adjusted, unknown.
- Charge categories (§14.2); outcome-billing table (§15.2); invoice structure; **payment states:** pending, processing, succeeded, failed, requires_action, partially_refunded, refunded, disputed.
- Budgets by org/project/user/provider/model/period/ownership mode; reconciliation domains (§19.1); adjustment types (§20.1).

**Key MUST rules.**
- Finalized usage/financial records never rewritten — adjustments/reversals referencing originals (§4.3, USE-002/003, INV-004, CHG-009).
- BYOK costs never counted as platform provider expense nor billed twice (COST-003, CHG-005); platform fee only if explicitly defined.
- Enforce quotas/budgets before platform-managed billable work; atomic against concurrency (PRE-005, ALL-003, BUD-005).
- Idempotent ingestion, settlement, charges, payments, refunds (USE-004, LED-006, CHG-010, PAY-002, ADJ-010).
- Missing metrics are unknown, never zero (USE-011, COST-005, OUT-007); timeouts preserve reservation/exposure.
- Reservation ≠ charge (LED-009, PRE-008); abandoned reservations recovered (LED-010).
- Every charge references a pricing version (PRICE-001, CHG-001); historical invoices reproducible.
- Payment status never from browser redirect; webhooks authenticated (PAY-004/007).
- Dashboard distinguishes actual/reserved/estimated/finalized, provider cost/customer charge, BYOK vs platform (§21.2).
- Financial admin permissions separate from design permissions (AUD-004).

**Workflows (§23):** A allowance covers generation, B PAYG, C BYOK, D provider timeout, E provider success but unusable output.

**ACs (AC-01…18):** attribution, duplicate protection, reservation integrity, allowance enforcement, pricing traceability, credential ownership, BYOK billing, unknown outcomes, failure policy, immutable history, budget enforcement, invoice consistency, payment idempotency, dashboard accuracy, admin traceability, provider reconciliation, reproducibility, cancellation keeps history.

**Phases (§25):** P1 metering foundation (events, ledger, ownership attribution, simple plan, monthly allowance, one pricing model, reservations, basic dashboard, audit); P2 commercial billing (subscription lifecycle, PAYG, overage, invoices, payments, credits, refunds, budgets, reconciliation); P3 advanced (multi-currency, tiers, project budgets, per-model pricing, approvals, profitability).

**Open decisions (§26):** commercial unit (ADR-011), plans, rollover/overage, BYOK fees, failed-generation & retry policy, unknown-outcome escalation, pricing effective time, billing periods, payment & tax (ADR-010), budgets, retention, provider reconciliation — defaults in `05-decisions.md` §3.

---

## 7. SPEC-GDP-006 — Project Lifecycle & Design Versioning (`06-project-lifecycle.md`)

**ID prefixes:** `FR-PRJ-001…100`, `NFR-PRJ-001…020`, `AC-001…015`, `OD-PRJ-001…014`.

**Purpose.** Manage projects, working copies, immutable revisions, review/approval, production readiness, tech-pack versions, archive/delete.

**Key concepts.**
- Six distinct things: project state, current editable design, immutable revisions, review/approval decisions, readiness status, versioned deliverables.
- Entities: Project, Design (working_branch, head_revision), Working copy (base revision, state, monotonic version), Design revision (lineage, content hash, artifact/source refs, validation summary, schema version), Approval record, Production spec revision, Tech-pack version.
- **Project states:** ACTIVE, ON_HOLD, COMPLETED, ARCHIVED, DELETED (transitions §7.5 incl. reopen/restore).
- **Design states:** DRAFT, IN_REVIEW, CHANGES_REQUESTED, APPROVED, SUPERSEDED, CANCELLED.
- **Tech-pack states:** DRAFT, GENERATING, VALIDATION_FAILED, READY_FOR_REVIEW, APPROVED_FOR_RELEASE, RELEASED, SUPERSEDED, CANCELLED.
- Approval types: design review, sample review, production-spec review, production-release review.
- Readiness derived: NOT_CHECKED, BLOCKED, READY_WITH_WARNINGS, READY.
- Logical commands (§14): CreateProject, UpdateProjectMetadata, CreateDesign, GetProjectLifecycle, GetDesignHistory, SaveWorkingCopy, CommitRevision, CompareRevisions, RestoreRevisionToWorkingCopy, CreateBranch, SubmitRevisionForReview, RecordReviewDecision, ValidateProductionReadiness, GenerateTechPack, ReleaseTechPack, Archive/Restore/Complete/ReopenProject.
- Error codes: PERMISSION_DENIED, INVALID_STATE_TRANSITION, REVISION_NOT_FOUND, REVISION_NOT_APPROVED, CONCURRENT_MODIFICATION, VALIDATION_BLOCKED, DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RETENTION_POLICY_BLOCKED.
- Events (§15): ProjectCreated … TechPackSuperseded.

**Key MUST rules.**
- Autosave ≠ revision; explicit commit policy (FR-PRJ-020/021); save acknowledged only after persistence (FR-PRJ-016).
- Optimistic concurrency; conflicts never silently overwrite (FR-PRJ-024/025).
- Revisions immutable, stable IDs, parent lineage, integrity hash verified on restore/export (FR-PRJ-023, 026–028).
- Restore creates new working state; revert commits new revision (FR-PRJ-033/034).
- AI jobs record exact input state; stale results never overwrite newer work; failed jobs never corrupt (FR-PRJ-042–045); no automatic approval (FR-PRJ-048).
- Reviews bound to exact revision; approvals never transfer to new revisions; revocation recorded not erased; SoD configurable (FR-PRJ-049–062).
- Readiness separate from approval, bound to fixed revisions + rule-set version, stale on change, overrides recorded (FR-PRJ-063–072).
- Tech packs from fixed inputs, released versions immutable, superseding preserves history, outdated flagged (FR-PRJ-073–082).
- Archive preserves history; logical vs physical deletion; protected records (FR-PRJ-087–092).
- Every transition audited, idempotent; notifications only after durable commit (FR-PRJ-093–100).
- Transactions: revision commit & approval atomic (§10); outbox for events.

**ACs (AC-001…015):** project init, save/commit separation, immutability, restore, artifact pinning, approval binding, stale generation, concurrent edit conflict, readiness, tech-pack provenance, new deliverable version, archive preservation, idempotent transition, audit completeness, approval race.

**Phases (§18):** P1 project & revision foundation; P2 review & approval + comparison; P3 readiness & deliverables; P4 branching/merge, multi-stage workflows, completion policy, governed deletion, legal hold.

**Open decisions (§19, OD-PRJ-001…014):** revision trigger (explicit commit), multiple approved designs (yes), branches (deferred — ADR-018), approve with warnings (configurable), self-approval (05-decisions §3), old-revision release (explicit policy), completion criteria, retention, deletion (logical first), schema migration (preserve originals), blocking findings (I41), sample gate, external reviewers (I43), supersession (explicit relationship).

---

## 8. SPEC-GDP-007 — Editor Interaction & Visualization (`07-editor.md`)

**ID prefixes:** `FR-EDT-001…140`, `NFR-EDT-001…014`, `AC-EDT-001…015`, `OD-EDT-001…012`.

**Purpose.** Primary visual-first workspace; translates gestures into structured operations; never calls providers directly.

**Key concepts.**
- Layout (§5.1): app header, tool/action bar, component hierarchy, central viewport, contextual properties, asset/artifact browser, operation/history area, status area.
- Viewport modes (§6.1): reference, 2D design, technical flat, 3D preview, split, comparison, annotation.
- **3D capability levels** 3D-L0…L4 (§16.2).
- Interaction state model (§20): selection, viewport, tool, working design, local history, operation, candidate, validation, review, save state — only working design persisted as design data.
- Error table (§22) incl. save failure, conflict, unknown outcome, stale candidate, render/3D failure.
- Logical API (§24): GetEditorState, UpdateWorkingCopy, GetComponentProperties, GetArtifactLibrary, Attach/DetachArtifact, Create/UpdateAnnotation, RequestRender, SubmitDesignOperation, GetOperationStatus, GetCandidateResult, ApplyCandidate, Undo/Redo, CompareDesignStates, GetValidationFindings, CommitRevision.

**Key MUST rules.**
- No prompts required for routine tasks; property changes never trigger AI implicitly (FR-EDT-032).
- Save states visible: saving/saved/unsaved/failed/conflict (FR-EDT-005, 086–092).
- View changes never alter design (FR-EDT-013); stable component IDs, not names/coords (FR-EDT-025).
- Properties schema-backed, validated, provenance/status shown (FR-EDT-028–035).
- Coordinate mapping to underlying space; annotations separate from geometry (FR-EDT-041–044); region limits disclosed (FR-EDT-047).
- Artifact attach is structural, pinned, compatible; unavailable artifact never silently substituted (FR-EDT-049–059).
- Explicit generation action, scope clarity, cost/entitlement feedback, candidates isolated, compare before apply, stale protection, no duplicate submissions (FR-EDT-060–078).
- Undo never deletes revisions/approvals; AI apply recoverable; collaboration-aware undo (FR-EDT-079–085).
- Distinguish latest committed vs latest approved (FR-EDT-099); stale renders flagged (FR-EDT-102); 3D capability disclosed (FR-EDT-108); no physical-validity claims (FR-EDT-113).
- Validation inline + summary, severity, stale, no false readiness (FR-EDT-117–124).
- Keyboard access, shortcuts not while typing, a11y, color-independent (FR-EDT-125–133).
- Server-side authorization; no credentials in client (FR-EDT-134–140).
- NFR: selection/panel p95 <100 ms; local property update p95 <250 ms.

**ACs (AC-EDT-001…015):** visual-first edit, no implicit generation, structured attachment, artifact version stability, candidate isolation, stale protection, undo, render failure, 2D/3D sync, capability disclosure, save conflict, comparison, readiness, permission enforcement, recoverable save failure.

**Phases (§27):** P1 core visual editor; P2 AI-assisted interaction; P3 drawing/region/technical-flat/advanced comparison/a11y; P4 3D & collaboration.

**Open decisions (OD-EDT-001…012):** rendering tech (TECH), 2D-first (yes), selectable components per category (I16), unsupported image editing (disclose), optimistic locking (yes), undo depth (configurable), auto-apply (never), deterministic vs AI registry (I14), mask representation (ADR-025), 3D level (ADR-019), annotation classes (design/review/guide), local recovery storage (I15).

---

## 9. SPEC-GDP-008 — Tech Pack & Production Specification (`08-tech-pack.md`, duplicated in `02-…`)

**ID prefixes:** `FR-TP-001…183`, `NFR-TP-001…012`, `AC-TP-001…014`, `OD-TP-001…012`.

**Purpose.** Turn an approved design revision into a structured, reviewable, versioned production specification and export — never inventing manufacturing facts.

**Key concepts.**
- Principles: tech pack is structured data (PDF is a rendering); approval ≠ readiness; no invented facts (exact measurements, composition, GSM, shrinkage, seam allowances, stitch types/density, grade rules, supplier identity, certifications, tests, tolerances, factory requirements); immutable releases; human accountability.
- **Spec lifecycle:** not created, draft, in progress, needs review, changes requested, validated, approved, released, superseded, withdrawn.
- Sections (§8.1): style ID, design reference & views, colorways, BOM, fabric/trim, measurements, grading/size tables, construction/finishing, artwork/embellishment, labels/packaging, quality/inspection, compliance/testing, sourcing notes, revision history, approval/release, validation summary.
- Entities (§8.2): ProductionSpecification, SpecificationRevision, StyleIdentity, DesignReference, Colorway, BOMItem, MaterialSpecification, MeasurementPoint, MeasurementValue, ToleranceRule, GradeRule, ConstructionInstruction, ArtworkPlacement, LabelSpecification, PackagingSpecification, QualityRequirement, EvidenceReference, ValidationFinding, ReviewDecision, ReleaseRecord, ExportArtifact.
- Measurement provenance: user-supplied, extracted from approved source, formula-calculated, AI-inferred.
- Tolerances: symmetric/asymmetric, source (customer/internal/factory/user).
- Validation dimensions (§21.1, 11 items); finding fields; rule-set versioning; exceptions.
- Templates (§22): garment, org, customer, factory, brand, market, export layout, measurement, BOM, construction — versioned.
- Exports: PDF, XLSX, CSV, images, versioned JSON package; PDF section list (§25.2); watermark drafts.
- Distribution: in-platform, time-limited links, downloads, API, PLM/ERP.

**Key MUST rules (highlights).**
- Every spec revision references exact design revision; no silent migration when design changes; divergence & impact assessment (FR-TP-002, 015–021, 149–151).
- Release requires approval + validation; immutable, supersession preserves history; withdrawal recorded; reopening creates new revision (FR-TP-007–013).
- AI-generated flats ≠ manufacturing-grade technical flats (FR-TP-026); annotations don't modify geometry.
- BOM quantities with units; formulas stored; calculated vs confirmed consumption; no invented supplier facts; colorway-specific materials (FR-TP-030–041).
- Material attributes by category with units; composition sum rule; evidence-linked tests; unverified flagged (FR-TP-042–048).
- Structured measurement table, base size, units with defined rounding, POM definitions/methods, image-derived estimates flagged, tolerances required before release, range checks (FR-TP-049–060).
- No universal grading; derived values traceable to rule & base; overrides recorded (FR-TP-061–069).
- Construction instructions structured & sequenced; AI proposals marked; no "factory-validated" claims (FR-TP-076–085).
- Display ≠ physical color; artwork dimensions explicit (FR-TP-086–094).
- Compliance: attached ≠ verified; never claim certification (FR-TP-095–101). Quality criteria never invented (FR-TP-102–107).
- AI drafting with field-level provenance, accept/edit/reject, confidence ≠ confirmation, schema-validated, never auto-release (FR-TP-108–118).
- Validation per template, cross-section, versioned rules, blocking, recorded exceptions, staleness, no false completeness (FR-TP-119–127).
- Release manifest captures spec rev, design rev, artifact revs, rule-set & template versions, exports (FR-TP-140).
- Export bound to exact revision, validated, no fabricated substitutes, retry without duplicate release, watermarking, legibility, confidentiality (FR-TP-154–166).
- Supplier access authorized, logged, revocable; supplier changes go through review (FR-TP-167–175).
- Permissions, audit, field provenance, costing visibility restricted (FR-TP-176–183).

**ACs (AC-TP-001…014):** revision binding, structured BOM, measurement traceability, grading integrity, no fabricated facts, validation blocking, AI review, approval control, immutable release, release reproducibility, export integrity, change impact, supplier access, supersession.

**Phases (§33):** P1 structured spec (lifecycle, binding, templates, BOM, measurements/POM, construction, statuses, basic validation, PDF, history); P2 grading/tolerances, colorways, artwork, annotations, review/release, manifests, advanced validation, permissions; P3 AI-assisted documentation; P4 ecosystem integrations.

**Open decisions (OD-TP-001…012):** categories (ADR-008), mandatory sections (by template), measurement standards (configurable POM templates), grade-rule source (explicit), costing (off by default), launch formats (PDF+XLSX+JSON), supplier approvals (comments first), production-ready definition (versioned policy, I41), compliance (evidence tracking), retention, AI measurement suggestions (inferred only), historical templates (retain versions).

---

## 10. SPEC-GDP-009 — Security, Identity & Organization Access (`09-specification.md`)

**ID prefixes:** `FR-SEC-001…243`, `NFR-SEC-001…019`, `TR-SEC-001…026`, `AC-SEC-001…016`, `OD-SEC-001…015`.

**Purpose.** Authentication, accounts, orgs/workspaces, memberships, RBAC + resource grants, SoD, sessions, secrets, API tokens, audit, tenant isolation.

**Principles (§5):** deny by default; tenant isolation; server-side enforcement; least privilege; explicit business authority (edit ≠ approve ≠ release; view billing ≠ manage); credential isolation; traceability; prompt revocation (incl. queued work); separation of duties; **fail closed**.

**Key concepts.**
- Account states: pending_verification, active, suspended, locked, deletion_pending, deleted_or_anonymized. Membership states: invited, active, suspended, revoked, expired.
- Permission naming `<resource>.<action>` (e.g. `organization.view`, `members.invite`, `members.manage_roles`, `project.create|view|edit`, `design.generate|approve`, `artifact.create|publish`, `techpack.release`, `billing.view|manage`, `credentials.manage`, `audit.view`).
- Baseline roles: Organization Owner, Organization Admin, Design Lead, Designer, Merchandiser, Production/Technical User, Approver, Billing Admin, Credential Admin, Viewer, Supplier/External Collaborator, Platform Operator. Matrix in §23.
- Authorization contract (§22): request {principal, organization_id, action, resource, context} → {decision allow|deny, reason_code, policy_version, obligations}.
- Data classification: public, internal, confidential, restricted.
- Audit event schema (§15.2).
- Logical data model (§21.1): User, IdentityCredential, Organization, Workspace, Membership, Role, Permission, RolePermission, MembershipRole, ResourceGrant, Session, ApiToken, ServiceIdentity, SecretReference, SecurityAuditEvent, SecurityPolicy.

**Key MUST rules.**
- Accounts: normalized email, no auto-merge, single-use short-lived tokens, rate limits, no enumeration (FR-SEC-001–015); argon2-class hashing, reset doesn't bypass MFA, secure recovery (016–027).
- Auth: validated federated responses; IdP claims don't auto-grant membership (028–032); MFA for privileged roles, step-up for sensitive actions (033–040); abuse protection without trivial lockout DoS (041–045).
- Sessions: unpredictable, HTTP-only Secure SameSite cookies, CSRF, idle/absolute timeouts, revocation, **revalidate before queued high-impact ops** (046–059).
- Orgs: membership only via invitation/admin/provisioning — not email domain; invitations scoped, single-use, cannot exceed inviter's authority; last-owner protection (060–083).
- RBAC + resource grants + context; central permission catalog; every protected op mapped; no delegation beyond own rights; effective-permission review; revocable grants rechecked on access; SoD (084–105).
- Resource rules: projects, artifacts, tech packs, billing, credentials (masked, never returned), exports/deletion (106–145).
- API tokens hashed, scoped, revocable; service identities scoped; webhooks verified & replay-safe; SSRF-safe callbacks (146–163).
- Secrets encrypted, separate keys, never in code/bundles/logs; TLS; classification; uploads scanned; redaction (164–177).
- Audit protected, permissioned, searchable, no secrets; alerts on anomalies (178–185).
- Platform operators: no default customer-data access; break-glass justified/audited (186–197).
- AI ops: identify initiator; reauthorize at job start and result retrieval; untrusted inputs; AI output can't invoke privileged actions; minimal provider data (198–215).
- Tenant isolation across DB, storage, caches, search, jobs, exports; tenant from trusted context (216–225).
- NFR: authz p95 ≤100 ms; revocation ≤60 s; fail closed.

**ACs (AC-SEC-001…016):** membership required, no ID tampering, no over-delegation, timely revocation, MFA for high-risk, edit/generate ≠ approve/release, billing/credential admin separation, BYOK not exposed, fail closed, queued reauth, audit, supplier access, no cross-tenant roles, SoD, AI can't bypass authz, test coverage.

**Phases (§28):** P1 mandatory foundation (identity, auth, sessions, central authz, memberships/invites, baseline roles, tenant isolation, secrets, audit, cross-tenant tests); P2 grants, configurable roles, MFA policies, session controls, SoD, API tokens, supplier access, notifications, monitoring; P3 SSO, SCIM, conditional access, access reviews, advanced audit. **Core tenant isolation, server-side authz, secret protection cannot be delayed.**

**Open decisions (OD-SEC-001…015):** auth provider (ADR-006), sign-in methods, MFA policy, hierarchy (ADR-017), custom roles (later), sharing (explicit grants), authz caching (≤60 s), audit retention, SSO (backlog), supplier identity (05-decisions §3), support access (I45), org recovery, API tokens (I47), data residency (backlog), targets.

---

## 11. SPEC-GDP-010 — Rendering, Visualization & 2D/3D Geometry (`10-visualization.md`)

**ID prefixes:** `FR-RV-001…202`, `NFR-RV-001…018`, `AC-RV-001…020`.

**Purpose.** Render designs consistently across views/exports with explicit fidelity, revision traceability, and no conflation of appearance with geometry or manufacturing truth.

**Key concepts.**
- Representation layers **R0–R6**: canonical model, semantic component graph, editable 2D geometry, 3D scene, materials/textures, rendered images, production geometry/specs.
- Logical subsystems (§7.1): Render Request API, Profile Manager, Design State Resolver, Geometry Builder, Material Resolver, 2D Renderer, 3D Scene Builder, 3D Renderer, AI Visual Adapter (via central orchestrator only), Render Job Manager, Validator, Cache, Preview Delivery, Export Service, Observability.
- Render request fields (§8.1); render purposes (§8.2: interactive editor, technical flat, design review, component inspection, colorway preview, material inspection, 3D review, presentation, tech-pack illustration, production geometry export); **versioned render profiles**.
- **Geometry capability G0–G6** (image-only → annotated → editable 2D → approximate 3D → structured 3D → pattern-linked 3D → production-validated).
- **Sync levels S0–S4** (independent → revision-linked → component-linked → geometry-synchronized → pattern-linked).
- Render job states: created, queued, resolving_inputs, building_geometry, rendering, validating, completed, completed_with_warnings, failed, cancel_requested, cancelled, expired.
- Render manifest (§16.3): source design/revision, representation type, geometry capability, sync level, profile id+version, method, artifact revisions, outputs, validation status.
- Validation outcomes: passed, passed_with_warnings, needs_review, failed, not_applicable.
- Export formats (§19.1): SVG, PNG, WebP, JPEG, PDF, GLB/glTF, JSON manifests.
- Operation routing table (§15.2): color/visibility/artifact swap/camera/transform = deterministic; style concept = AI image generation; local edit of flattened image = targeted AI edit; image→geometry = dedicated reconstruction pipeline.

**Key MUST rules.**
- Renders reference canonical revision (or explicit provisional state); never overwrite canonical properties from render inferences; failures never corrupt state; dependencies invalidate derived outputs (FR-RV-001–006).
- 2D without 3D allowed; AI imagery stored as proposal (FR-RV-007–010).
- Don't silently resolve to latest when a revision is specified; report unachievable fidelity (FR-RV-012/015); profile changes non-retroactive (FR-RV-018).
- Structured 2D selection resolves to component IDs; background imagery not selectable as geometry (FR-RV-021–026).
- Missing back view not fabricated by mirroring as verified geometry (FR-RV-030); flats ≠ patterns (FR-RV-032).
- SVG imports sanitized (no scripts/external refs) (FR-RV-035/036); raster ≠ vector (FR-RV-042).
- Every geometry declares capability class; no silent upgrade; G5/G6 require evidence (FR-RV-049–053).
- 3D: GLB/glTF validated; fallback when unsupported; camera never mutates geometry; image-inferred geometry approximate (FR-RV-054–071).
- Visual vs physical material properties distinct; screen color ≠ physical match (FR-RV-072–086).
- Static mesh ≠ cloth simulation; defaults labelled (FR-RV-087–095).
- Synchronized views share canonical state; declare sync level; never claim S3/S4 falsely; conflict policy (FR-RV-096–108).
- AI visual ops through central orchestration + metering; proposals until accepted (FR-RV-109–118).
- Render jobs: stable IDs, revision/profile bound, retries don't substitute revision/profile, dedupe, reauth on retrieval (FR-RV-124–134).
- Cache keys include revision, artifact revs, builder/renderer/profile versions, tenant scope (FR-RV-139–143).
- Exports bound to one revision; failed export never overwrites prior; production geometry only when validated (FR-RV-161–172).
- Security: untrusted file limits, no external resource loading, no script execution (FR-RV-187–197).
- Performance targets: 2D update p95 <100 ms; cached preview <500 ms; 3D ready <3 s; async preview <10 s.

**ACs (AC-RV-001…020):** revision traceability, 2D without 3D, raster not geometry, capability classification, artifact provenance, derived-view updates, sync disclosure, AI non-overwrite, job provenance, failure isolation, cache isolation, technical-flat export metadata, 3D export limitations, render vs production validation, tech-pack illustration binding, untrusted file validation, central AI orchestration, editor responsive, authz on create & retrieve, regression tests.

**Phases (§28):** P1 structured 2D & rendering foundation; P2 interactive 3D; P3 advanced materials & AI-assisted visualization; P4 pattern-linked geometry & cloth simulation.

**Architecture recommendations (§29):** specialized renderers behind shared contracts; start with a defined garment subset and reliable structured 2D; treat image/mesh/pattern generation as separate capabilities; preview/interactive/export profiles; track artifact geometry availability as metadata.

---

## 12. TECH-GDP-001 — Finalized Technology Stack (`11-tech-stack.md`) — **Approved baseline**

**Stack:** Next.js, React, TypeScript, Tailwind, shadcn/ui, Lucide, TanStack Query, React Hook Form, Zod | Node.js LTS, NestJS, REST, OpenAPI, SSE | PostgreSQL + Prisma (JSONB for flexible data; **no MongoDB**) | Redis, BullMQ, ioredis | S3-compatible object storage (MinIO or alternative — evaluate licensing) | SVG (+ Konva for canvas interactions) | Three.js, R3F, Drei, glTF/GLB (**viewer only**) | Sharp | Vitest/Jest, Playwright, ESLint, Prettier, TS strict | JSON logging + OpenTelemetry | pnpm + Turborepo | Docker Compose, Caddy/Nginx.

**12 mandatory principles (§2):** TS everywhere; Postgres system of record; modular monolith; separate worker processes; files in object storage; canonical garment model independent of images; all AI through central backend orchestration; traceable operations/revisions/billing; deterministic over AI; minimal infrastructure; Docker Compose self-hosting; interfaces allow later service extraction.

**Key rules.**
- Redis never the only record; every important job has a persistent record (identity, type, status, source revision, config, results); idempotency keys + reconciliation; retries assume provider may have executed (§3.5).
- Object storage private by default; signed URLs; validation; separation of originals vs derived (§3.6).
- Editor maintains semantic data independent of SVG; SVG and canvas may coexist (§3.7).
- 3D first release does not promise image→3D, patterns, cloth sim, or manufacturing validation (§3.8).
- Tests must cover business rules, authz, revision integrity, jobs, billing idempotency, file access, tech pack validation (§3.10).
- Never log passwords/tokens/keys/private content (§3.11).
- Monorepo layout §4; create packages only when needed; garment model must not depend on React/NestJS/Prisma/AI providers.
- 19 backend modules (§5).
- AI execution workflow 16 steps (§7) — validate → target → load revision → build op → validate constraints → deterministic? → compile → entitlement check → durable job + reservation → adapter → validate → store → revision → usage → notify.
- Deployment (§8): only proxy public; internal network for data services; HTTPS, volumes, secrets outside git, migrations, health checks, restart policies, off-server backups, tested restore; worker movable.
- Performance targets (§9.5): API p95 <300 ms; editor feedback p95 <100 ms; project load p95 <2.5 s; job status visibility <2 s.
- Security list (§10).

---

## 13. Cross-cutting invariants (every session must obey)

1. **Structured canonical garment model is authoritative**; images/SVG/3D/PDF are derived representations bound to an exact revision.
2. **Immutable records**: design revisions, artifact revisions, approvals, released spec revisions & exports, pricing/plan/template/profile versions, finalized usage events, issued invoices, audit events. Corrections = new records referencing originals.
3. **Pin exact versions**: designs pin artifact revisions; specs pin design revisions and template versions; renders pin revision + profile; charges pin pricing versions.
4. **Explicit uncertainty**: every design/production-critical value carries status (`confirmed|inferred|proposed|missing|needs_review|not_applicable`) and provenance; AI never promotes values to `confirmed`; unknown ≠ zero ≠ not applicable.
5. **Design approval ≠ structural validity ≠ production readiness ≠ release** — separate statuses, separate permissions.
6. **AI only on explicit user intent**, via structured operation → deterministic-first router → preflight (entitlement + atomic reservation) → durable job → adapter. Editor never calls providers.
7. **Candidates are not committed state**; nothing auto-applies; stale results (base revision/version mismatch) never overwrite newer work.
8. **Durable jobs in Postgres** with state machines incl. `outcome_unknown`; Redis is transport only; recovery after restart; no blind resubmission of possibly-executed provider calls.
9. **Idempotency everywhere it matters**: mutations with retry risk, events (at-least-once + idempotent consumers), usage ingestion, settlement, charges, payments, releases, exports.
10. **Optimistic concurrency** on mutable aggregates; conflicts surface as `CONCURRENT_MODIFICATION`, never silent overwrite.
11. **Deny by default, server-side, fail closed**; every route declares a permission; reauthorize at job start and at result/download retrieval.
12. **Tenant isolation** across DB, object storage, caches, search, jobs, exports, logs; tenant derived from trusted context; inaccessible resources look like 404.
13. **Secrets never leave the backend** (no browser, logs, prompts, events, exports); BYOK keys masked; BYOK costs never billed as platform consumption; no silent credential-mode fallback.
14. **Metering ≠ billing ≠ payment**: usage facts, provider cost, customer charge and payment status are separate records; estimates labelled.
15. **Fidelity honesty**: declare F/G/S/3D-L levels; never present 3D-looking raster as editable 3D, renders as patterns, static meshes as simulation, or screen colour as physical match.
16. **Modular-monolith boundaries**: modules use each other's services/events, never each other's tables; pure packages stay framework/provider-free.
17. **Auditability**: consequential actions (auth, roles, approvals, releases, billing, credentials, exports, operator access) produce append-only, redacted audit events with correlation IDs.
