The next specification is `SPEC-GDP-005 — AI Usage Metering, Subscription, and Billing Specification`. It builds on `ARCH-GDP-002 v0.1` and `SPEC-GDP-004 v0.1`, defining how the platform measures AI consumption, enforces plan limits, calculates charges, and reconciles provider costs.

A key architectural rule is that usage measurement, customer billing, and payment collection are separate responsibilities. This is essential because the platform supports both platform-managed AI credentials and customer-provided API keys, as well as subscription and pay-as-you-go plans.

# AI Usage Metering, Subscription, and Billing Specification

**Document ID:** SPEC-GDP-005\
**Version:** 0.1\
**Status:** Initial Draft\
**Parent Documents:**

- `ARCH-GDP-002 v0.1` — Subsystem Requirements Breakdown and Dependency Specification
- `SPEC-GDP-004 v0.1` — AI Execution, Prompt Compilation, and Provider Integration Specification

**Product:** AI-Powered Garment Design and Development Platform

---

## 1. Purpose

This document defines the requirements and architecture for measuring platform usage, enforcing subscription entitlements, calculating customer charges, tracking AI provider costs, and collecting payments.

The platform must support users who generate, edit, interpret, and refine garment designs using multiple AI providers while maintaining transparent usage records and predictable commercial behavior.

This specification establishes:

- Usage event collection and normalization.
- AI provider consumption tracking.
- Platform-managed and customer-provided API credential accounting.
- Subscription plans and entitlements.
- Included usage allowances and overage policies.
- Pay-as-you-go consumption.
- Pricing catalogs and versioning.
- Pre-execution quota and spend checks.
- Usage reservations and settlement.
- Customer invoices and payment records.
- Failed, retried, cancelled, and ambiguous provider executions.
- Reconciliation, refunds, adjustments, and disputes.
- Organization-level budgets and spending controls.
- Auditability and financial reporting.

The system must remain extensible as new AI providers, models, execution types, pricing methods, and commercial plans are introduced.

## 2. Scope and non-goals

### 2.1 In scope

The system covers commercial accounting for:

- AI image generation.
- AI image editing.
- Image interpretation and structured extraction.
- Text and multimodal inference.
- Geometry-generation services where chargeable.
- Rendering and processing services where designated billable.
- Platform-specific features or credits.
- Subscription charges.
- Included monthly allowances.
- Pay-as-you-go usage.
- Overage charges.
- Optional platform execution fees for customer-owned API usage.
- Organization budgets and usage limits.

### 2.2 Out of scope

The following are handled by other subsystems or documents:

- Provider API execution: `SPEC-GDP-004`.
- User identity and access control: Security, Identity, and Organization Access Specification.
- Canonical garment design and revision history: `SPEC-GDP-003`.
- Payment processor implementation details: a payment integration design or implementation specification.
- Tax calculation rules: jurisdiction-specific financial and tax requirements.
- Accounting ledger integration: an optional future financial integration specification.

This document defines the interfaces between these areas.

## 3. Normative terminology

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** express requirement priority.

| Term                       | Definition                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Usage Event                | An immutable record describing a measurable action or resource consumption                                           |
| Provider Cost              | The cost incurred by the platform from an AI provider                                                                |
| Billable Usage             | Usage eligible for charging under a customer’s commercial agreement                                                  |
| Entitlement                | A permission, allowance, quota, or feature access granted by a plan                                                  |
| Allowance                  | Usage included in a subscription or other commercial arrangement                                                     |
| Overage                    | Eligible usage exceeding an included allowance                                                                       |
| Usage Reservation          | A provisional allocation of quota or budget before execution                                                         |
| Settlement                 | Finalization of provisional usage after execution outcomes and usage data are known                                  |
| Pricing Version            | An immutable version of rates and rules used to calculate a charge                                                   |
| Invoice Line               | An itemized charge or credit associated with a billing period or transaction                                         |
| Customer-Owned API Usage   | Provider usage executed using credentials supplied by the customer                                                   |
| Platform-Managed API Usage | Provider usage executed using platform-controlled credentials                                                        |
| Reconciliation             | Comparison of internal usage and financial records with provider or payment processor records                        |
| Idempotency                | A mechanism that prevents repeated processing of the same logical request from creating duplicate accounting effects |

---

## 4. Core commercial principles

### 4.1 Separate metering from billing

The system MUST distinguish four separate concepts:

1. **Execution usage:** What happened during an operation.
2. **Provider cost:** What the AI provider charged or is estimated to have charged the platform.
3. **Customer charge:** What the platform is entitled to charge the customer.
4. **Payment status:** Whether the customer has paid the resulting amount.

These values MUST NOT be treated as interchangeable.

For example, a provider may charge the platform $0.08 for an operation, while the customer consumes an allowance, is charged $0.12 under pay-as-you-go pricing, or incurs no additional charge because the operation is covered by a plan.

### 4.2 Separate credential ownership modes

Usage executed with platform-managed credentials and usage executed with customer-provided credentials MUST be distinguishable in all relevant records.

Customer-owned provider costs MUST NOT be counted as platform-managed provider expenses merely because the platform initiated the request.

A platform subscription fee or execution fee for customer-owned usage MAY still apply if explicitly defined by the commercial plan.

### 4.3 Immutable commercial history

Once a usage event or financial transaction has been finalized, it MUST NOT be silently rewritten.

Corrections MUST be represented through adjustments, reversals, or superseding records with explicit references to the original entries.

### 4.4 Transparent pricing

The platform MUST identify the pricing rules applicable to an operation before execution when a reliable estimate is available.

When the exact charge depends on provider-reported usage, the platform MUST disclose that the displayed amount is an estimate.

### 4.5 No unapproved spend

The platform MUST enforce applicable quotas, budgets, and spending permissions before initiating billable platform-managed work.

If a cost cannot be estimated reliably, the system MUST follow a configured risk policy, such as rejecting the request, requiring confirmation, or applying a bounded reserve.

---

## 5. Architecture and subsystem responsibilities

The architecture builds on the subsystem boundaries established in `ARCH-GDP-002`.

| Subsystem                           | Responsibility                                                             |
| ----------------------------------- | -------------------------------------------------------------------------- |
| SS-08 AI Provider and Orchestration | Provides provider and credential ownership metadata                        |
| SS-09 Generation Job Management     | Provides job, attempt, and execution lifecycle events                      |
| SS-13 Usage Metering                | Records measurable usage, reservations, settlement, and reconciliation     |
| SS-14 Subscription and Billing      | Manages plans, entitlements, pricing, invoices, and customer charges       |
| SS-18 Platform Administration       | Configures plans, rates, provider pricing, limits, and commercial policies |
| SS-01 Identity and Access           | Provides user, organization, and permission context                        |
| SS-02 Project Lifecycle             | Provides project-level attribution where required                          |
| SS-17 Audit and Observability       | Records operational and financial audit events                             |
| Payment Integration                 | Collects payments and returns payment status events                        |

