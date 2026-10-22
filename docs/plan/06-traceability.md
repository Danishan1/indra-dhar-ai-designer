# 06 — Traceability: Spec Requirements → Iterations

Maps requirement groups (by ID range) from every spec to the iteration(s) that implement them. "Primary" = where the requirement is mainly built; "+" = extended/completed later. Use it to (a) find where a requirement lands, (b) check coverage when closing an iteration, (c) know which original sections to read.

Iteration names: see [`04-roadmap.md`](04-roadmap.md). Grep originals in `docs/init/` by the ID prefix.

---

## 1. SRS-GDP-001 — `01-overview.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| FR-001, §2.2 | Professional desktop-like web workspace | I04 (shell), I15 (editor workspace) |
| FR-002 | Visual interactions → structured operations | I14, I15–I18 |
| FR-003 | Design definition vs visual output vs production spec | I11, I12, I35, I38 |
| FR-010…015 | Auth, orgs, roles, access control | I05–I08, I47 |
| FR-020…024 | Projects & lifecycle, approval vs readiness, controlled revisions | I10, I12, I19, I28, I41 |
| FR-030…034 | Design entry from sketch/photo/fabric; confirmed/inferred/missing | I26 (+ I11 statuses) |
| FR-040…043 | Component selection, editing, undo/redo, history, comparison | I15–I19 |
| FR-044 | Deliberate generation | I25 |
| FR-045…046 | 2D/3D visualization; 3D-looking image ≠ editable 3D | I16, I35–I37 |
| FR-047 | Preserve unaffected details, disclose limits | I25, I27 |
| FR-050…056 | Artifact libraries, reuse, versioning, compatibility | I13, I18 |
| FR-060…061 | Compare & approve revisions | I19, I28 |
| FR-062…065 | Tech packs, missing info, AI vs verified, revision binding | I38–I44 |
| FR-070…075 | Provider abstraction, routing, adapters, fallback | I22, I23, I33 |
| FR-080…083 | Prompt compilation, traceability, output validation | I23, I25 |
| FR-090…094 | Execution classification, avoid AI, caching, metrics | I14, I23, I35, I46 |
| FR-100…102 | Usage modes, job attribution, entitlements | I24, I30, I33 |
| FR-110…113 | Auditable metering, cost distinctions, reconciliation, no duplicate charges | I24, I34 |
| FR-120…127 | Pricing models, quotas, limits, billing workflows, BYOK separation, versioned pricing | I30–I34 |
| AR-001…007 | Subsystem independence, modular monolith, events | I01–I03 (+ every iteration) |
| NFR-001…003 | Responsiveness, async jobs, concurrency limits | I15, I21, I49 |
| NFR-010…012 | Scalability, failure isolation, idempotency | I03, I21, I24, I48 |
| NFR-020…023 | Secrets, isolation, audit, provider data policies | I07, I22, I47 |
| NFR-030…031 | Extensibility (providers, categories, artifacts) | I11, I13, I22 |
| NFR-040…042 | Traceability & integrity | I12, I24, I43 |
| §10 Planning requirement | Spec/billing/metering/versioning data models early | I03, I12, I24, I38 |

## 2. SPEC-GDP-003 — `03-artifact-schema.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| §6 conventions (IDs, timestamps, units, enums) | Common schema conventions | I03 (IDs), I11 (units, enums) |
| DSN-001…007 | Garment design root | I12 |
| DSN-008…014 | Immutable revisions, lineage, comparison, undo, approval refs | I12, I19, I28 |
| CMP-015…021, §8.2 | Component catalog, hierarchy, repeated components, instance vs artifact | I11, I17 |
| PROP-001…007, §9.2–9.5 | Property envelope, status vocab, provenance, types, units | I11 (+ I17 UI) |
| REL-001…008, §10.3 | Relationships & placement | I11, I14, I18 |
| ART-001…014, §11.5–11.6 | Artifact registry, revisions, scopes, update policy | I13, I18 |
| AST-001…010 | Assets & representations | I09, I12 (Representation), I25, I35 |
| VIS-001…007, §13.2 F0–F4 | Fidelity & synchronization | I16, I35–I37 |
| GEO-001…007 | Coordinate spaces, placement, calibration | I11, I16, I27 |
| CST-001…007, §15 | Constraints & validation findings | I11 (rules), I20 |
| OPR-001…008, §16.3 | Operations & preservation | I14, I25, I27 |
| PROD-001…010, §17 | Production spec data | I38–I42 |
| APR-001…005, §18 | Approval & readiness dimensions | I28, I41 |
| VER-001…006, §19 | Versioning layers, schema migration | I11, I12 (+ I47 migration tooling) |
| API-001…005, §20 | API operations, concurrency, idempotency, error distinction | I03, I12, I14 |
| SEC-001…010, §21 | Tenancy, storage refs, permissions, scanning | I07, I09, I13, I47 |
| §23 workflow (lace on sleeve) | Reference workflow | I14, I18 (E2E in I20) |
| §24 workflow (photo interpretation) | Reference workflow | I26 |

