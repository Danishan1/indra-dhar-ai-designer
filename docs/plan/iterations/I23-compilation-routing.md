# I23 — Prompt & request compilation, routing

| Field | Value |
|---|---|
| Phase | 4 — AI execution & metering foundation |
| Subsystems | SS-07 Prompt & Request Compilation, SS-08 Orchestration (routing), SS-06 (strategy), SS-11 (asset prep) |
| Depends on | I22 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/04-ai-prompt.md` §6.1 (stages), §8 (strategy selection), §9 (compilation CMP-001…012, intermediate request §9.4, templates §9.5), §10 (asset prep INP-001…008), §13 (routing ROUTE-001…009, fallback §13.3), §22.2 (untrusted content), §23.2 (prompt logging); `docs/init/01-overview.md` FR-080…083; `docs/init/09-specification.md` §17.2–17.3 (FR-SEC-205…215) |
| Open decisions to resolve first | Prompt retention policy (default in 05-decisions §3: full request 30 days, redacted summary forever) |

## 1. Goal
Turn a validated AI-requiring design operation into an **auditable, provider-ready request** without users ever writing prompts: register AI task types, compile structured garment context into a provider-independent **intermediate request** using **versioned templates**, prepare authorized input assets with explicit roles (source, reference, artifact, mask), select an eligible model through **capability-filtered, policy-based routing**, and persist an immutable **compilation record**. Executed through I21 jobs with the I22 adapters.

## 2. Scope
### In scope
- Task registry (`ai-contracts`): task types `concept_generation` (text_to_image from structured state), `variation_generation`, `restyle_from_reference` (image_to_image), `targeted_region_edit` (targeted_image_edit, used in I27), `garment_interpretation` (image_interpretation/multimodal_reasoning, used in I26), `colorway_exploration`. Each declares required inputs, output modality, output schema, application mode default.
- Strategy selector extension (I14): AI strategies become eligible; selection considers available geometry, required output, preservation constraints, capability availability, cost/latency hints (STR-001…008); records rationale and whether result is an approximation (STR-008).
- Compiler (`compilation` module, runs in worker):
  1. resolve task definition; 2. load revision-pinned design state (base revision / working-copy version snapshot); 3. resolve target components & relationships; 4. **separate confirmed facts from inferred/proposed/missing** (CMP-004); 5. choose template version + output schema; 6. build intermediate request (SPEC-004 §9.4 shape); 7. apply model mapping profile; 8. prepare assets; 9. validate against capability profile (sizes, counts, formats) (CMP-006/007); 10. persist `CompilationRecord` (template/mapping/profile versions, CMP-011); 11. hand to adapter.
- Prompt templates: versioned rows (`PromptTemplate`) seeded from files `apps/worker/src/compilation/templates/<task>/<version>.hbs|.ts`; sections: objective, garment context, target region, required changes, preservation, references, output requirements, limitations, policy (§9.5). Template edits create new versions; history immutable (CMP-012).
- Garment-context serializer: maps structured properties to concise descriptive text and/or structured JSON per model mapping; never adds unsupported manufacturing facts (§9.5 last paragraph); excludes unrelated project data (§9.2, INP-007).
- Asset preparation (worker): authorize each asset for the operation (INP-001); resize/convert via Sharp to model constraints; reference roles explicit (INP-003); masks with mapping metadata to source (INP-005); derived copies recorded as assets with provenance (INP-004); temporary provider uploads with cleanup policy (INP-006).
- Untrusted content handling: text embedded in uploaded images/docs is never treated as instructions; system/policy sections are separated from user-provided references (§22.2, FR-SEC-206).
- Routing (`RoutingPolicy`): filter by task type, modalities, capabilities (masking, reference count), entitlement-allowed models (stub until I30: plan default list), credential availability, data-handling restrictions (`allow_external_processing`), availability; then rank by policy (preferred, quality tier, least cost, latency). Record decision (ROUTE-005). Fallback only to models satisfying mandatory requirements; material changes require policy/consent flag (ROUTE-006, ROUTE-009). No eligible model → actionable `NO_ELIGIBLE_MODEL` (ROUTE-008).
- Prompt logging: full intermediate/provider payload stored encrypted-at-rest with retention TTL (configurable, default 30 days); redacted summary kept permanently; access restricted to `platform.ai.inspect` (SEC-AI-010, §23.2).

### Out of scope (deferred to)
- Editor UI for generation (→ I25); interpretation review wizard (→ I26); mask drawing (→ I27)
- Org-level routing restrictions UI (→ I45); BYOK routing (→ I33)

## 3. Deliverables
- `packages/ai-contracts/src/{tasks.ts, intermediate-request.ts, routing.ts}`
- `apps/worker/src/compilation/{compiler.ts, context-serializer.ts, asset-prep.ts, templates/**}` and `apps/api/src/modules/compilation/{module, templates.service.ts, records.repository.ts}`
- `apps/api/src/modules/ai-providers/routing.service.ts`
- Prisma: `PromptTemplate`, `CompilationRecord`, `RoutingPolicy` + migration `…_i23_compilation`
- Golden tests: compiled intermediate requests for fixture designs (snapshot)

## 4. Data model changes
`PromptTemplate` (task_type, version, body, output_schema, status), `CompilationRecord` (immutable: operation_id, job_id, task_type, template_version, mapping_version, profile_version, routing_decision JSONB, intermediate_request_ref (encrypted blob/asset), redacted_summary JSONB, input_asset_refs with roles, expires_payload_at), `RoutingPolicy` (scope, rules, version).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{id}/operations` (AI types) | `design.generate` | Now accepts AI operation types; returns operation + job id (execution wired in I25 with preflight) |
| `GET /v1/operations/{id}/compilation` | `platform.ai.inspect` | Redacted compilation summary for support |
| `POST /v1/designs/{id}/operations/plan` | `design.generate` | Dry-run: chosen strategy, eligible models, approximation flags, estimated units (for I25 preflight display) |

## 6. UI
None (I25 consumes `plan` endpoint).

## 7. Implementation tasks (ordered checklist)
1. [ ] Task registry + intermediate request schema.
2. [ ] Extend strategy selector with AI strategies and approximation flags.
3. [ ] Context serializer with confirmed/uncertain separation; golden tests.
4. [ ] Template storage/versioning; initial templates per task.
5. [ ] Asset prep pipeline with authorization and roles; temp upload lifecycle.
6. [ ] Routing service with filter→rank→record; fallback rules.
7. [ ] Compilation record persistence with encrypted payload + TTL cleanup job.
8. [ ] Wire into `ai_generation` executor (I21) using fake adapter end-to-end.
9. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: routing never selects model lacking mask support for masked edits (SPEC-004 AC-03); fallback rejects downgrades (ROUTE-006); serializer excludes `missing` values and labels `inferred` ones as uncertain.
- Provider-independence: same operation compiles to intermediate request and maps to two different adapter mappings (fake + real) without changing operation schema (SPEC-004 AC-04).
- Integration: unauthorized asset reference rejected before submission (INP-001); `allow_external_processing=false` blocks external path (SPEC-004 AC-17); compilation record links operation, base revision, versions (CMP-008, CMP-011).
- Security: injected instruction text in an uploaded reference does not change policy sections (prompt-injection fixture).

## 9. Acceptance criteria
- [ ] AC1 — Compilation consumes only validated structured operations and produces a provider-independent intermediate request. (CMP-001, CMP-002, OPR-AI-001)
- [ ] AC2 — Confirmed vs inferred/proposed/missing values are preserved in compiled context. (CMP-004)
- [ ] AC3 — Templates/mappings/profiles are versioned and recorded per compilation; template edits don't rewrite history. (CMP-003, CMP-011, CMP-012)
- [ ] AC4 — Unsupported request features are detected before provider call. (CMP-006, CMP-007, STR-003, INP-008)
- [ ] AC5 — Routing filters by capability, credential, policy, availability; decision recorded; no eligible model → clear failure. (ROUTE-001…005, ROUTE-008, SPEC-004 AC-03)
- [ ] AC6 — Only authorized, operation-relevant assets are sent, with explicit roles. (INP-001, INP-003, INP-007, SEC-AI-002)
- [ ] AC7 — Users never see/edit raw prompts in ordinary workflows. (SRS FR-081, SPEC-004 AC-05)
- [ ] AC8 — No credentials in compiled prompts or logs. (CMP-010)

## 10. Risks & notes
- Prompt quality will need iteration; keep an evaluation fixture set (`tests/ai-eval/`) of representative garment tasks for later quality checks (SPEC-004 §27.4) — do not block on scores.
- Never claim exact preservation; templates must request preservation but strategy metadata states it is best-effort (CON-005).

## 11. Handoff
- I24 uses `plan` estimates to size reservations.
- I25 calls plan → preflight → submit; I26 uses `garment_interpretation`; I27 uses `targeted_region_edit` with masks.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