Usage Metering and Subscription/Billing MAY be implemented as modules within a modular monolith initially. Their logical responsibilities and data ownership MUST remain separate.

### 5.1 High-level architecture

```
flowchart TD
    A[Design Operation] --> B[Entitlement and Budget Check]
    B --> C[Usage Reservation]
    C --> D[AI Job Execution]
    D --> E[Provider Usage Metadata]
    D --> F[Execution Usage Events]
    E --> G[Usage Normalization]
    F --> G
    G --> H[Usage Ledger]
    H --> I[Settlement and Reconciliation]
    I --> J[Pricing Engine]
    J --> K[Customer Billing Ledger]
    K --> L[Invoice Generation]
    L --> M[Payment Processor]
    M --> N[Payment Status]
    I --> O[Provider Cost Reporting]
    K --> P[Customer Usage Dashboard]
```

### 5.2 Ownership boundaries

- Usage Metering owns normalized usage records and usage settlement status.
- Subscription and Billing owns customer commercial entitlements, charge calculations, invoice records, and billing account state.
- Provider orchestration owns provider execution facts and provider-reported usage metadata.
- Payment integration owns communication with the payment processor and payment outcome records.
- No editor component may directly modify usage balances or create authoritative customer charges.

---

## 6. Usage taxonomy

### 6.1 Usage categories

The system SHOULD support configurable categories including:

| Category               | Example measurement                                                      |
| ---------------------- | ------------------------------------------------------------------------ |
| AI image generation    | Provider-reported image count, operation units, or configured task units |
| AI image editing       | Edit request, image count, or provider-specific units                    |
| Text inference         | Input and output tokens                                                  |
| Image interpretation   | Images processed or provider-reported multimodal units                   |
| Geometry generation    | Geometry-generation job or provider-specific units                       |
| Rendering              | Render jobs, compute time, or configured render units                    |
| Asset processing       | File processing volume or compute units                                  |
| Storage                | Stored data volume over time                                             |
| Export generation      | Export jobs or configured export units                                   |
| Platform feature usage | Named feature credits or plan-specific units                             |

The initial product need not bill every category. The system MUST permit categories to be enabled, disabled, or included in plans through configuration.

### 6.2 Canonical usage unit

The platform SHOULD define a small set of normalized internal usage units, such as:

- `operation`
- `image`
- `input_token`
- `output_token`
- `compute_second`
- `storage_byte_hour`
- `credit`

Provider-specific raw metrics MUST be retained separately from normalized internal units.

A normalized unit MUST have an explicit definition. The system MUST NOT assume that one image, one generation request, or one provider token has an identical cost across providers.

### 6.3 Usage taxonomy requirements

- `TAX-001`: Every usage event MUST identify a registered usage category.
- `TAX-002`: Every measured quantity MUST identify its unit.
- `TAX-003`: Provider-native usage metrics MUST be preserved where available.
- `TAX-004`: Usage categories and unit definitions MUST be versioned.
- `TAX-005`: The system MUST distinguish execution count from provider-reported resource consumption.
- `TAX-006`: A platform credit MUST have a documented conversion and consumption policy.
- `TAX-007`: Usage categories MUST support plan-specific inclusion, exclusion, and charging rules.

---

## 7. Usage event schema

### 7.1 Required fields

Each normalized usage event MUST contain:

| Field                       | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `usage_event_id`            | Globally unique event identifier                              |
| `idempotency_key`           | Identity used to prevent duplicate processing                 |
| `organization_id`           | Organization to which usage is attributed                     |
| `actor_id`                  | User or authorized system actor, when applicable              |
| `project_id`                | Associated project, when applicable                           |
| `operation_id`              | Source design operation                                       |
| `job_id`                    | Source execution job, when applicable                         |
| `attempt_id`                | Provider attempt, when applicable                             |
| `usage_category`            | Registered category                                           |
| `quantity`                  | Measured amount                                               |
| `unit`                      | Measurement unit                                              |
| `credential_ownership_mode` | Platform-managed, customer-provided, or not applicable        |
| `provider_id`               | Provider, when applicable                                     |
| `model_id`                  | Model, when applicable                                        |
| `measurement_source`        | Provider-reported, internally measured, estimated, or derived |
| `occurred_at`               | Time of the underlying activity                               |
| `recorded_at`               | Time the platform recorded the event                          |
| `schema_version`            | Event schema version                                          |

The event MAY additionally include raw provider metrics, provider request identifiers, confidence status, price references, and reconciliation references.

### 7.2 Illustrative usage event

```
{
  "usage_event_id": "USE-000231",
  "idempotency_key": "PROV-001:REQ-987:image-output",
  "organization_id": "ORG-0007",
  "actor_id": "USR-001",
  "project_id": "PRJ-0004",
  "operation_id": "OPR-000654",
  "job_id": "JOB-000987",
  "attempt_id": "ATT-000001",
  "usage_category": "ai_image_generation",
  "quantity": 1,
  "unit": "image",
  "credential_ownership_mode": "platform_managed",
  "provider_id": "PROV-001",
  "model_id": "MODEL-IMAGE-003",
  "measurement_source": "provider_reported",
  "occurred_at": "2026-10-21T12:40:00Z",
  "recorded_at": "2026-10-21T12:40:08Z",
  "schema_version": 1
}
```

All identifiers and values are illustrative.

### 7.3 Event requirements

- `USE-001`: Usage events MUST be attributable to a defined source or measurement process.
- `USE-002`: Usage events MUST be immutable after acceptance into the authoritative ledger.
- `USE-003`: Corrections MUST create adjustment or superseding records.
- `USE-004`: Event ingestion MUST be idempotent.
- `USE-005`: Duplicate delivery MUST NOT create duplicate logical usage.
- `USE-006`: The system MUST support delayed provider usage reports.
- `USE-007`: Usage events MUST distinguish measured, estimated, and derived quantities.
- `USE-008`: Events MUST retain source identifiers sufficient for reconciliation.
- `USE-009`: Tenant and organization attribution MUST be validated before recording usage.
- `USE-010`: Event schemas MUST be versioned.
- `USE-011`: Missing provider metrics MUST be represented as unknown or unavailable, not as zero.
- `USE-012`: The system MUST support usage records that are operationally valid but not customer-billable.

---

## 8. Usage ledger and settlement

### 8.1 Ledger principles