**Acceptance criteria:** AC-01 → I12 · AC-02 → I13/I18 · AC-03 → I11/I18 · AC-04 → I18 · AC-05 → I18/I27 · AC-06 → I11/I26 · AC-07 → I35 (+ I12) · AC-08 → I12/I19 · AC-09 → I41 · AC-10 → I28 · AC-11 → I07/I13 · AC-12 → I11/I12.

## 3. SPEC-GDP-004 — `04-ai-prompt.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| OPR-AI-001…008, §7 | Operation contract | I14 (+ I25 AI ops) |
| STR-001…008, §8 | Strategy selection | I14 (skeleton), I23, I25 |
| CMP-001…012, §9 | Prompt compiler, templates, intermediate request | I23 |
| INP-001…008, §10 | Asset prep, reference roles, masks | I23, I27 |
| REG-001…010, §11 | Provider/model capability registry | I22 (+ I45 admin UI) |
| ADP-001…012, §12 | Adapter interface, fake adapter, contract tests | I22 |
| ROUTE-001…009, §13 | Routing & fallback policies | I23 (+ I33 BYOK routing) |
| JOB-001…012, §14 | Job management & states | I21 |
| RES-001…010, §15 | Normalization & outputs | I22, I25 |
| APP-001…010, §16 | Validation levels & application modes | I25 (+ I20 L3, I41 L4) |
| CON-001…007, §17 | Stale revision / conflicts / preservation | I25, I27 |
| CRED-001…012, §18 | Credentials & modes | I22 (platform), I33 (customer) |
| USG-001…010, §19 | Execution usage records | I24 (+ I34 reconciliation) |
| ERR-001…012, §20 | Error categories, retries, unknown outcomes | I21, I22 (+ I34) |
| EVT-001…007, §21 | Job events, outbox, idempotent consumers | I03, I21 |
| SEC-AI-001…012, §22 | Security & data governance for AI | I22, I23, I47 |
| OBS-001…008, §23 | Traceability & metrics | I21, I46 |
| PERF-001…010, §24 | Async, concurrency, backpressure, caching | I21, I23, I49 |
| §26 | Admin configuration | I22 (seed/config), I45 (UI) |
| §27 | Testing strategy (unit/contract/integration/evaluation) | I22, I23, I25, I49 |

**Workflows:** A → I14/I18 · B → I27 · C → I33 · D → I21/I34 · E → I25.
**Acceptance criteria:** AC-01 → I14 · AC-02 → I14 · AC-03 → I23 · AC-04 → I23 · AC-05 → I25 · AC-06 → I21/I25 · AC-07 → I21 · AC-08 → I22/I25 · AC-09 → I25 · AC-10 → I25 · AC-11 → I25 · AC-12 → I22/I33 · AC-13 → I24/I33 · AC-14 → I21/I34 · AC-15 → I24 · AC-16 → I25/I27 · AC-17 → I23 · AC-18 → I25/I46.

