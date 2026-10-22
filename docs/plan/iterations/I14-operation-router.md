# I14 — Design operation router (deterministic)

| Field | Value |
|---|---|
| Phase | 3 — Structured 2D editor |
| Subsystems | SS-06 Design Operation & Execution Router, SS-03 Garment Design Model, SS-05 Artifact Registry |
| Depends on | I12, I13 |
| Estimated sessions | 2 |
| Spec references | `docs/init/04-ai-prompt.md` §4.1–4.3, §6, §7 (operation contract), §8 (strategy selection), §17 (stale/conflict); `docs/init/03-artifact-schema.md` §16 (operations & provenance), §10 (relationships), §15 (constraints), §23 (attach-lace workflow); `docs/init/06-project-lifecycle.md` §8.5 (FR-PRJ-041…048) |
| Open decisions to resolve first | none (ADR-003, ADR-018 already proposed) |

## 1. Goal
Every meaningful change to a garment design becomes a **typed, validated, recorded design operation** before it touches canonical state. This iteration builds the pure `packages/design-operations` library (operation definitions + deterministic appliers) and the backend `operations` module that validates operations against the working copy, selects an execution strategy (deterministic only for now; AI strategies are registered but return `UNSUPPORTED_CAPABILITY` until I25), applies them atomically with idempotency, and records `DesignOperation` provenance. The editor (I15+) will never mutate the working copy any other way.

## 2. Scope
### In scope
- `packages/design-operations` (pure TS, depends only on `garment-model`):
  - Operation type registry: `set_property`, `reset_property`, `set_property_status` (confirm/reject inferred values), `add_component`, `remove_component`, `set_component_visibility`, `set_component_lock`, `attach_artifact`, `replace_artifact`, `detach_artifact`, `update_placement`, `add_relationship`, `remove_relationship`, `rename_component`, `batch` (grouped ops for one undo step).
  - Zod schema per operation type (target entities, requested changes, preservation constraints, execution policy) — mirrors SPEC-004 §7.2 field list.
  - Deterministic applier per type: `apply(state, op, ctx) → { nextState, changedEntities, findings[] }` — pure, no I/O.
  - Inverse generation for undo (`invert(op, prevState) → op`) where possible; ops without an inverse declare `invertible: false`.
  - Strategy declaration per type: list of eligible strategies (`deterministic_model_update`, `rule_based_composition`, AI strategies flagged `requiresAi`).
- Backend `operations` module:
  - `POST /v1/designs/{designId}/operations` — submit one operation (or batch) with `expectedVersion` + `Idempotency-Key`.
  - Validation pipeline: schema → authorization (`design.edit`) → entity references exist in working copy → artifact revision exists and is accessible (via artifacts service) → compatibility constraints (artifact `compatible_target_types`, placement regions) → dependent-relationship checks for deletes (CMP-019).
  - Strategy selector skeleton (`StrategySelector`): evaluates deterministic first (STR-001), records chosen strategy + rationale (STR-005); if only AI strategies are eligible → `422 UNSUPPORTED_CAPABILITY` (STR-004) until I25.
  - Atomic apply: within one transaction — load working copy `FOR UPDATE`, check version, apply, persist new state with version+1, insert `DesignOperation` (status `completed`), outbox `WorkingCopyUpdated` + `DesignOperationCompleted`.
  - `GET /v1/designs/{designId}/operations` (history, paginated) and `GET /v1/operations/{operationId}`.
- Preservation constraints stored as structured data (recorded even though deterministic ops honour them trivially).

### Out of scope (deferred to)
- AI execution strategies, jobs (→ I21, I25)
- Editor UI and client command stack (→ I15)
- Rich validation rule engine / findings UI (→ I20; this iteration returns basic findings from appliers)
- Branch/merge (→ backlog, ADR-018)

## 3. Deliverables
- `packages/design-operations/src/{registry.ts, types/*.ts, appliers/*.ts, invert.ts, strategy.ts, index.ts}` + tests
- `apps/api/src/modules/operations/{operations.module.ts, operations.controller.ts, operations.service.ts, operations.repository.ts, strategy-selector.ts, operation-validator.ts}`
- Prisma model `DesignOperation` + migration `…_i14_design_operations`
- Contract schemas in `packages/contracts/src/operations.ts`
- `designs` module change: working copy mutations only via `OperationsService` (remove/guard any direct PATCH of `state` from I12, keep metadata-only patches)

