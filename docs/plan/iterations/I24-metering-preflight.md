# I24 — Usage metering & entitlement preflight

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 4 — AI execution & metering foundation                                                                                                                                                                                                                                                                                                                                                                                        |
| Subsystems                      | SS-13 Usage Metering, SS-14 Subscription & Billing (lite), SS-09, SS-08                                                                                                                                                                                                                                                                                                                                                       |
| Depends on                      | I21, I22                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Spec references                 | `docs/init/05-ai-usage-metering.md` §4 (principles), §5.2 (ownership), §6 (taxonomy TAX-001…007), §7 (usage event USE-001…012), §8 (ledger LED-001…012), §9.4 (SUB-003/004/010), §10 (allowances ALL-001…012), §12 (preflight PRE-001…012), §13 (provider cost COST-001…009), §15 (outcomes OUT-001…010), §23.1, §23.4, §24.3 (AC-01…09, AC-11); `docs/init/04-ai-prompt.md` §19 (USG-001…010); `docs/init/01-overview.md` §5 |
| Open decisions to resolve first | ADR-011 (credits — use recommended default), ADR-026 (ledger/locking)                                                                                                                                                                                                                                                                                                                                                         |

## 1. Goal

Before any AI call goes live in the editor, the platform must be able to **answer "what usage occurred" and "is this organization allowed to spend it"** reliably. This iteration builds idempotent usage-event ingestion, an append-only usage ledger with reservations/settlement/release/expiry, provider cost records, and a minimal entitlement model (default plan with monthly credit allowance + versioned credit conversion) with an **atomic preflight** that prevents concurrent oversubscription. Full plans, pricing, invoices and payments come in Phase 6.

## 2. Scope

### In scope

- Taxonomy: categories `ai_image_generation`, `ai_image_editing`, `image_interpretation`, `text_inference`, `rendering` (disabled), `export_generation` (disabled); units `operation`, `image`, `input_token`, `output_token`, `compute_second`, `credit` (versioned definitions) (TAX-001…004).
- `UsageEvent` ingestion (`metering` module): consumes job attempt usage from worker via outbox event `ai.usage.recorded`; idempotency key = `provider_id:provider_request_id:metric` or `attempt_id:metric`; duplicates ignored (USE-004/005, EVT-003); measurement source recorded; missing metrics = unavailable (USE-011).
- `UsageLedgerEntry` append-only (DB trigger blocks UPDATE/DELETE) with types `reserve`, `release`, `observe`, `settle`, `adjust`, `dispute`; corrections via `adjust` referencing originals (USE-003, LED-011).
- `UsageReservation` lifecycle `active → settled | released | expired`; expiry sweeper for abandoned reservations (LED-010); partial settlement and over-reservation handling (LED-007/008).
- `AllowanceBalance` projection per org + period (granted, reserved, consumed) — rebuildable from ledger (LED-012); rebuild command.
- `ProviderCostRecord` per attempt for platform-managed credentials: metrics, amount (Decimal) + currency, `cost_status` (`estimated` from profile cost metadata, or `provider_reported`), never zero for unknown (COST-001…005).
- Billing lite (SS-14 seed): `Plan` + `PlanVersion` with entitlements JSON (features: `ai.generate`, `ai.interpret`; allowance: N credits/month; concurrency limit; allowed models list; overage policy `reject`), `Subscription` row auto-created for each org on default plan (status `trial` or `active`), `CreditConversionSchedule` v1 mapping operation class → credits (e.g. basic generation 1, high quality 3, interpretation 1 — illustrative, configurable) (ALL-002, §10.2).
- Preflight service (called by operations before job creation, I25 wires UI):
  1. resolve subscription/plan version (SUB-010); 2. feature entitlement; 3. model/provider allowed; 4. ownership mode (platform only now; `customer_provided` path stubbed with separate accounting branch, BYOK in I33) (PRE-003, PRE-012); 5. estimate credits from `operations/plan` + conversion schedule; 6. **atomic reservation** using row lock on `allowance_balances` (ADR-026) checking `granted − consumed − reserved ≥ needed` and concurrency limit; 7. apply overage policy (reject with `QUOTA_EXCEEDED` + reason & next steps) (PRE-007); 8. return decision + reservation id; audit decision (PRE-011).
- Settlement hooks in job executor (I21 lifecycle): on success settle actual credits per policy; on known failure before provider submission release; on provider success + validation failure settle provider cost, customer credit per default policy (05-decisions §3: platform absorbs platform-caused failures/auto-retries); on `outcome_unknown` keep reservation `pending_reconciliation` (OUT-001…010, §15.2 table).
- Customer usage summary API (current period credits used/reserved/remaining, by category/project) — UI widget in I25, full dashboard I30.

### Out of scope (deferred to)

- Plan management UI, pricing catalog, PAYG, invoices, payments (→ I30–I32)
- BYOK credentials & UI (→ I33); reconciliation jobs & discrepancy dashboard (→ I34)