The usage ledger is the authoritative record of measured consumption and its settlement status.

It MUST distinguish provisional reservations, observed usage, settled usage, reversed usage, and unresolved usage.

The ledger MUST NOT use a mutable monthly counter as its only source of truth.

Aggregated balances and dashboard counters MAY be maintained for performance, provided they can be reconciled against authoritative records.

### 8.2 Usage lifecycle

The system SHOULD support the following lifecycle:

1. `reserved` — Capacity, quota, or budget has been provisionally allocated.
2. `observed` — Execution occurred and an initial usage record is available.
3. `pending_reconciliation` — Final usage or provider cost is not yet confirmed.
4. `settled` — Applicable usage quantity and commercial treatment are finalized.
5. `adjusted` — A later correction or adjustment has been recorded.
6. `released` — An unused reservation has been returned.
7. `disputed` — The usage or charge is under review.

The implementation MAY represent these states using separate ledger entries instead of a single mutable status field.

### 8.3 Reservation and settlement requirements

- `LED-001`: The system MUST support provisional usage reservations before execution.
- `LED-002`: Reservations MUST have unique identifiers and explicit ownership.
- `LED-003`: Reservations MUST be associated with the operation or job they protect.
- `LED-004`: Reservations MUST be released or settled according to execution outcomes.
- `LED-005`: Final usage MUST be reconciled against provisional reservations.
- `LED-006`: Usage settlement MUST be idempotent.
- `LED-007`: The system MUST support partial settlement when execution consumes fewer resources than reserved.
- `LED-008`: The system MUST support additional settlement or an explicit over-budget outcome when actual consumption exceeds the reservation.
- `LED-009`: A reservation MUST NOT be treated as a finalized customer charge.
- `LED-010`: The system MUST recover abandoned reservations according to a defined expiration and reconciliation policy.
- `LED-011`: Settled records MUST remain auditable after adjustments.
- `LED-012`: Usage balances MUST be reconcilable against the underlying ledger.

---

## 9. Subscription plans and entitlements

### 9.1 Plan model

The platform SHOULD support multiple configurable plans rather than hardcoding commercial behavior into the editor or AI execution engine.

A plan MAY define:

- Monthly or annual subscription price.
- Included AI credits or category-specific allowances.
- Included projects and storage.
- Feature access.
- Maximum team size.
- Concurrent generation limits.
- Maximum output quality or resolution.
- Allowed providers or models.
- Pay-as-you-go access.
- Overage policy.
- Organization budgets.
- Usage reporting features.
- Support level.
- Trial duration and trial allowances.

The initial product MAY launch with a small number of plans, provided the entitlement model is extensible.

### 9.2 Entitlement types

The system SHOULD support:

- Feature entitlement: permission to use a capability.
- Quantity allowance: amount of usage included in a period.
- Concurrency limit: maximum simultaneous jobs.
- Rate limit: maximum permitted request rate.
- Budget limit: maximum permitted spend.
- Storage allowance: included storage usage.
- Provider/model restriction: allowed execution choices.
- Project or seat allowance: count-based resource limits.

### 9.3 Subscription lifecycle

The subscription subsystem SHOULD support:

- Trial.
- Active.
- Renewal pending.
- Past due.
- Suspended.
- Cancelled.
- Expired.
- Pending plan change.

Exact state transitions MUST be defined by the commercial and payment integration policies.

### 9.4 Entitlement requirements

- `SUB-001`: Plans MUST be configurable through administrative mechanisms.
- `SUB-002`: Each subscription MUST reference an explicit plan version.
- `SUB-003`: Entitlements MUST be evaluated before restricted operations begin.
- `SUB-004`: The system MUST distinguish feature access from usage allowances.
- `SUB-005`: Subscription status changes MUST be auditable.
- `SUB-006`: Plan changes MUST define when new entitlements take effect.
- `SUB-007`: The system MUST support trial plans and trial restrictions where offered.
- `SUB-008`: Organization subscriptions MUST define how usage from individual members is aggregated.
- `SUB-009`: The system MUST support subscription expiration and cancellation without deleting historical usage.
- `SUB-010`: Entitlement evaluation MUST use the applicable effective time and plan version.
- `SUB-011`: The system MUST prevent unauthorized plan changes.
- `SUB-012`: A plan change MUST NOT silently rewrite historical charges or usage records.

---

## 10. Allowances, credits, and overages

### 10.1 Allowance models

The platform MAY use one or more allowance models:

**Credit-based allowance**

A subscription includes a quantity of platform-defined credits. Different operations consume different credit quantities according to published conversion rules.

**Category-specific allowance**

A plan includes a specific quantity of a category, such as image generations or AI editing operations.

**Resource-specific allowance**

A plan includes storage, seats, projects, or other non-AI resources.

**Hybrid allowance**

A plan combines credits, category-specific limits, and resource limits.

The chosen model MUST be understandable to customers and consistently applied by the billing engine.

### 10.2 Credit conversion

If credits are used, the system MUST maintain a versioned conversion schedule.

For example, a plan could define illustrative credit consumption such as:

- Basic image generation: 1 credit.
- High-quality image generation: 3 credits.
- Multistage image-editing workflow: 2–5 credits depending on its declared execution class.

These values are examples only and MUST NOT be treated as final commercial prices.

The platform MUST define whether credits are consumed at reservation, execution, or settlement and how unused reservations are returned.

### 10.3 Overage policies

Supported policies SHOULD include:

- Reject usage after allowance exhaustion.
- Require explicit customer approval before exceeding allowance.
- Permit overage charges within a configured budget.
- Switch to a disclosed pay-as-you-go rate.
- Allow administrator-authorized organization overage.
- Permit a limited grace allowance.

The platform MUST NOT assume that overages are enabled for every plan.

### 10.4 Allowance requirements

- `ALL-001`: Allowances MUST have defined scope and reset periods.
- `ALL-002`: Credit conversion rules MUST be versioned.
- `ALL-003`: The system MUST prevent concurrent operations from independently consuming the same remaining allowance.
- `ALL-004`: Overage policy MUST be explicit for each applicable plan and category.
- `ALL-005`: The system MUST distinguish exhausted allowance from an unavailable provider or failed operation.
- `ALL-006`: Unused reservation amounts MUST be released according to settlement policy.
- `ALL-007`: Credits MUST NOT be consumed twice because of duplicate event delivery.
- `ALL-008`: Expiration and rollover behavior MUST be documented.
- `ALL-009`: The customer interface MUST display allowance consumption and remaining balance using the correct unit.
- `ALL-010`: The system MUST retain historical allowance transactions.
- `ALL-011`: The system MUST define how credits are handled during refunds and disputed operations.
- `ALL-012`: If a workflow consists of multiple provider calls, the billing policy MUST define whether it is charged per call, per completed workflow, or according to another disclosed measure.