## 4. SPEC-GDP-005 — `05-ai-usage-metering.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| §4 principles, §5 boundaries | Separate metering/billing/payment | I24, I30 |
| TAX-001…007, §6 | Usage categories & units | I24 |
| USE-001…012, §7 | Usage event schema & ingestion | I24 |
| LED-001…012, §8 | Ledger, reservations, settlement | I24 (+ I34 abandoned reservations) |
| SUB-001…012, §9 | Plans, entitlements, subscription lifecycle | I24 (default plan), I30, I32 |
| ALL-001…012, §10 | Allowances, credits, overage | I24 (credits), I30 |
| PRICE-001…012, §11 | Pricing catalog & versioning | I31 (+ I45 publishing UI) |
| PRE-001…012, §12 | Preflight checks & reservations | I24 (+ I30 overage/budgets, I33 BYOK) |
| COST-001…009, §13 | Provider cost tracking | I24, I34 |
| CHG-001…012, §14 | Charge calculation | I31 (+ I33 BYOK fees) |
| OUT-001…010, §15 | Failed/cancelled/retried/partial outcomes | I24, I31, I34 |
| INV-001…010, §16 | Invoices & periods | I31 |
| PAY-001…010, §17 | Payments | I32 |
| BUD-001…010, §18 | Budgets & spending controls | I30 |
| REC-001…012, §19 | Reconciliation | I34 |
| ADJ-001…010, §20 | Refunds, credits, disputes | I31, I32 |
| UIB-001…010, §21 | Customer usage dashboard | I24 (basic), I30 |
| AUD-001…010, §22 | Financial audit & access | I24, I30–I32, I46 |

**Workflows:** A → I24 · B → I30/I31 · C → I33 · D → I24/I34 · E → I25/I31.
**Acceptance criteria:** AC-01 → I24 · AC-02 → I24 · AC-03 → I24 · AC-04 → I30 · AC-05 → I31 · AC-06 → I24/I33 · AC-07 → I33 · AC-08 → I24/I34 · AC-09 → I31 · AC-10 → I24/I31 · AC-11 → I30 · AC-12 → I31 · AC-13 → I32 · AC-14 → I30 · AC-15 → I30/I31/I45 · AC-16 → I34 · AC-17 → I31 · AC-18 → I32.

## 5. SPEC-GDP-006 — `06-project-lifecycle.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| §6 entities, §7 state models | Project/design/revision/approval/spec/tech-pack entities | I10, I12, I28, I38 |
| FR-PRJ-001…008 | Project creation, metadata, initial design, source provenance, duplicate | I10, I12, I26 (initial from source) |
| FR-PRJ-009…013 | Metadata history, access, collaborators, listing, search | I10 (+ I07 grants) |
| FR-PRJ-014…025 | Working copy, save/autosave, commit, integrity, concurrency | I12, I15, I19 |
| FR-PRJ-026…034 | Immutable revisions, lineage, history, comparison, restore/revert | I12, I19 |
| FR-PRJ-035…038 | Branch create/isolation/merge | **Backlog** (ADR-018) |
| FR-PRJ-039…040 | Revision retention, schema migration | I12 (+ I47 retention jobs) |
| FR-PRJ-041…048 | Operations & AI association, stale detection, no auto-approval | I14, I21, I25 |
| FR-PRJ-049…062 | Review & approval, SoD, revocation, notifications | I28, I29 |
| FR-PRJ-063…072 | Production readiness | I41 |
| FR-PRJ-073…082 | Tech-pack lifecycle & release | I42, I43 |
| FR-PRJ-083…092 | Hold, completion, archive, deletion | I10 (states), I47 (governed deletion) |
| FR-PRJ-093…100 | Audit, ordering, idempotent transitions, notifications | I03, I10, I29, I46 |
| §10 transactions | Revision commit / approval atomicity, outbox | I12, I28 |
| §14 commands & error codes | API contracts | I03 (error codes), I10, I12, I28, I41–I43 |
| §15 events | Domain events | I10, I12, I28, I41–I43 |
| §16 failure handling | Commit failure, races, duplicate callbacks | I12, I21, I28 |
| NFR-PRJ-001…020 | Performance, reliability, security, usability, maintainability | I10, I12, I19, I49 |

**Acceptance criteria:** AC-001 → I10 · AC-002 → I12/I15 · AC-003 → I12 · AC-004 → I12/I19 · AC-005 → I13/I12 · AC-006 → I28 · AC-007 → I25 · AC-008 → I12/I15 · AC-009 → I41 · AC-010 → I42 · AC-011 → I43 · AC-012 → I10 · AC-013 → I03/I10 · AC-014 → I28 · AC-015 → I28.