## 3. Deliverables

- `apps/api/src/modules/metering/{module, usage-ingestion.service.ts, ledger.service.ts, reservations.service.ts, balances.projection.ts, provider-costs.service.ts, repository.ts}`
- `apps/api/src/modules/billing/{module, plans.service.ts, subscriptions.service.ts, entitlements.service.ts, preflight.service.ts}` (lite)
- `apps/worker/src/maintenance/{reservation-expiry.ts, balance-rebuild.ts}`
- Prisma models + migration `…_i24_metering_billing_lite` incl. immutability triggers
- Seeds: default plan version, credit conversion schedule v1, usage categories/units

## 4. Data model changes

`UsageEvent`, `UsageLedgerEntry`, `UsageReservation`, `AllowanceBalance`, `ProviderCostRecord`, `Plan`, `PlanVersion`, `Subscription`, `CreditConversionSchedule`, `UsageCategory`/`UsageUnit` (versioned config). All tenant-scoped except catalogs.

## 5. API / contracts

| Method & path                                | Permission                | Purpose                                           |
| -------------------------------------------- | ------------------------- | ------------------------------------------------- |
| `POST /v1/designs/{id}/operations/preflight` | `design.generate`         | Entitlement + estimate + reservation (idempotent) |
| `GET /v1/usage/summary?period=current`       | `usage.view`              | Allowance used/reserved/remaining                 |
| `GET /v1/usage/events`                       | `usage.view`              | Paginated usage records                           |
| `POST /v1/admin/metering/rebuild-balances`   | `platform.billing.manage` | Projection rebuild                                |

Events consumed: `ai.usage.recorded`, `ai.job.completed|failed|cancelled|outcome_unknown`. Emitted: `usage.reserved`, `usage.settled`, `usage.released`, `quota.threshold_reached` (for I29).

## 6. UI

None beyond API (credit widget in I25).

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-011 default & ADR-026 locking; document credit consumption point (reserve at confirmation, settle at completion).
2. [ ] Schema + immutability triggers; seeds.
3. [ ] Usage ingestion with idempotency; provider cost record creation.
4. [ ] Reservation/settlement/release/adjust services; projection updates in same transaction.
5. [ ] Preflight with row-lock atomic check; concurrency-limit check; audit.
6. [ ] Executor lifecycle integration with outcome table.
7. [ ] Expiry sweeper + rebuild command.
8. [ ] Concurrency test harness (N parallel preflights vs limited balance).
9. [ ] Update PROGRESS.md and 05-decisions.md (ADR-011, ADR-026 → Accepted if used).

## 8. Tests

- Unit: credit estimation from conversion schedule; outcome → accounting action table.
- Integration: duplicate usage event ⇒ one logical record (AC-02); 50 concurrent preflights against balance for 10 ⇒ exactly 10 succeed (AC-03, AC-11); unknown outcome keeps exposure and is not zero (AC-08); failed-before-submit releases reservation; balance rebuild equals live projection; ledger UPDATE blocked by trigger.

## 9. Acceptance criteria

- [ ] AC1 — Every completed provider attempt is traceable to usage records with ownership mode. (SPEC-005 AC-01, USG-001, USG-004)
- [ ] AC2 — Reprocessing the same usage event creates no duplicate consumption. (SPEC-005 AC-02, USE-004/005)
- [ ] AC3 — Concurrent operations cannot exceed hard allowance through stale reads. (SPEC-005 AC-03, AC-11, ALL-003, PRE-005)
- [ ] AC4 — Exhausted allowance follows plan overage policy (reject) with clear reason. (SPEC-005 AC-04, PRE-006/007, ALL-005)
- [ ] AC5 — Reservations are never treated as charges; released/settled per outcome. (LED-009, PRE-008, OUT-001)
- [ ] AC6 — Unknown outcomes remain distinguishable from zero usage. (SPEC-005 AC-08, OUT-007, COST-005)
- [ ] AC7 — Provider cost is stored separately from customer credit consumption. (COST-001, §4.1)
- [ ] AC8 — Ledger is append-only; balances reconcilable from ledger. (USE-002, LED-012)
- [ ] AC9 — Preflight decision and entitlement state are audited; failed preflight prevents execution. (PRE-010, PRE-011)

## 10. Risks & notes

- Lock granularity: one balance row per org/period is a hotspot only at very high concurrency — acceptable initially; document upgrade path (sharded counters) in ADR-026.
- Keep billing-lite tables forward-compatible with I30 (plan versions immutable from day one).
- Do not show provider cost to customers (COST-009).

## 11. Handoff

- I25 calls preflight before job creation and displays estimate/remaining credits.
- I30 builds full plan management on `PlanVersion`/`Subscription`; I33 adds `customer_provided` path; I34 reconciles `pending_reconciliation`.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