---

## 11. Pricing catalog and versioning

### 11.1 Pricing dimensions

The platform SHOULD distinguish at least three pricing layers:

1. Provider cost rates.
2. Platform customer-facing rates.
3. Subscription and plan pricing.

Provider cost rates describe expected or reported platform expenses. Customer-facing rates define the amount chargeable to customers. Subscription pricing defines recurring access and included benefits.

These layers MUST NOT be conflated.

### 11.2 Pricing catalog

A pricing entry SHOULD contain:

- Pricing entry identifier.
- Provider and model, if applicable.
- Usage category and unit.
- Currency.
- Rate or calculation method.
- Effective start and end times.
- Applicable customer plan or segment.
- Credential ownership mode.
- Minimum charge or rounding policy.
- Tax treatment reference, where applicable.
- Pricing version.
- Administrative approval and audit metadata.

Pricing MAY be defined by fixed unit rate, tiered rate, provider pass-through plus margin, credit conversion, or a combination.

### 11.3 Versioning rules

Pricing versions MUST be immutable once used in a finalized charge.

New prices MUST create new versions with explicit effective times.

The system MUST define whether a job uses pricing determined at reservation time, execution time, or settlement time. The selected rule MUST be consistent with customer terms and disclosed billing policy.

For predictable customer billing, the platform SHOULD preserve the pricing terms shown at operation confirmation when feasible. If actual provider cost is unknown until later, provider-cost reconciliation MUST remain separate from the customer-facing price rule.

### 11.4 Pricing requirements

- `PRICE-001`: Every calculated customer charge MUST reference a pricing version or documented contractual rule.
- `PRICE-002`: Pricing entries MUST define their currency and billing unit.
- `PRICE-003`: Pricing changes MUST be versioned and auditable.
- `PRICE-004`: Historical invoices MUST remain reproducible from their recorded pricing inputs.
- `PRICE-005`: Provider cost and customer price MUST be separately represented.
- `PRICE-006`: The platform MUST define rounding and minimum-charge rules.
- `PRICE-007`: The system MUST support multiple currencies where the commercial product requires them.
- `PRICE-008`: Currency conversion, where used, MUST record the rate source and effective time.
- `PRICE-009`: Pricing changes MUST NOT silently alter charges already finalized under an earlier pricing version.
- `PRICE-010`: The platform MUST support separate pricing policies for platform-managed and customer-provided credential usage.
- `PRICE-011`: Discounts, promotional credits, and negotiated pricing MUST be auditable.
- `PRICE-012`: Administrative pricing changes MUST be permission-controlled.

---

## 12. Pre-execution entitlement, quota, and budget checks

### 12.1 Purpose

Before a potentially billable operation begins, the platform must determine whether the organization is entitled to execute it and whether sufficient allowance or budget is available.

This decision MUST be integrated with AI execution orchestration without making the editor itself responsible for commercial enforcement.

### 12.2 Preflight sequence

1. Resolve the billing organization and applicable subscription.
2. Verify the requested feature entitlement.
3. Verify provider and model restrictions.
4. Identify the credential ownership mode.
5. Estimate usage or establish a bounded reservation.
6. Check allowance, quota, and organization budget.
7. Apply the plan's overage and confirmation policy.
8. Create an idempotent reservation if required.
9. Return an execution authorization decision.
10. Permit the job manager to proceed only after required authorization succeeds.

### 12.3 Cost estimates

The estimate SHOULD consider:

- Selected provider and model.
- Operation type.
- Input size and reference count.
- Requested output size and quantity.
- Expected number of provider calls.
- Applicable retries or workflow stages.
- Credential ownership mode.
- Relevant pricing rules.
- Known uncertainty in provider pricing.

If the final cost cannot be reliably estimated, the platform MUST communicate that limitation and apply a bounded spending policy.

### 12.4 Concurrency safety

Allowance and budget checks MUST be atomic or use an equivalent reservation mechanism to prevent concurrent operations from exceeding a hard limit due to stale balance reads.

### 12.5 Preflight requirements

- `PRE-001`: Every billable operation MUST pass applicable entitlement checks before execution.
- `PRE-002`: The system MUST verify model and provider access rights.
- `PRE-003`: The system MUST identify the intended credential ownership mode before reserving budget.
- `PRE-004`: The system MUST support reservations for operations with uncertain final consumption.
- `PRE-005`: Hard quotas MUST be protected against concurrent oversubscription.
- `PRE-006`: The system MUST apply the configured overage policy when allowances are exhausted.
- `PRE-007`: A blocked operation MUST provide a clear reason and permitted next steps.
- `PRE-008`: The system MUST NOT create a customer charge merely because a reservation was made.
- `PRE-009`: Materially uncertain charges MUST be disclosed or bounded according to the commercial policy.
- `PRE-010`: A failed preflight MUST prevent unauthorized billable execution.
- `PRE-011`: The authorization decision and applicable entitlement state MUST be auditable.
- `PRE-012`: Customer-owned provider usage MUST be checked against platform fees and plan entitlements separately from platform provider-cost budgets.

---

## 13. Provider cost tracking

### 13.1 Provider cost records

The platform SHOULD maintain a separate provider cost record for each attributable provider attempt when provider-managed credentials are used.

A record SHOULD include:

- Provider and model.
- Job and attempt identifiers.
- Credential ownership mode.
- Provider request reference.
- Provider-reported resource metrics.
- Provider-reported monetary cost, when available.
- Estimated monetary cost, when reported cost is unavailable.
- Currency.
- Pricing source or rate version.
- Measurement timestamp.
- Reconciliation status.
- Related adjustments.

### 13.2 Cost status

The platform SHOULD distinguish:

- `estimated`
- `provider_reported`
- `reconciled`
- `adjusted`
- `unknown`

A provider-reported cost is not necessarily final if the provider can later adjust usage, discounts, or invoices.

### 13.3 Cost requirements

- `COST-001`: Provider costs MUST be tracked separately from customer charges.
- `COST-002`: Platform-managed provider consumption MUST be attributable to the appropriate provider account.
- `COST-003`: Customer-provided provider consumption MUST be separately identified and excluded from platform-managed provider-cost totals unless a separate platform cost genuinely exists.
- `COST-004`: Estimated cost MUST be distinguishable from provider-reported cost.
- `COST-005`: Unknown cost MUST NOT be silently treated as zero.
- `COST-006`: Provider cost adjustments MUST be recorded with provenance.
- `COST-007`: Provider cost reporting SHOULD support aggregation by model, provider, operation type, customer, and billing period.
- `COST-008`: Provider cost records MUST be reconcilable against available provider usage exports or invoices.
- `COST-009`: Internal cost reporting MUST NOT automatically disclose sensitive platform-wide provider pricing to customers.

