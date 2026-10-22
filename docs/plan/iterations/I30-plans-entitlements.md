# I30 — Plans, subscriptions, entitlements & budgets

| Field                           | Value                                                                                                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 6 — Subscription, billing & BYOK                                                                                                                                                                                |
| Subsystems                      | SS-14 Subscription & Billing, SS-13 Usage Metering, SS-18 Administration (config), SS-04 Editor (feedback)                                                                                                      |
| Depends on                      | I24 (ledger, reservations, default plan + credits preflight)                                                                                                                                                    |
| Estimated sessions              | 2                                                                                                                                                                                                               |
| Spec references                 | `docs/init/05-ai-usage-metering.md` §4, §9 (SUB-001…012), §10 (ALL-001…012), §12 (PRE-001…012), §18 (BUD-001…010), §21 (UIB-001…010), AC-03/04/11/14/18; `docs/init/09-specification.md` §12.4 (FR-SEC-126…131) |
| Open decisions to resolve first | ADR-011 (commercial unit — confirm credits), rollover/overage defaults in `05-decisions.md` §3                                                                                                                  |

## 1. Goal

Replace the I24 "single default plan" with a real, versioned plan and entitlement model: plans with immutable versions, organization subscriptions with lifecycle states (no payment collection yet), feature/quantity/concurrency/model entitlements, overage policies, organization budgets, and a customer usage dashboard. All AI preflight checks now evaluate the org's effective plan version and budgets.

## 2. Scope

### In scope

- `Plan`, `PlanVersion` (immutable), `Subscription`, `BillingAccount`, `CreditConversionSchedule` (versioned), `Budget`.
- Entitlement types: feature, quantity allowance (credits and/or category), concurrency limit, rate limit, budget, storage, provider/model restriction, seat/project counts (§9.2).
- Subscription states: `trial`, `active`, `renewal_pending`, `past_due`, `suspended`, `cancelled`, `expired`, `pending_plan_change`; transitions via admin/manual commands now (payment-driven in I32).
- Plan change effective-time rules (immediate vs next period) — SUB-006; history never rewritten (SUB-012).
- Allowance periods & reset job (period rollover in worker); default: credits expire at period end.
- Overage policies: reject, require confirmation, PAYG within budget, grace allowance (§10.3) — evaluated in preflight.
- Budgets: org scope (project scope optional), hard limit, soft thresholds → metering emits threshold events (consumed by I29).
- Preflight upgrade: resolve effective plan version at effective time (SUB-010), concurrency limits, model restrictions, atomic reservation against budget + allowance (ADR-026).
- Customer usage dashboard: plan, allowance remaining, reserved vs actual, usage by project/category/model, budget status, failed-operation billing status.
- Seed plans: Trial, Starter, Pro (illustrative values in seed only).

### Out of scope (deferred to)

- Monetary pricing, charges, invoices (→ I31); payment collection (→ I32).
- Customer-owned key fees (→ I33).
- Admin UI for plan publishing (→ I45; seed + internal API now).

## 3. Deliverables

- `apps/api/src/modules/billing/{plans,subscriptions,entitlements,budgets}/`
- `apps/api/src/modules/metering/` updates (period projection, threshold events)
- `packages/contracts/src/billing.ts` (Plan/entitlement schemas)
- `apps/web/src/features/billing/usage-dashboard/*`, editor credit indicator update
- Seeds `prisma/seed/platform/plans.ts`; migration `…_i30_plans_entitlements`

## 4. Data model changes

- `plans`, `plan_versions` (price placeholders, interval, entitlements JSONB, overage_policy, effective_from; immutable trigger)
- `subscriptions` (organization_id, plan_version_id, status, period start/end, trial_ends_at, cancel_at, pending_plan_version_id, version)
- `billing_accounts` (organization_id, currency, billing_email)
- `credit_conversion_schedules` (version, mapping JSONB, effective_from)
- `budgets` (scope_type, scope_id, currency, period, hard_limit_minor, soft_thresholds[], policy JSONB)
- `allowance_balances` projection gains `period_id`; migration of I24 default plan to a seeded Trial plan version.