## 6. SPEC-GDP-007 — `07-editor.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| FR-EDT-001…008 | Workspace layout, save status, responsiveness | I15 |
| FR-EDT-009…017 | Viewport modes, zoom/pan/fit, fidelity | I16 (+ I35–I37 3D/split) |
| FR-EDT-018…027 | Hierarchy, selection, visibility, lock | I17 |
| FR-EDT-028…038 | Contextual properties, validation, provenance, bulk edit | I17 (+ I20) |
| FR-EDT-039…048 | Drawing, regions, annotations, masks | I27 |
| FR-EDT-049…059 | Asset/artifact browser, attachment, save-as-artifact | I09 (asset UI), I18 |
| FR-EDT-060…078 | AI-assisted interaction, candidates, stale protection | I25 (+ I26, I27) |
| FR-EDT-079…085 | Undo/redo, grouping, AI undo | I15 (+ I25) |
| FR-EDT-086…092 | Autosave, recovery, persistence feedback | I15 |
| FR-EDT-093…099 | Comparison & review interface | I19, I28 |
| FR-EDT-100…107 | Rendering integration, stale renders, caching | I16, I35 |
| FR-EDT-108…116 | 3D capability, navigation, synchronization | I36, I37 |
| FR-EDT-117…124 | Validation feedback | I20 (+ I41 readiness) |
| FR-EDT-125…133 | Keyboard, accessibility | I15–I17 (+ I49 audit) |
| FR-EDT-134…140 | Security & permissions in editor | I07, I15, I22 |
| §20 interaction state model | State categories | I15 (ADR-015) |
| §22 error handling | Error categories | I15, I25, I35 |
| §24 API & events | Logical editor API | I12, I14, I18, I21, I25 |
| NFR-EDT-001…014 | Performance, reliability, compatibility, observability | I15, I16, I49 |

**Acceptance criteria:** AC-EDT-001 → I17 · AC-EDT-002 → I17/I25 · AC-EDT-003 → I18 · AC-EDT-004 → I18 · AC-EDT-005 → I25 · AC-EDT-006 → I25 · AC-EDT-007 → I15 · AC-EDT-008 → I35 · AC-EDT-009 → I37 · AC-EDT-010 → I36 · AC-EDT-011 → I15 · AC-EDT-012 → I19 · AC-EDT-013 → I20/I41 · AC-EDT-014 → I07/I18/I28 · AC-EDT-015 → I15.

## 7. SPEC-GDP-008 — `08-tech-pack.md` (also `02-subsystem-breakdown.md`)

| Requirement group | Topic | Iterations |
|---|---|---|
| FR-TP-001…013, §7 | Spec lifecycle, binding, review, gates, release, supersession, withdrawal, reopening | I38 (lifecycle, binding), I43 (review/release/supersede/withdraw) |
| §8 data model | Spec entities & metadata | I38 |
| FR-TP-014…021, §9 | Style identity, design reference, divergence, impact | I38 (+ I43 impact) |
| FR-TP-022…029, §10 | Technical views & annotations | I40 (callouts), I42 (export quality) |
| FR-TP-030…041, §11 | BOM | I38 (+ I40 colorway BOM) |
| FR-TP-042…048, §12 | Material specification | I38 (material attrs), I40 (evidence) |
| FR-TP-049…060, §13 | Measurements & POMs | I39 |
| FR-TP-061…069, §14 | Size range & grading | I39 |
| FR-TP-070…075, §15 | Tolerances | I39 |
| FR-TP-076…085, §16 | Construction instructions | I40 |
| FR-TP-086…094, §17 | Colorways & artwork placement | I40 |
| FR-TP-095…101, §18 | Labels, packaging, compliance evidence | I40 |
| FR-TP-102…107, §19 | Quality requirements | I40 |
| FR-TP-108…118, §20 | AI-assisted drafting | I44 |
| FR-TP-119…127, §21 | Completeness & consistency validation | I41 |
| FR-TP-128…134, §22 | Templates & configurable rules | I38 (templates), I41 (rules), I45 (admin UI) |
| FR-TP-135…144, §23 | Review, approval, release, manifest, notifications | I43 (+ I29) |
| FR-TP-145…153, §24 | Versioning & change impact | I38, I43 |
| FR-TP-154…166, §25 | Export (PDF/XLSX/CSV/JSON), watermark, integrity | I42 |
| FR-TP-167…170, §26 | Distribution, secure links | I43 |
| FR-TP-171…173 | API integration, data mapping, failure | Partial: JSON package I42; external integrations **backlog** |
| FR-TP-174…175 | Supplier feedback & change control | I43 (comments) / **backlog** (structured supplier change workflow) |
| FR-TP-176…183, §27 | Permissions, isolation, audit, provenance, retention, sensitive data | I38–I43, I47 |
| NFR-TP-001…012 | Performance, reliability, interoperability, observability | I41, I42, I46, I49 |