---

## 14. Customer charge calculation

### 14.1 Charge calculation stages

The billing engine SHOULD calculate customer charges through an explicit sequence:

1. Resolve customer billing account and commercial terms.
2. Identify settled or otherwise billable usage.
3. Select the applicable pricing version.
4. Apply plan allowances and included benefits.
5. Apply overage rules where applicable.
6. Apply discounts or credits.
7. Apply configured minimums and rounding.
8. Determine applicable tax treatment through the designated tax mechanism.
9. Create the charge record.
10. Associate the charge with the relevant invoice or billing transaction.

### 14.2 Charge categories

Customer charges SHOULD distinguish:

- Subscription fee.
- AI usage charge.
- Overage charge.
- Platform execution fee.
- Storage or other resource charge.
- One-time service charge.
- Tax.
- Discount.
- Promotional credit.
- Refund or credit adjustment.

### 14.3 Customer-owned credentials

When the customer supplies provider credentials:

- The platform MUST NOT bill the customer a second time for provider consumption that the customer is already billed for directly by the provider.
- The platform MAY charge a separately disclosed subscription, workflow, orchestration, or platform execution fee.
- The platform MUST distinguish provider charges paid directly by the customer from amounts owed to the platform.
- Any platform fee MUST be linked to the applicable commercial agreement and pricing rule.

### 14.4 Charge requirements

- `CHG-001`: Every customer charge MUST have an identifiable basis.
- `CHG-002`: Charge calculation MUST be reproducible from retained inputs and pricing rules.
- `CHG-003`: The system MUST distinguish subscription charges from usage-based charges.
- `CHG-004`: Included allowance consumption MUST be recorded even when it creates no incremental monetary charge.
- `CHG-005`: Customer-owned provider costs MUST NOT be billed as platform-owned provider consumption.
- `CHG-006`: A platform execution fee MUST be explicitly defined and disclosed.
- `CHG-007`: The system MUST support discounts and credits without modifying the underlying usage event.
- `CHG-008`: Tax calculation MUST use the configured tax policy or designated tax integration.
- `CHG-009`: Charge reversals MUST preserve the original charge reference.
- `CHG-010`: Repeated processing of the same settled usage MUST NOT create duplicate charges.
- `CHG-011`: The system MUST define the handling of minimum charges and currency rounding.
- `CHG-012`: The system MUST preserve enough detail to explain each invoice line to the customer.

---

## 15. Failed, cancelled, retried, and partial operations

### 15.1 General rule

Commercial treatment MUST depend on observed execution and the applicable plan policy—not merely on whether the user interface displays success or failure.

An AI operation may incur provider cost even if it fails to return a usable result.

### 15.2 Billing policy by outcome

| Outcome                                                | Required accounting behavior                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Rejected before provider submission                    | Release unused reservation; no provider usage unless other billable work occurred            |
| Provider rejects invalid request without billable work | Record failure; settle only any verified applicable usage                                    |
| Provider succeeds and result is accepted               | Settle measured usage and calculate applicable charge                                        |
| Provider succeeds but output fails platform validation | Record provider cost; apply the disclosed customer billing policy                            |
| User cancels before execution begins                   | Release reservation if no billable work occurred                                             |
| User cancels during execution                          | Determine actual usage where possible; cancellation alone does not imply zero cost           |
| Provider times out with unknown outcome                | Preserve reservation or unresolved exposure according to policy until reconciled             |
| Retry creates a second provider request                | Record each attributable provider attempt and prevent duplicate logical event processing     |
| Partial output is returned                             | Record observed usage and apply the defined partial-result billing rule                      |
| Platform storage fails after provider success          | Record provider usage and handle customer billing under the disclosed service-failure policy |

### 15.3 Retry treatment

A retry may generate a second billable provider request.

The system MUST track provider attempts individually and MUST NOT assume that retrying is free.

Whether retry costs are charged to the customer, absorbed by the platform, or covered by a plan MUST be an explicit commercial rule.

### 15.4 Outcome requirements

- `OUT-001`: Billing treatment MUST be defined for success, failure, cancellation, partial output, and unknown outcomes.
- `OUT-002`: A failed job MUST NOT automatically imply zero provider cost.
- `OUT-003`: A cancelled job MUST NOT automatically imply that all usage should be refunded.
- `OUT-004`: The system MUST support policy-based absorption of retry costs by the platform.
- `OUT-005`: Provider attempts MUST be accounted for independently.
- `OUT-006`: Duplicate callbacks or events MUST NOT duplicate charges.
- `OUT-007`: Unknown outcomes MUST remain distinguishable from confirmed zero usage.
- `OUT-008`: A charge adjustment after settlement MUST be represented as a separate auditable entry.
- `OUT-009`: Customer-facing billing behavior for platform-caused failures MUST be explicitly documented.
- `OUT-010`: The system MUST support later settlement when final provider usage arrives after the job outcome.

---

## 16. Invoices and billing periods

### 16.1 Billing period

The platform SHOULD support monthly subscription periods and configurable billing intervals where commercially required.

The system MUST define how usage is assigned to a billing period, including late-arriving usage events and delayed provider cost reports.

### 16.2 Invoice structure

An invoice SHOULD contain:

- Invoice identifier.
- Billing account.
- Billing period.
- Currency.
- Subscription charges.
- Itemized usage charges.
- Included usage summary.
- Overage charges.
- Discounts and credits.
- Tax lines, where applicable.
- Amount due.
- Payment status.
- Issue and due dates.
- Related adjustment or credit note references.

### 16.3 Invoice immutability

Issued invoices MUST NOT be silently rewritten.

Corrections SHOULD be represented through credit notes, adjustments, replacement invoices, or other jurisdictionally appropriate accounting mechanisms.

### 16.4 Invoice requirements

- `INV-001`: Every issued invoice MUST have a stable identifier.
- `INV-002`: Invoice lines MUST reference their pricing basis or applicable contractual rule.
- `INV-003`: Invoices MUST distinguish recurring subscription charges from usage charges.
- `INV-004`: Issued invoices MUST retain an immutable audit history.
- `INV-005`: Late-arriving usage MUST follow a defined adjustment or next-period billing policy.
- `INV-006`: The system MUST support invoice preview before finalization where required.
- `INV-007`: Invoice currency MUST be explicit.
- `INV-008`: Invoice totals MUST be reproducible from their line items, discounts, and tax treatment.
- `INV-009`: The platform MUST define how failed payments affect subscription entitlements.
- `INV-010`: Invoice records MUST remain available after subscription cancellation according to retention policy.

