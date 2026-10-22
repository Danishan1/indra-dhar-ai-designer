# I31 — Pricing, charges & invoices

| Field | Value |
|---|---|
| Phase | 6 — Subscription, billing & BYOK |
| Subsystems | SS-14 Subscription & Billing, SS-13 Usage Metering, SS-17 Audit |
| Depends on | I30 |
| Estimated sessions | 2 |
| Spec references | `docs/init/05-ai-usage-metering.md` §4.1, §4.3, §11 (PRICE-001…012), §14 (CHG-001…012), §15 (OUT-001…010), §16 (INV-001…010), §20 (ADJ-001…010), §22 (AUD-001…010), AC-02/05/09/10/12/15/17 |
| Open decisions to resolve first | Pricing effective time (default: fixed at reservation) and failure/retry cost policy — `05-decisions.md` §3 |

## 1. Goal
Turn settled usage and subscriptions into explainable money: a versioned pricing catalog, a deterministic charge engine, billing periods with invoice preview and immutable issued invoices, and auditable credit notes/adjustments — without payment collection yet. Every amount must be reproducible from stored usage, pricing version, plan version and adjustments.

## 2. Scope
### In scope
- `PricingEntry` grouped into immutable pricing versions with effective times; customer-facing rates distinct from provider cost rates (PRICE-005).
- Charge engine pipeline per §14.1: resolve account → billable settled usage → pricing version → allowances → overage → discounts/credits → minimums/rounding → tax hook → charge record.
- Charge categories (§14.2): subscription fee, AI usage, overage, platform execution fee (stub for I33), storage, discount, promo credit, refund/credit adjustment, tax.
- Outcome policy table (§15.2) as configurable policy (platform-caused failures absorbed, retries absorbed by default).
- Billing period close job: late usage policy (next-period adjustment, INV-005).
- Invoices: draft preview, issue (numbering per org), immutable after issue (trigger), totals reproducible (INV-008).
- Credit notes / adjustments with reason, initiator, references (ADJ-*); goodwill credits; usage reversal.
- Tax: pluggable `TaxCalculator` interface with "no tax / flat configured rate" implementation; real GST/VAT logic decided with payment provider (I32).
- Money: integer minor units + currency; `Decimal` for unit rates; documented rounding (PRICE-006).

### Out of scope (deferred to)
- Payment collection and payment status (→ I32).
- Multi-currency conversion (→ backlog; single currency per billing account now, PRICE-007 noted).
- Accounting exports (→ backlog).

## 3. Deliverables
- `apps/api/src/modules/billing/{pricing,charges,invoices,adjustments}/`
- `packages/contracts/src/billing-invoices.ts`
- Worker: `billing-period-close.processor.ts`, `charge-settlement.processor.ts` (consumes `usage.settled` events)
- Web: Billing → Invoices list/detail, invoice preview, line explanation drawer
- Invoice PDF rendering via HTML→PDF (ADR-012) — simple template. This introduces the first minimal headless-Chromium PDF service in the worker; keep it generic (`pdf` service: HTML in → PDF asset out) because I35 generalizes it and I42 reuses it.
- Migration `…_i31_pricing_invoices`

## 4. Data model changes
- `pricing_versions` (version, effective_from/to, status `draft|published`, approved_by) + `pricing_entries` (category, unit, provider/model?, ownership_mode, currency, rate Decimal/method JSONB, minimum, rounding)
- `charges` (billing_account_id, category, basis_refs JSONB, pricing_version_id, plan_version_id, quantity, amount_minor, currency, status, idempotency_key unique)
- `invoices` (number, period, status `draft|issued|paid|void`, subtotal/tax/total minor, currency, issued_at, due_at) + `invoice_lines` (charge_id, description, quantity, unit_amount, amount_minor)
- `adjustments` / `credit_notes` (type, reason, original_ref, amount_minor, authorized_by, approved_by?)
- Triggers: issued invoices/lines immutable; charges immutable after invoiced.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/billing/invoices` | `billing.view` | List |
| `GET /v1/billing/invoices/{id}` | `billing.view` | Detail with line explanations |
| `GET /v1/billing/invoices/{id}/pdf` | `billing.view` | Download |
| `GET /v1/billing/invoices/preview` | `billing.view` | Current-period preview |
| `POST /v1/admin/billing/invoices/{id}/issue` | `platform.billing.manage` | Issue (normally automatic at period close) |
| `POST /v1/admin/billing/adjustments` | `platform.billing.adjust` (+ step-up, reason) | Credit/refund adjustment |
| `POST /v1/admin/pricing-versions` / `…/{id}/publish` | `platform.pricing.manage` | Create/publish pricing version |

Events: `usage.settled` (consumed), `ChargeCreated`, `InvoiceIssued`, `AdjustmentRecorded`.

## 6. UI
- Invoices list (status, period, total, currency); detail shows subscription vs usage lines, included usage summary (zero-charge allowance consumption visible, CHG-004), discounts, tax, and "why this amount" drawer linking to usage records.
- Preview banner "estimated, not final" (UIB-010).

## 7. Implementation tasks (ordered checklist)
1. [ ] Schema + immutability triggers + seed pricing version.
2. [ ] Pure charge calculator in a testable module (inputs → lines), golden-file tests.
3. [ ] Settlement consumer: idempotent charge creation per settled usage (CHG-010).
4. [ ] Outcome policy evaluation (§15) incl. retry absorption.
5. [ ] Period close job + invoice draft/issue + numbering.
6. [ ] Adjustments/credit notes flow with permission + audit.
7. [ ] Invoice PDF template; web pages.
8. [ ] Update PROGRESS.md and decisions (pricing effective time).

## 8. Tests
- Unit: rounding/minimums, tiered and pass-through+margin methods, allowance then overage, discount application, policy table cases.
- Integration: duplicate `usage.settled` → one charge (AC-02); invoice total = Σ lines (AC-12); pricing change after finalization doesn't alter historical charges (PRICE-009, AC-17); issued invoice cannot be updated; correction via credit note keeps original (AC-10); failed/cancelled operations follow policy (AC-09).
- Golden tests reproducing an invoice from stored inputs.

## 9. Acceptance criteria
- [ ] AC1 — Every charge references a pricing version or documented rule (PRICE-001, AC-05).
- [ ] AC2 — Re-processing settled usage never duplicates charges (CHG-010, AC-02).
- [ ] AC3 — Issued invoices are immutable; corrections are separate auditable records (INV-004, ADJ-002, AC-10).
- [ ] AC4 — Historical invoices can be recomputed from stored usage, pricing, plan, adjustments (CHG-002, AC-17).
- [ ] AC5 — Included usage is recorded with zero incremental charge and shown to the customer (CHG-004).
- [ ] AC6 — Pricing/adjustment administrative actions are permissioned and audited (PRICE-012, AC-15).

## 10. Risks & notes
- Floating-point is forbidden for money. Store rate precision explicitly.
- Keep provider cost (metering) and customer price (billing) in separate tables — never derive one by overwriting the other.

## 11. Handoff
- I32 attaches payment attempts to issued invoices; I33 adds customer-provided-credential fees; I34 reconciles charges ↔ invoices ↔ payments.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
