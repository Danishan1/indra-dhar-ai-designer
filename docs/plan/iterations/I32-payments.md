# I32 — Payment integration & subscription lifecycle

| Field                           | Value                                                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 6 — Subscription, billing & BYOK                                                                                                                                                                    |
| Subsystems                      | SS-14 Subscription & Billing (payment integration), SS-16 Notification, SS-17 Audit                                                                                                                 |
| Depends on                      | I31                                                                                                                                                                                                 |
| Estimated sessions              | 2                                                                                                                                                                                                   |
| Spec references                 | `docs/init/05-ai-usage-metering.md` §9.3, §16.4 (INV-009), §17 (PAY-001…010), §20 (refunds), AC-13; `docs/init/09-specification.md` §13.3 (FR-SEC-159…163), §12.4; `docs/init/11-tech-stack.md` §10 |
| Open decisions to resolve first | **ADR-010 payment provider (Razorpay vs Stripe) — decide at the very start of this iteration**; tax handling approach for chosen provider                                                           |

## 1. Goal

Collect money safely: integrate one payment provider behind a `PaymentGateway` interface, support checkout / saved payment method via the provider's hosted flow, process signed webhooks idempotently, drive subscription states (active → past_due → grace → suspended) from payment outcomes, and handle refunds — without ever storing card data or trusting browser redirects.

## 2. Scope

### In scope

- ADR-010 decision (evaluate Razorpay vs Stripe for INR + subscriptions + GST invoices, webhook signing, refunds, test mode); record in `05-decisions.md`.
- `PaymentGateway` interface: `createCustomer`, `createCheckoutSession|createSubscriptionMandate`, `chargeInvoice`, `refund`, `verifyWebhook`, `fetchPayment` (for reconciliation), mapped status → platform `PaymentStatus` vocabulary.
- Provider adapter implementation + a `FakePaymentGateway` for tests.
- `PaymentAttempt`, `PaymentWebhookEvent` (unique provider event id) tables.
- Webhook endpoint: signature verification, replay protection, enqueue → idempotent processor (PAY-002, PAY-004, PAY-005).
- Subscription lifecycle driven by payments: renewal → invoice issued → charge → success (`active`) / failure (`past_due`) → grace period → `suspended` (entitlements restricted per policy, PAY-009, INV-009); recovery on later success.
- Refunds referencing original payment & invoice; distinction refund-to-method vs account credit (ADJ-008); duplicate refund prevention (ADJ-010).
- Billing account: billing email, tax identifiers (e.g. GSTIN) stored as data; payment method shown as provider-masked hint.

### Out of scope (deferred to)

- Automated reconciliation against provider exports (→ I34; `fetchPayment` used there).
- Multiple payment providers simultaneously (→ backlog).
- Dunning email sequences beyond basic notifications (→ backlog).

## 3. Deliverables

- `apps/api/src/modules/billing/payments/` (gateway interface, provider adapter, webhook controller, processor, lifecycle service)
- `packages/test-utils/fake-payment-gateway.ts`
- Web: Billing → Payment method, Pay invoice button, payment status on invoices, past-due banner
- Env: provider keys/webhook secret via secrets mechanism (`.env.example` placeholders)
- Migration `…_i32_payments`

## 4. Data model changes

- `payment_attempts` (invoice_id, provider, provider_payment_ref, amount_minor, currency, status, failure_code, created_at)
- `payment_webhook_events` (provider_event_id unique, type, payload_hash, received_at, processed_at, outcome)
- `refunds` (payment_attempt_id, invoice_id, amount_minor, reason, authorized_by, provider_refund_ref, status, idempotency_key unique)
- `billing_accounts` + `payment_customer_ref`, `payment_method_hint`
- `subscriptions` + `grace_ends_at`, `suspended_at`

## 5. API / contracts

| Method & path                           | Permission                                    | Purpose                                  |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `POST /v1/billing/checkout`             | `billing.manage` (+ step-up)                  | Start hosted checkout / mandate for plan |
| `POST /v1/billing/invoices/{id}/pay`    | `billing.manage`                              | Start payment for open invoice           |
| `GET /v1/billing/payment-method`        | `billing.view`                                | Masked method info                       |
| `POST /v1/webhooks/payments/{provider}` | `@Public()` + signature                       | Provider webhooks                        |
| `POST /v1/admin/billing/refunds`        | `platform.billing.refund` (+ step-up, reason) | Refund                                   |

Events: `PaymentSucceeded`, `PaymentFailed`, `SubscriptionStatusChanged`, `RefundIssued` (→ I29 notifications, audit).

## 6. UI

- Plan selection → checkout redirect → return page that **polls server state** (never trusts redirect, PAY-007).
- Invoice detail shows payment status; past-due/suspended banners with clear next steps.

## 7. Implementation tasks (ordered checklist)

1. [ ] Evaluate & decide ADR-010; document tax approach.
2. [ ] Define `PaymentGateway` + fake; contract tests shared by fake and real adapter.
3. [ ] Implement provider adapter (test mode only during development).
4. [ ] Webhook controller (raw body for signature), event table, queue processor.
5. [ ] Lifecycle service: renewal, grace, suspension, recovery; entitlement restriction hook into I30 evaluator.
6. [ ] Refund flow with idempotency.
7. [ ] Web flows; notifications wiring.
8. [ ] Update PROGRESS.md, decisions, `.env.example`.

## 8. Tests

- Contract: gateway behaviours (success, failure, requires_action, refund) for fake + recorded fixtures of real provider.
- Integration: duplicate webhook → single transaction (AC-13); invalid signature rejected & audited; redirect without webhook leaves invoice unpaid; failed renewal → past_due → suspended after grace; refund twice with same key → one refund.
- No real network calls in automated tests.

## 9. Acceptance criteria

- [ ] AC1 — Payment status is set only from verified webhooks or server-side fetch, never from browser redirect (PAY-004, PAY-007).
- [ ] AC2 — Duplicate payment notifications create no duplicate financial records (PAY-005, AC-13).
- [ ] AC3 — No card/payment authentication data stored; only provider references (PAY-010, AUD-003).
- [ ] AC4 — Failed payments drive subscription state through configured grace and suspension policy (PAY-009, INV-009).
- [ ] AC5 — Refunds reference original payment/invoice and cannot be processed twice (PAY-006, ADJ-010).
- [ ] AC6 — Payment and refund actions are audited with actor and reason.

## 10. Risks & notes

- Webhook endpoint needs the raw request body — configure Nest body parser for that route only.
- Keep provider SDK confined to the adapter; domain uses platform vocabulary.
- India: check RBI e-mandate rules for recurring card payments (affects Razorpay/Stripe subscription flows).

## 11. Handoff

- I34 reconciles payment records against provider data via `fetchPayment`/exports.
- I48 needs provider live keys and webhook URL configured in production secrets.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