**Acceptance criteria:** AC-TP-001 → I38 · AC-TP-002 → I38 · AC-TP-003 → I39 · AC-TP-004 → I39 · AC-TP-005 → I38/I44 · AC-TP-006 → I41 · AC-TP-007 → I44 · AC-TP-008 → I43 · AC-TP-009 → I43 · AC-TP-010 → I43 · AC-TP-011 → I42 · AC-TP-012 → I43 · AC-TP-013 → I43 · AC-TP-014 → I43.

## 8. SPEC-GDP-009 — `09-specification.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| FR-SEC-001…015 | Account identity, registration, verification | I05 |
| FR-SEC-016…027 | Passwords, recovery | I05 |
| FR-SEC-028…032 | Auth methods, federation | I05 (password/email), **backlog** (OIDC/SAML SSO); passkeys optional I08 |
| FR-SEC-033…040 | MFA & step-up | I08 |
| FR-SEC-041…045 | Login abuse protection, unusual-login notices | I05 (+ I29 notices) |
| FR-SEC-046…059 | Sessions, CSRF, timeouts, revocation, queued revalidation | I05 (sessions/CSRF), I08 (session mgmt), I21 (queued reauth) |
| FR-SEC-060…071 | Organizations, workspaces, membership | I06 |
| FR-SEC-072…078 | Invitations | I06 |
| FR-SEC-079…083 | Ownership continuity | I06 |
| FR-SEC-084…093 | Permission catalog, roles, delegation, effective permissions | I07 (custom roles → backlog) |
| FR-SEC-094…100 | Resource grants | I07 (model) + I43 (supplier grants) |
| FR-SEC-101…105 | Separation of duties | I07 (policy engine), I28 (design), I43 (release), I30/I33 (billing/credentials) |
| FR-SEC-106…113 | Project/design security | I07, I10, I12, I21, I28 |
| FR-SEC-114…119 | Artifact security | I13 |
| FR-SEC-120…125 | Tech-pack & document security | I42, I43 |
| FR-SEC-126…131 | Billing & usage data security | I24, I30 |
| FR-SEC-132…140 | AI provider credentials | I22, I33 |
| FR-SEC-141…145 | Org export & deletion | I47 |
| FR-SEC-146…153 | API tokens | I47 |
| FR-SEC-154…158 | Service identities, worker scopes | I21 (worker context), I47 |
| FR-SEC-159…163 | Webhooks & integrations | I32 (payment webhooks), I47 |
| FR-SEC-164…172 | Secret storage, transport | I22 (ADR-007), I48 (TLS) |
| FR-SEC-173…177 | Data classification, redaction, upload scanning | I02/I03 (redaction), I09, I47 (ClamAV) |
| FR-SEC-178…185 | Audit integrity, access, search, alerts | I03, I08, I46 |
| FR-SEC-186…197 | Platform operators, break-glass, admin separation | I45 |
| FR-SEC-198…209 | AI operation authorization, prompt injection | I21, I23, I25 |
| FR-SEC-210…215 | Provider boundary & data policies | I22, I23 |
| FR-SEC-216…225 | Tenant isolation & privacy | I07 (+ every iteration's tests), I47 |
| FR-SEC-226…232 | Security notifications | I29 |
| FR-SEC-233…238 | Data-model constraints | I05–I07 |
| FR-SEC-239…243 | Authorization decision contract | I07 |
| NFR-SEC-001…019 | Latency, revocation, recovery, maintainability, compliance | I07, I08, I46, I48 |
| TR-SEC-001…009 | Functional security tests | I05–I08, I47 |
| TR-SEC-010…020 | Security tests (escalation, isolation, replay, CSRF…) | I07 (harness), I47 (full suite) |
| TR-SEC-021…026 | Regression, pen test, backup restore | I07, I47, I48 |

**Acceptance criteria:** AC-SEC-001 → I06/I07 · AC-SEC-002 → I07 · AC-SEC-003 → I06/I07 · AC-SEC-004 → I07/I08 · AC-SEC-005 → I08 · AC-SEC-006 → I07/I28 · AC-SEC-007 → I07/I30/I33 · AC-SEC-008 → I22/I33 · AC-SEC-009 → I07 · AC-SEC-010 → I21 · AC-SEC-011 → I03/I08 · AC-SEC-012 → I43 · AC-SEC-013 → I07 · AC-SEC-014 → I28/I43 · AC-SEC-015 → I23/I25 · AC-SEC-016 → I07/I47.

## 9. SPEC-GDP-010 — `10-visualization.md`

| Requirement group | Topic | Iterations |
|---|---|---|
| FR-RV-001…010, §6 | Representation layers & independence | I12 (Representation), I16, I35 |
| FR-RV-011…020, §8 | Render requests, purposes, profiles | I35 |
| FR-RV-021…026, §9.1 | 2D editor rendering & selection | I16, I17 |
| FR-RV-027…032, §9.2 | Technical flats | I16, I35 |
| FR-RV-033…038, §9.3 | Vector representation, SVG sanitization | I09 (sanitize uploads), I16, I35 |
| FR-RV-039…043, §9.4 | Raster representation | I09, I35 |
| FR-RV-044…053, §10 | Component geometry, G0–G6 classes | I11, I16 (+ I36) |
| FR-RV-054…071, §11 | 3D scene, renderer, geometry creation | I36 |
| FR-RV-072…086, §12 | Materials, trims, color | I18 (2D trims/fabric), I37 (3D materials) |
| FR-RV-087…095, §13 | Cloth simulation boundary | I36 (labelling only); simulation **backlog** |
| FR-RV-096…108, §14 | 2D/3D synchronization, conflicts | I37 (S0–S2; S3/S4 backlog) |
| FR-RV-109…118, §15.1–15.2 | AI-assisted visualization & routing | I14, I25, I27 |
| FR-RV-119…123, §15.3 | Visual comparison & review | I19 |
| FR-RV-124…138, §16 | Render job lifecycle & manifests | I35 (client-side previews I16) |
| FR-RV-139…149, §17 | Render cache & asset storage | I35, I09 |
| FR-RV-150…160, §18 | Render validation | I35 |
| FR-RV-161…172, §19 | Export formats & consistency | I35, I36 (GLB), I42 (tech-pack illustrations) |
| FR-RV-173…186, §20 | UX: viewport, selection, comparison | I16, I17, I19, I36 |
| FR-RV-187…197, §21 | Security & privacy | I09, I35, I36, I47 |
| FR-RV-198…202, §25 | Data contracts | I35 (`packages/render-contracts`) |
| NFR-RV-001…018 | Performance, reliability, recovery | I16, I35, I49 |

**Acceptance criteria:** AC-RV-001 → I35 · AC-RV-002 → I16 · AC-RV-003 → I16/I26 · AC-RV-004 → I16/I36 · AC-RV-005 → I18/I35 · AC-RV-006 → I16/I37 · AC-RV-007 → I37 · AC-RV-008 → I25 · AC-RV-009 → I35 · AC-RV-010 → I35 · AC-RV-011 → I35 · AC-RV-012 → I35 · AC-RV-013 → I36 · AC-RV-014 → I35/I41 · AC-RV-015 → I42 · AC-RV-016 → I09/I36 · AC-RV-017 → I25 · AC-RV-018 → I25/I35 · AC-RV-019 → I35 · AC-RV-020 → I35/I49.

## 10. TECH-GDP-001 — `11-tech-stack.md`

| Section | Topic | Iterations |
|---|---|---|
| §2 principles | 12 mandatory principles | I01–I03 (+ all) |
| §3.1 frontend | Next.js, Tailwind, shadcn, TanStack, RHF, Zod | I01, I04 |
| §3.2 backend | NestJS, REST, OpenAPI, SSE | I01, I03, I21 |
| §3.3–3.4 database | Postgres, Prisma, JSONB, no MongoDB | I02, I03 |
| §3.5 Redis/BullMQ | Queues, durable job records, idempotency | I02, I03, I21 |
| §3.6 object storage | S3 abstraction, signed URLs, validation | I02, I09 |
| §3.7 2D | SVG + Konva | I16, I27 |
| §3.8 3D | R3F viewer | I36, I37 |
| §3.9 image processing | Sharp in workers | I09, I23, I35 |
| §3.10 testing | Vitest, Playwright, contract tests | I01, I03, I04 (+ all) |
| §3.11 observability | JSON logs, OpenTelemetry | I02, I46 |
| §4 monorepo | Layout, package rules | I01 (+ package creation per iteration) |
| §5 modules | 19 backend modules | across all phases (see `01-architecture.md` §2) |
| §6 canonical model & revisions | Immutable revisions, provenance | I11, I12 |
| §7 AI execution workflow | 16-step pipeline | I14, I21–I25 |
| §8 deployment | Compose, Caddy, internal network, backups | I02 (dev), I48 (prod) |
| §9 optimization & targets | Indexes, caching, editor perf, AI concurrency, perf targets | I21, I35, I49 |
| §10 security list | Cross-cutting security | I05–I08, I22, I47 |

## 11. Coverage gaps / deferred to backlog

Items intentionally **not** implemented in I01–I49 (see [`09-backlog.md`](09-backlog.md)):

| Requirement | Reason / status |
|---|---|
| FR-PRJ-035…038 branch creation, isolation, merge | Deferred (ADR-018; SPEC-006 OD-PRJ-003). Restore + lineage implemented instead. |
| Multi-user simultaneous co-editing (SPEC-003 Phase 4, SPEC-007 Phase 4, FR-EDT-085 advanced) | Deferred; optimistic single-writer concurrency only. |
| G5/G6 pattern-linked and production-validated geometry, S3/S4 sync (FR-RV-051, 103), 3D-L2…L4 | Deferred; viewer + component linking (S2) only. |
| Cloth simulation (FR-RV-087…095 beyond labelling, FR-EDT-115) | Deferred. |
| AI geometry generation / image→3D / image→vector reconstruction (strategy `geometry_generation`, FR-RV-043, 068–069) | Deferred; strategy registered as unsupported. |
| Enterprise SSO (OIDC/SAML), SCIM, conditional access, formal access reviews (FR-SEC-029, SPEC-009 Phase 3) | Deferred. |
| Custom roles (FR-SEC-092) | Deferred; predefined roles + catalog first (OD-SEC-005). |
| PLM/ERP/supplier-system integrations, external data mappings (FR-TP-171…173), pattern/grading software integration (FR-TP-069) | Deferred; versioned JSON export only. |
| Structured supplier change workflow (FR-TP-174…175 beyond comments) | Deferred. |
| Multi-currency, advanced pricing tiers, profitability reporting, anomaly detection (SPEC-005 Phase 3) | Deferred; single currency at launch (configurable field present). |
| Data residency / regional provider restrictions (SPEC-004 §30.11, OD-SEC-014) | Deferred; policy fields reserved. |
| Cross-organization artifact sharing / marketplace (SPEC-003 OD-6) | Deferred. |
| Market-specific compliance rule packs (FR-TP-101) | Configurable rules framework in I41; content packs deferred. |
| Legal hold, enterprise retention (SPEC-006 Phase 4) | Basic retention jobs in I47; legal hold deferred. |
| Advanced AI quality evaluation datasets (SPEC-004 §27.4) | Minimal evaluation harness in I25; full plan deferred (Testing & AI Quality Evaluation Plan doc missing). |
| Python processing service (TECH §3.9) | Only if a real requirement appears. |