---

## 17. Payment collection and payment status

### 17.1 Payment boundary

Payment processing SHOULD be delegated to an approved payment provider or payment integration.

The billing subsystem owns the commercial obligation; the payment integration reports the outcome of attempts to collect that obligation.

The platform MUST NOT store sensitive payment authentication data outside the approved payment provider flow.

### 17.2 Payment states

The system SHOULD distinguish:

- `pending`
- `processing`
- `succeeded`
- `failed`
- `requires_action`
- `partially_refunded`
- `refunded`
- `disputed`

The exact mapping MUST account for the selected payment provider's lifecycle.

### 17.3 Payment requirements

- `PAY-001`: Payment attempts MUST reference the relevant invoice or charge.
- `PAY-002`: Payment events MUST be processed idempotently.
- `PAY-003`: The system MUST distinguish payment failure from usage settlement failure.
- `PAY-004`: Payment processor callbacks MUST be authenticated and validated.
- `PAY-005`: Duplicate payment notifications MUST NOT duplicate financial transactions.
- `PAY-006`: Refunds MUST reference the original payment and relevant charge or invoice.
- `PAY-007`: Payment status MUST NOT be inferred solely from a browser redirect.
- `PAY-008`: The system SHOULD support recovery and reconciliation after interrupted payment processing.
- `PAY-009`: Subscription access changes caused by payment status MUST follow the configured grace and suspension policy.
- `PAY-010`: The system MUST retain payment processor references needed for reconciliation without storing prohibited sensitive payment details.

---

## 18. Organization budgets and spending controls

### 18.1 Budget scopes

The platform SHOULD support budgets at multiple scopes:

- Organization.
- Project.
- User or team, where appropriate.
- Provider.
- Model.
- Billing period.
- Credential ownership mode.

Not every scope must be enabled in the initial release.

### 18.2 Budget policies

A budget MAY define:

- Hard maximum spend.
- Soft warning threshold.
- Monthly allowance.
- Maximum per-operation exposure.
- Maximum concurrent reserved spend.
- Permitted provider or model set.
- Required approval above a threshold.
- Customer-owned credential policy.
- Automatic blocking behavior.

### 18.3 Requirements

- `BUD-001`: Budgets MUST define their scope, currency, and reset period.
- `BUD-002`: The platform MUST support hard limits where configured.
- `BUD-003`: The platform SHOULD support warnings before a soft budget threshold is reached.
- `BUD-004`: Budget enforcement MUST account for outstanding reservations.
- `BUD-005`: Concurrent operations MUST NOT bypass hard budgets through stale balance calculations.
- `BUD-006`: Organization administrators MUST be able to view relevant usage and budget status.
- `BUD-007`: Budget changes MUST be permission-controlled and auditable.
- `BUD-008`: The platform MUST distinguish budget exhaustion from provider unavailability.
- `BUD-009`: Customer-owned provider spend and platform fees MUST be budgeted according to their actual financial owner and commercial treatment.
- `BUD-010`: The system MUST define the behavior for usage that exceeds a budget because actual provider cost differs from the estimate.

---

## 19. Reconciliation and financial integrity

### 19.1 Reconciliation domains

The platform SHOULD reconcile:

1. Execution attempts against internal usage events.
2. Internal usage events against provider-reported metrics.
3. Provider cost records against provider invoices or usage exports.
4. Customer usage charges against billing ledger entries.
5. Billing ledger entries against invoices.
6. Invoices against payment processor records.
7. Reservations against settled or released usage.

### 19.2 Reconciliation discrepancies

Discrepancies MAY include:

- Missing provider usage.
- Duplicate provider usage.
- Provider-reported quantities that differ from estimates.
- Delayed provider cost reports.
- Duplicate internal events.
- Unmatched invoices or payments.
- Unreleased reservations.
- Charges without an associated usage or subscription basis.
- Provider costs attributed to the wrong credential ownership mode.

### 19.3 Reconciliation requirements

- `REC-001`: The platform MUST provide a mechanism to reconcile internal usage with provider-reported usage where provider data is available.
- `REC-002`: Reconciliation MUST identify unmatched and discrepant records.
- `REC-003`: Reconciliation MUST NOT silently overwrite settled records.
- `REC-004`: Corrections MUST preserve links to the original record.
- `REC-005`: Unresolved financial discrepancies MUST be visible to authorized operators.
- `REC-006`: The system SHOULD support automated reconciliation jobs.
- `REC-007`: Reconciliation results MUST be auditable.
- `REC-008`: The platform MUST support delayed and out-of-order provider reports.
- `REC-009`: Customer billing records MUST be reconcilable against the invoice ledger.
- `REC-010`: Payment records MUST be reconcilable against payment processor data.
- `REC-011`: Reconciliation MUST preserve the difference between a usage discrepancy and a customer billing dispute.
- `REC-012`: The system SHOULD alert operators to discrepancies that exceed configured financial or operational thresholds.

---

## 20. Refunds, credits, and disputes

### 20.1 Adjustment types

The platform SHOULD support:

- Full refund.
- Partial refund.
- Usage reversal.
- Promotional credit.
- Goodwill credit.
- Billing correction.
- Provider cost adjustment.
- Customer dispute.
- Chargeback or payment reversal.

These adjustments are not interchangeable and MUST have distinct types and reasons.

### 20.2 Adjustment requirements

- `ADJ-001`: Every adjustment MUST identify its reason and authorized initiator.
- `ADJ-002`: Adjustments MUST reference the original charge, usage record, invoice, or payment as applicable.
- `ADJ-003`: Adjustments MUST be auditable.
- `ADJ-004`: The system MUST enforce permissions for issuing refunds or credits.
- `ADJ-005`: A customer billing dispute MUST NOT silently modify the original usage event.
- `ADJ-006`: The system SHOULD support review workflows for disputed charges.
- `ADJ-007`: Refund and credit treatment MUST follow the applicable commercial and accounting policy.
- `ADJ-008`: The platform MUST distinguish a refund to the original payment method from a credit applied to a future invoice.
- `ADJ-009`: Adjustments MUST be included in financial reconciliation and reporting.
- `ADJ-010`: The system MUST prevent duplicate refund processing for the same authorized refund request.

---

## 21. Customer usage dashboard

### 21.1 Required capabilities

Customers SHOULD be able to view:

- Current subscription and plan.
- Included allowance and remaining balance.
- Usage for the current billing period.
- Usage by project and operation category.
- Usage by provider and model where appropriate.
- Customer-owned versus platform-managed credential mode.
- Estimated and finalized charges.
- Budget and quota status.
- Outstanding invoices and payment status.
- Available credits and credit expiration, where applicable.
- Recent failed operations and their billing status.
- Usage history and downloadable records.

