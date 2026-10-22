# I34 — Reconciliation & financial operations

| Field                           | Value                                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 6 — Subscription, billing & BYOK                                                                                                                                                                                                                                        |
| Subsystems                      | SS-13 Usage Metering, SS-14 Billing, SS-09 Generation Jobs, SS-17 Audit & Observability, SS-18 Administration                                                                                                                                                           |
| Depends on                      | I32 (payments), I33 (BYOK)                                                                                                                                                                                                                                              |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                       |
| Spec references                 | `docs/init/05-ai-usage-metering.md` §8.3 (LED-010), §13 (COST-_), §15 (OUT-_), §19 (REC-001…012), §20 (ADJ-*), §23.4 Workflow D, AC-01/08/16/17; `docs/init/04-ai-prompt.md` §20.3, §25.4 Workflow D (JOB-010, USG-010, OBS-007); `docs/init/11-tech-stack.md` §3.5, §7 |
| Open decisions to resolve first | Unknown-outcome escalation window (SPEC-005 §26.8; default 72 h then manual)                                                                                                                                                                                            |

## 1. Goal

Make the financial and execution records self-correcting and auditable: scheduled reconciliation jobs compare every pair of records described in SPEC-005 §19.1, resolve unknown provider outcomes, expire abandoned reservations, record discrepancies (never overwrite settled data), apply corrections as adjustments, and give operators a dashboard with alerts.

## 2. Scope

### In scope

The seven reconciliation domains (SPEC-005 §19.1), each a worker job with its own run record:

1. **Execution attempts ↔ usage events** — every completed/unknown attempt has usage or an explicit "no usage" record.
2. **Usage events ↔ provider-reported metrics** — via adapter `fetchUsage`/request-status APIs where available.
3. **Provider cost records ↔ provider invoices/exports** — CSV/JSON import of provider usage export (manual upload in admin UI if no API).
4. **Customer usage charges ↔ billing ledger entries** — every billable settled usage has exactly one charge.
5. **Billing ledger ↔ invoices** — every charge in a closed period is on exactly one invoice.
6. **Invoices ↔ payment processor records** — via `PaymentGateway.fetchPayment` / settlement reports.
7. **Reservations ↔ settled/released usage** — expire abandoned reservations (LED-010).

- Unknown-outcome resolver: polls provider status for `outcome_unknown` attempts, transitions jobs, settles or releases reservations idempotently; escalates after window.
- `ReconciliationRun`, `ReconciliationDiscrepancy` records with type, severity, refs, amount delta, status (`open|resolved|accepted|escalated`), resolution (adjustment ref).
- Corrections only via adjustments/superseding records (REC-003/004).
- Thresholds & alerts (REC-012) → operator notifications (I29) + metrics hook for I46.
- Operator dashboard (platform admin area): runs, open discrepancies, filters, resolve with reason; distinguish usage discrepancy vs customer billing dispute (REC-011).
- Customer dispute record type (ADJ `disputed`) workflow basics.

### Out of scope (deferred to)

- Profitability/anomaly analytics (→ backlog / I46 dashboards).
- Accounting system integration (→ backlog).

## 3. Deliverables

- `apps/worker/src/processors/reconciliation/*.processor.ts` (one per domain + unknown-outcome resolver + reservation sweeper), repeatable schedules
- `apps/api/src/modules/metering/reconciliation/` (service, admin controller, import endpoint)
- Adapter extensions: `fetchRequestStatus`, `fetchUsage` (optional per provider; capability-flagged)
- Web admin: Reconciliation dashboard, discrepancy detail, provider export upload
- Migration `…_i34_reconciliation`

## 4. Data model changes

- `reconciliation_runs` (domain, period/window, status, started/completed, counts, rule_version)
- `reconciliation_discrepancies` (run_id, domain, type e.g. `missing_usage`, `duplicate_provider_usage`, `quantity_mismatch`, `unmatched_payment`, `unreleased_reservation`, `charge_without_basis`, `ownership_mode_mismatch`; refs JSONB, delta, currency, severity, status, resolved_by, resolution_ref, reason)
- `provider_usage_imports` (provider, period, asset_id of uploaded file, parsed_count, status)
- `usage_ledger_entries` new entry types used: `adjust`, `release` (existing)

## 5. API / contracts

| Method & path                                                | Permission                              | Purpose                          |
| ------------------------------------------------------------ | --------------------------------------- | -------------------------------- |
| `GET /v1/admin/reconciliation/runs`                          | `platform.finance.view`                 | Runs                             |
| `GET /v1/admin/reconciliation/discrepancies?status=&domain=` | `platform.finance.view`                 | Discrepancies                    |
| `POST /v1/admin/reconciliation/discrepancies/{id}/resolve`   | `platform.finance.reconcile` (+ reason) | Resolve via adjustment or accept |
| `POST /v1/admin/reconciliation/provider-imports`             | `platform.finance.reconcile`            | Upload provider usage export     |
| `POST /v1/admin/reconciliation/runs`                         | `platform.finance.reconcile`            | Trigger run manually             |

Events: `ReconciliationDiscrepancyDetected`, `ReconciliationDiscrepancyResolved`, `ai.provider.outcome_resolved`.

## 6. UI

- Platform admin → Finance → Reconciliation: run history per domain, open discrepancies table (severity, amount delta, age), detail with linked records (job, attempt, usage, charge, invoice, payment), resolve dialog requiring reason.
- Customer dashboard: unresolved items show "under reconciliation" rather than final amounts (§21.2).

## 7. Implementation tasks (ordered checklist)

1. [ ] Schema + run framework (windowed, idempotent, resumable).
2. [ ] Domains 1, 4, 5, 7 (internal only) first.
3. [ ] Unknown-outcome resolver using adapter status APIs; escalation window.
4. [ ] Domains 2, 3 with adapter fetch + export import parser (fake provider fixtures).
5. [ ] Domain 6 with payment gateway fetch.
6. [ ] Resolution workflow → adjustments (I31) with audit.
7. [ ] Alerts & operator notifications; admin UI.
8. [ ] Update PROGRESS.md.

## 8. Tests

- Integration (fake adapter & fake gateway): timeout attempt later reported executed → usage recorded once, reservation settled (AC-08); confirmed no-execution → reservation released; duplicate provider records flagged; charge without usage flagged; unpaid invoice with provider-paid record flagged; abandoned reservation expired and released; reruns don't duplicate discrepancies; settled records never mutated (REC-003).
- Unit: matching rules per domain, tolerance handling.

## 9. Acceptance criteria

- [ ] AC1 — All seven reconciliation domains run on schedule and on demand, producing auditable run records (REC-001, REC-006, REC-007).
- [ ] AC2 — Unknown provider outcomes are resolved or escalated; never auto-assumed zero cost (OUT-007, USG-007, AC-08).
- [ ] AC3 — Discrepancies are recorded and corrected only via linked adjustments; settled data unchanged (REC-002…004).
- [ ] AC4 — Provider-reported usage can be matched to internal records where identifiers exist (AC-16).
- [ ] AC5 — Abandoned reservations are released per expiry policy (LED-010).
- [ ] AC6 — Discrepancies above thresholds alert operators (REC-012, OBS-007).
- [ ] AC7 — Every completed provider attempt is traceable to usage records (AC-01).

## 10. Risks & notes

- Provider APIs differ widely; capability-flag what each adapter supports and fall back to manual export import.
- Keep reconciliation reads paginated & windowed to avoid long transactions.

## 11. Handoff

- I46 exposes reconciliation metrics; I45 houses the admin navigation; M6 demo uses this dashboard.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