## 4. Data model changes
- `DesignOperation` (see `03-domain-model.md`): `display_id (OPR-…)`, `operation_type`, `design_id`, `base_revision_id`, `base_working_copy_version`, `target_entities`, `requested_changes`, `preservation_constraints`, `source_refs`, `execution_policy`, `execution_strategy`, `strategy_rationale`, `status`, `result_working_copy_version`, `result_revision_id` (null until commit), `job_id` (null), `idempotency_key`, `requested_by`, `findings JSONB`.
- Index `(organization_id, design_id, created_at)`; unique `(organization_id, idempotency_key)`.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{designId}/operations` | `design.edit` | Submit operation/batch (expectedVersion, Idempotency-Key) |
| `GET /v1/designs/{designId}/operations` | `design.view` | Operation history |
| `GET /v1/operations/{operationId}` | `design.view` | Operation detail |
| `POST /v1/designs/{designId}/operations/validate` | `design.view` | Dry-run validation (no persistence) for editor previews |

Events emitted: `DesignOperationCompleted`, `DesignOperationRejected` (audit only), `WorkingCopyUpdated`.

Response of submit: `{ operation, workingCopy: { version, statePatch | state }, findings[] }` — return JSON patch of changed entities to keep payloads small.

## 6. UI
None (consumed by I15+). Provide a dev-only script `pnpm --filter api ops:demo` that applies a sequence of operations to a seeded design for manual verification.

## 7. Implementation tasks (ordered checklist)
1. [ ] Define operation base schema (`OperationEnvelope`) with SPEC-004 §7.2 fields; per-type `requestedChanges` schemas.
2. [ ] Implement appliers for each type against `GarmentDesignState`; ensure immutability (structural sharing, no mutation of input).
3. [ ] Implement `invert()`; property tests: `apply(apply(s, op), invert(op, s)) ≡ s` for invertible ops.
4. [ ] Implement compatibility checks using artifact revision `definition.compatible_target_types` + `preferred_placement_regions`; produce `requires_manual_review` when target geometry is absent (AC-05 of SPEC-003).
5. [ ] Implement strategy registry + selector; record rationale string.
6. [ ] Prisma model + migration; repository; display-id generation (ADR-001).
7. [ ] Service: transaction with `SELECT … FOR UPDATE`, version check → 409 `CONCURRENT_MODIFICATION`, idempotency via platform `IdempotencyKey` (same key + same payload → same response; different payload → `IDEMPOTENCY_CONFLICT`).
8. [ ] Controller + permissions + OpenAPI; tenant-isolation tests.
9. [ ] Refactor I12 working-copy update path to go through operations.
10. [ ] Update PROGRESS.md.

## 8. Tests
- Unit (design-operations): every applier; invalid targets rejected; delete component with dependent relationships returns blocking finding; attach artifact pins exact revision id; batch is all-or-nothing; inverse round-trips.
- Integration: concurrent submits with same `expectedVersion` → exactly one succeeds; idempotent retry returns same operation id; cross-tenant artifact reference → 404/422; operation record links base version and result version.
- Contract: OpenAPI snapshot updated.

## 9. Acceptance criteria
- [ ] AC1 — No code path mutates `WorkingCopy.state` except `OperationsService` (grep/test assertion). (OPR-AI-001, FR-002 of SRS)
- [ ] AC2 — Every committed operation records target, base working-copy version and resulting version. (OPR-001, OPR-004, FR-PRJ-041)
- [ ] AC3 — Operations are validated before modifying state; invalid ops leave state untouched. (OPR-002, OPR-007, OPR-AI-003)
- [ ] AC4 — Attaching a compatible lace artifact to a sleeve creates a queryable relationship with placement and the exact artifact revision. (SPEC-003 AC-04, ART-004)
- [ ] AC5 — Placement on a component without boundary geometry is recorded with status `needs_review`/approximate, never silently "validated". (SPEC-003 AC-05, REL-008)
- [ ] AC6 — Deterministic strategy is selected for all registered deterministic ops; rationale persisted. (STR-001, STR-005, SPEC-004 AC-02)
- [ ] AC7 — Retrying with the same idempotency key produces no duplicate change. (OPR-008)
- [ ] AC8 — Conflicting writes produce 409 with current version; nothing overwritten. (FR-PRJ-024, API-002)

## 10. Risks & notes
- Keep appliers pure and fast — the editor will also run them client-side for optimistic preview (I15); server result is authoritative.
- Do not let `rule_based_composition` grow into a geometry engine; geometry comes from garment-render (I16).
- Operation types are a public contract — version the registry (`operationSchemaVersion`).

## 11. Handoff
- I15 needs: client-importable `design-operations` (no Node-only deps), JSON-patch response format, `invert()` for undo.
- I21/I25 will add AI strategies to the registry and set `job_id`.
- Record the list of operation types in PROGRESS.md notes.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