### 21.2 Display rules

The interface MUST distinguish:

- Actual usage from reserved usage.
- Estimated charges from finalized charges.
- Provider costs from customer charges.
- Subscription fees from incremental usage charges.
- Platform-managed provider usage from customer-owned provider usage.
- Failed execution from confirmed zero billable usage.

Where a charge remains unresolved, the UI MUST display a suitable pending or under-reconciliation status rather than presenting an unverified amount as final.

### 21.3 Dashboard requirements

- `UIB-001`: Customers MUST be able to view their applicable plan and entitlement status.
- `UIB-002`: Customers MUST be able to view usage and remaining allowance for applicable metered categories.
- `UIB-003`: Estimated and finalized amounts MUST be visually distinguishable.
- `UIB-004`: Usage records MUST be filterable by a useful set of dimensions.
- `UIB-005`: The dashboard MUST respect organization and project permissions.
- `UIB-006`: Customer-owned provider costs MUST not be presented as amounts owed to the platform.
- `UIB-007`: Failed or unresolved operations MUST display the known billing status.
- `UIB-008`: The dashboard SHOULD provide a path from an aggregated amount to the underlying usage records.
- `UIB-009`: The dashboard MUST identify the applicable currency.
- `UIB-010`: The dashboard MUST not imply that an estimate is a finalized invoice amount.

---

## 22. Audit, security, and access control

### 22.1 Financial access controls

Access to plan administration, pricing, billing records, budget settings, refunds, and provider cost reports MUST be permission-controlled.

Organization users MUST only see billing and usage information permitted by their roles.

### 22.2 Audit events

The platform SHOULD audit:

- Plan creation and modification.
- Subscription state changes.
- Pricing publication.
- Credit grants and expiration.
- Budget changes.
- Usage adjustments.
- Refunds and goodwill credits.
- Invoice issuance and correction.
- Payment status changes.
- Credential ownership mode changes.
- Manual reconciliation actions.
- Administrative overrides.

### 22.3 Requirements

- `AUD-001`: Financial and commercial administrative actions MUST be auditable.
- `AUD-002`: Billing data MUST be isolated by billing account and organization.
- `AUD-003`: Sensitive payment data MUST be handled through approved payment mechanisms.
- `AUD-004`: Pricing and billing permissions MUST be separated from ordinary design-editing permissions.
- `AUD-005`: Manual financial adjustments MUST identify the responsible actor.
- `AUD-006`: Financial records MUST follow defined retention and access policies.
- `AUD-007`: Logs MUST not expose raw API keys or payment authentication secrets.
- `AUD-008`: Administrative overrides MUST include a reason and relevant references.
- `AUD-009`: The platform MUST support investigation of disputed charges without granting unnecessary access to private garment assets.
- `AUD-010`: Audit records MUST distinguish automated decisions from human-authorized changes.

---

## 23. End-to-end reference workflows

### 23.1 Workflow A — Subscription allowance covers generation

1. A user requests image generation.
2. The billing subsystem verifies feature access and the remaining allowance.
3. The platform reserves the required allowance or budget.
4. The job manager executes the generation.
5. The provider returns the result and usage metadata.
6. Usage Metering records and settles the actual consumption.
7. The allowance balance is updated from the ledger.
8. The dashboard displays the usage, remaining allowance, and any incremental charge.
9. If the operation is fully included, no additional usage charge is created.

**Expected result:** Usage is recorded even though the incremental customer charge is zero.

### 23.2 Workflow B — Pay-as-you-go usage

1. The user requests an operation.
2. The platform verifies pay-as-you-go eligibility.
3. The billing engine estimates the charge and determines a reservation amount.
4. The platform checks organization budget and applicable spending limits.
5. The operation proceeds only after required authorization.
6. Provider usage is recorded and normalized.
7. The billing engine calculates the customer charge using the applicable pricing version.
8. The charge is added to the appropriate billing transaction or invoice.
9. The dashboard distinguishes estimated from finalized amounts.

**Expected result:** Eligible usage is billed according to a versioned and traceable pricing rule.

### 23.3 Workflow C — Customer-provided API key

1. An authorized administrator connects a provider credential.
2. The user selects a supported execution mode using that credential.
3. The system verifies the customer's plan and any applicable platform execution fee.
4. The platform submits the job using the customer credential.
5. Provider usage is recorded with `credential_ownership_mode = customer_provided`.
6. Provider charges paid directly by the customer are excluded from platform-managed provider-cost totals.
7. Any agreed platform fee is calculated separately.
8. The dashboard clearly distinguishes the provider's direct charges from amounts owed to the platform.

**Expected result:** The customer is not incorrectly billed twice for provider consumption.

### 23.4 Workflow D — Provider timeout

1. A generation request is submitted.
2. The provider does not return a definitive result before timeout.
3. The platform marks the provider attempt as having an unknown outcome.
4. The system preserves the reservation or unresolved exposure under the applicable policy.
5. The platform queries the provider where possible.
6. If usage is later confirmed, the usage ledger is updated through an idempotent reconciliation process.
7. If no usage occurred, the reservation is released according to policy.
8. If the result remains unknown, the platform communicates the unresolved status and avoids claiming confirmed zero cost.

**Expected result:** Potential provider charges are neither silently lost nor prematurely presented as confirmed customer charges.

### 23.5 Workflow E — Provider success but unusable output

1. The provider successfully executes a request.
2. The platform receives an output that fails required validation.
3. Provider usage and cost are recorded.
4. The customer charge is determined under the disclosed policy for unusable results and platform-caused failures.
5. If a refund or credit is authorized, it is recorded as a separate adjustment.
6. The original provider cost and usage history remain intact.

**Expected result:** The platform preserves financial truth while applying its customer fairness policy transparently.

---

## 24. Testing and acceptance criteria

### 24.1 Unit testing

Tests MUST cover:

- Usage-event validation.
- Idempotency.
- Reservation and release.
- Allowance calculation.
- Plan entitlement evaluation.
- Pricing version selection.
- Charge calculation.
- Currency rounding.
- Overage calculation.
- Credit application.
- Refund and adjustment handling.
- Reconciliation matching.
- Subscription lifecycle transitions.

### 24.2 Integration testing

Tests SHOULD cover:

- Job events flowing into Usage Metering.
- Provider usage reports arriving late or out of order.
- Duplicate job completion events.
- Duplicate payment processor callbacks.
- Concurrent operations competing for the same allowance.
- Reservation recovery after worker failure.
- Subscription changes during a billing period.
- Customer credential revocation during execution.
- Failed payment and grace-period behavior.
- Invoice correction and reconciliation.