## 5. API / contracts

| Method & path                               | Permission                        | Purpose                                    |
| ------------------------------------------- | --------------------------------- | ------------------------------------------ |
| `GET /v1/billing/subscription`              | `billing.view`                    | Current plan, status, period, entitlements |
| `POST /v1/billing/subscription/change-plan` | `billing.manage` (+ step-up)      | Request plan change (effective rules)      |
| `POST /v1/billing/subscription/cancel`      | `billing.manage` (+ step-up)      | Cancel at period end                       |
| `GET /v1/billing/usage?period=&groupBy=`    | `billing.view`                    | Usage dashboard data                       |
| `GET /v1/billing/usage/records?cursor=`     | `billing.view`                    | Drill-down to usage events (UIB-008)       |
| `GET/PUT /v1/billing/budgets`               | `billing.view` / `billing.manage` | Budgets                                    |
| `GET /v1/plans`                             | authenticated                     | Public plan catalog (current versions)     |
| `POST /v1/operations/preflight` (extended)  | `design.generate`                 | Estimate, entitlement & overage decision   |

Events: `SubscriptionStatusChanged`, `PlanChanged`, `AllowanceThresholdReached`, `BudgetThresholdReached`, `AllowancePeriodRolled`.

## 6. UI

- Billing → Overview: plan card, period, allowance bar (actual vs reserved, correct unit), budget status, trial countdown.
- Billing → Usage: filters (project, category, provider/model, ownership mode), estimated vs final labels, drill-down table, CSV download.
- Editor generation dialog: shows credit estimate, remaining allowance, overage policy outcome (confirm if required) — FR-EDT-064.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-011 + rollover/overage defaults; record in decisions.
2. [ ] Schema, immutability triggers, seed plans & conversion schedule.
3. [ ] Entitlement evaluator (pure, versioned inputs, effective time).
4. [ ] Subscription state machine + period rollover job (worker cron via BullMQ repeatable).
5. [ ] Preflight upgrade: concurrency, model restriction, overage policy, budget; atomic reservation.
6. [ ] Threshold detection → events.
7. [ ] Usage dashboard API + UI; editor indicator.
8. [ ] Permission checks (`billing.view` vs `billing.manage` separated, FR-SEC-126).
9. [ ] Update PROGRESS.md.

## 8. Tests

- Unit: entitlement evaluator matrix; overage policy outcomes; plan-change effective times.
- Integration: concurrent reservations cannot exceed hard allowance/budget (AC-03, AC-11); exhausted allowance follows policy (AC-04); cancellation keeps history (AC-18); client-sent plan IDs ignored (FR-SEC-128); `billing.view` user cannot change budgets.
- E2E: dashboard shows reserved then settled usage after a fake-adapter generation.

## 9. Acceptance criteria

- [ ] AC1 — Each subscription references an explicit plan version; plan edits create new versions (SUB-002, SUB-012).
- [ ] AC2 — Preflight enforces feature, model, concurrency, allowance and budget rules atomically (PRE-001…006, AC-03, AC-11).
- [ ] AC3 — Exhausted allowance applies the plan's explicit overage policy and returns a clear reason/next step (ALL-004, PRE-007, AC-04).
- [ ] AC4 — Dashboard distinguishes actual vs reserved, estimated vs final, and shows correct units and currency (UIB-001…010, AC-14).
- [ ] AC5 — Cancelling/expiring a subscription preserves all usage history (SUB-009, AC-18).
- [ ] AC6 — Budget soft thresholds emit warnings; hard limits block (BUD-002…005).

## 10. Risks & notes

- Never trust client plan/entitlement data. Cached entitlements must not be the final authority (TECH §9.2).
- Keep evaluator pure for testability; I45 will add admin publishing UI.

## 11. Handoff

- I31 prices settled usage against plan versions; I32 drives subscription state from payments; I33 adds ownership-mode-specific entitlements/fees.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