### 24.3 Acceptance criteria

**AC-01 — Usage attribution:** Every completed provider attempt can be traced to its usage records.

**AC-02 — Duplicate event protection:** Reprocessing the same usage event does not duplicate logical consumption or customer charges.

**AC-03 — Reservation integrity:** Concurrent operations cannot bypass configured hard usage or spending limits through stale balance reads.

**AC-04 — Allowance enforcement:** A plan with exhausted allowance follows its configured overage policy.

**AC-05 — Pricing traceability:** Every finalized usage charge references its applicable pricing version or contractual rule.

**AC-06 — Credential ownership:** Customer-provided provider usage is separately identified from platform-managed provider consumption.

**AC-07 — Customer-owned billing:** Provider charges paid directly by the customer are not incorrectly billed again by the platform as provider consumption.

**AC-08 — Unknown outcomes:** A timed-out request with an unknown provider outcome does not automatically become confirmed zero usage.

**AC-09 — Failure policy:** Failed and cancelled operations follow defined settlement and refund rules.

**AC-10 — Immutable history:** A settled usage event or issued invoice can be corrected only through an auditable adjustment or correction workflow.

**AC-11 — Budget enforcement:** A hard budget remains enforced when multiple requests are submitted concurrently.

**AC-12 — Invoice consistency:** Invoice totals reconcile with their line items, discounts, credits, and tax records.

**AC-13 — Payment idempotency:** Duplicate payment notifications do not create duplicate payment transactions.

**AC-14 — Dashboard accuracy:** The customer dashboard distinguishes actual, reserved, estimated, and finalized amounts.

**AC-15 — Administrative traceability:** Pricing changes, plan changes, refunds, and manual adjustments are auditable.

**AC-16 — Provider reconciliation:** Provider-reported usage can be matched against internal records where the provider supplies sufficient identifiers and data.

**AC-17 — Historical reproducibility:** Historical charges can be explained using the stored usage, pricing, plan, and adjustment records.

**AC-18 — Subscription cancellation:** Cancelling a subscription does not delete historical usage, invoices, or payment records.

---

## 25. Implementation priorities

### Phase 1 — Metering foundation

Implement:

- Normalized usage-event schema.
- Idempotent usage ingestion.
- Authoritative usage ledger.
- Platform-managed versus customer-provided credential attribution.
- Basic provider usage extraction.
- Simple plan and entitlement model.
- Monthly allowance enforcement.
- One versioned customer pricing model.
- Usage reservation and settlement.
- Basic customer usage dashboard.
- Audit logging.

### Phase 2 — Commercial billing

Implement:

- Subscription lifecycle.
- Pay-as-you-go billing.
- Overage policies.
- Invoice generation.
- Payment integration.
- Discounts and credits.
- Refund and adjustment workflows.
- Organization-level budgets.
- Provider cost reconciliation.
- Automated usage and payment reconciliation.

### Phase 3 — Advanced financial controls

Implement:

- Multiple currencies where required.
- Advanced pricing tiers.
- Project-level budgets.
- Per-model pricing rules.
- Spend approval workflows.
- Detailed profitability reporting.
- Provider cost anomaly detection.
- Advanced credit and allowance policies.
- Enhanced billing exports and accounting integrations.

---

## 26. Open architecture and commercial decisions

The following decisions must be resolved before production billing rules are finalized.

1. **Commercial unit:** Will customers primarily purchase credits, pay per operation, pay per provider resource unit, or use a hybrid?
2. **Subscription plans:** Which plan tiers, allowances, seat limits, and features will launch initially?
3. **Allowance rollover:** Do unused credits expire, roll over, or accumulate under a defined cap?
4. **Overage behavior:** Are overages blocked, automatically billed, or permitted only after confirmation?
5. **Customer-owned credentials:** Will the platform charge only a subscription fee, a separate execution fee, or both?
6. **Failed generation policy:** Which provider costs will be passed through, absorbed, or credited when results are unusable?
7. **Retry policy:** Who pays for provider retries, including retries caused by platform failures?
8. **Unknown outcomes:** How long will unresolved usage remain pending before escalation or manual reconciliation?
9. **Pricing effective time:** Is customer pricing fixed at reservation time, operation confirmation time, or settlement time?
10. **Billing periods:** Will subscriptions be monthly only at launch, or will annual plans be supported?
11. **Payment and tax:** Which payment processor, supported currencies, tax mechanisms, and invoice requirements apply?
12. **Budgets:** Are hard spending caps required for every organization, or only for selected plans?
13. **Financial retention:** What retention periods apply to usage, invoices, provider reports, and audit records?
14. **Provider reconciliation:** Which initial providers expose sufficient usage reports or invoice exports for automated reconciliation?

---

## 27. Dependencies on subsequent specifications

| Document                                                                 | Required coordination                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Project Lifecycle and Design Versioning Specification                    | Operation ownership, job lifecycle, project attribution, and revision history                 |
| Security, Identity, and Organization Access Specification                | Billing roles, organization boundaries, credential permissions, and administrative controls   |
| Editor Interaction and Visualization Specification                       | Cost estimates, allowance displays, confirmation flows, job status, and error messages        |
| AI Execution, Prompt Compilation, and Provider Integration Specification | Job and attempt identifiers, provider usage metadata, credential ownership, retry information |
| Platform Administration Specification                                    | Plan configuration, pricing publication, model rates, quotas, and audit requirements          |
| Payment Integration Specification                                        | Payment lifecycle, refunds, callbacks, and reconciliation contracts                           |

All dependent specifications MUST use consistent identifiers and must preserve the distinction between usage facts, provider costs, customer charges, and payment outcomes.

---

## 28. Completion statement

This specification establishes the commercial accounting foundation for the AI-powered garment design platform.

The system must be able to answer four separate questions reliably:

1. **What usage occurred?**
2. **What did the AI provider charge, or what is the estimated provider cost?**
3. **What amount is the platform entitled to charge the customer?**
4. **What amount has actually been paid, refunded, or remains outstanding?**

The platform must support both platform-managed and customer-provided AI credentials without confusing provider costs with platform revenue. It must also support subscription allowances, pay-as-you-go usage, overages, spending limits, immutable financial history, and reconciliation of uncertain or delayed execution outcomes.

The fundamental design rule is that **usage is measured first, commercial policy determines the charge, and payment processing settles the resulting financial obligation**.

**Next recommended document:** *Project Lifecycle and Design Versioning Specification* (`SPEC-GDP-006`).

Add explicit data models and API contracts