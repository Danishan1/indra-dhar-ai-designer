# I33 — Customer-provided API credentials (BYOK)

| Field                           | Value                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 6 — Subscription, billing & BYOK                                                                                                                                                                                                                                                                                      |
| Subsystems                      | SS-08 AI Provider & Orchestration, SS-01 Identity & Access, SS-13 Usage Metering, SS-14 Billing                                                                                                                                                                                                                       |
| Depends on                      | I22 (secrets service, provider registry, adapters), I30 (entitlements), I31 (pricing, fee category)                                                                                                                                                                                                                   |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                     |
| Spec references                 | `docs/init/04-ai-prompt.md` §13.2–13.4 (ROUTE-002/007/009), §18 (CRED-001…012), §19 (USG-004), §25.3 Workflow C, AC-12/13; `docs/init/05-ai-usage-metering.md` §4.2, §12 (PRE-003, PRE-012), §13 (COST-003), §14.3, §23.3, AC-06/07; `docs/init/09-specification.md` §8.2 (FR-SEC-040), §12.5 (FR-SEC-132…140), §24.4 |
| Open decisions to resolve first | Platform fee model for BYOK usage (subscription-only vs per-execution fee) — `05-decisions.md` §3 / SPEC-005 §26.5                                                                                                                                                                                                    |

## 1. Goal

Allow an organization to connect its own AI provider account (Mode B) so eligible jobs run on the customer's key: credentials are stored encrypted, managed only by credential admins with step-up auth, shown masked, validated against the provider, used only server-side, routed explicitly by ownership mode, metered separately from platform-managed usage, and never silently replaced by platform keys when they fail.

## 2. Scope

### In scope

- Org-scoped `ProviderCredential` (owner_scope `organization`) using the I22 `SecretsService` envelope encryption (ADR-007).
- Credential lifecycle: add (encrypted channel, step-up), validate (provider adapter `verifyCredential`), mark `active|invalid|revoked`, rotate/replace, revoke/delete (secret destroyed, metadata kept).
- Provider identity check: credential's provider must match requested integration (CRED-010).
- Org execution policy: `credential_mode_preference` (`platform_only`, `customer_only`, `customer_preferred`) and `allow_fallback_to_platform` (default **false**; enabling requires billing admin + cost disclosure) — CRED-011, §18.2.
- Routing: ownership mode decided before preflight (PRE-003); job attempts record `credential_ownership_mode` + `credential_ref` (CRED-005).
- Error handling: revoked/invalid key → `CREDENTIAL_INVALID` without uncontrolled retries (CRED-007); queued jobs re-check credential status before execution.
- Metering: usage events tagged `customer_provided`; provider cost excluded from platform cost totals (COST-003); customer charges only for platform fee if configured (CHG-005/006).
- Pricing: `pricing_entries` for ownership mode `customer_provided` (platform execution fee, possibly zero).
- Dashboard shows provider usage paid directly by customer separately from amounts owed to platform (UIB-006).
- Notifications to credential admins on add/replace/revoke/invalid (FR-SEC-229).

### Out of scope (deferred to)

- Multiple keys per provider with load balancing (→ backlog).
- Provider-side spend caps sync (→ backlog).

## 3. Deliverables

- `apps/api/src/modules/ai-providers/credentials/` (controller, service, validation)
- Routing/preflight updates in `ai-providers` and `billing` preflight
- Web: Organization settings → AI Providers page (list, add, test, revoke, policy)
- Permission keys: `credentials.view`, `credentials.manage`
- Migration `…_i33_byok`

## 4. Data model changes

- `provider_credentials` add: `organization_id`, `owner_scope`, `masked_hint` (e.g. `sk-…9xQ2`), `last_validated_at`, `validation_error_code`, `revoked_at/by`
- `organization_ai_policies` (credential_mode_preference, allow_fallback_to_platform, allowed_providers[], version)
- `job_attempts.credential_ref`, `credential_ownership_mode` (exists from I22/I24; enforce not null)
- `pricing_entries.ownership_mode` values used for BYOK fee

## 5. API / contracts

| Method & path                               | Permission                                                                              | Purpose                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| `GET /v1/org/ai-credentials`                | `credentials.view`                                                                      | Masked list + status    |
| `POST /v1/org/ai-credentials`               | `credentials.manage` + step-up                                                          | Submit key (write-only) |
| `POST /v1/org/ai-credentials/{id}/validate` | `credentials.manage`                                                                    | Test against provider   |
| `POST /v1/org/ai-credentials/{id}/replace`  | `credentials.manage` + step-up                                                          | Rotate                  |
| `POST /v1/org/ai-credentials/{id}/revoke`   | `credentials.manage` + step-up                                                          | Revoke & destroy secret |
| `GET/PUT /v1/org/ai-policy`                 | `credentials.view` / `credentials.manage` (fallback toggle also needs `billing.manage`) | Execution policy        |

Events: `ProviderCredentialAdded`, `ProviderCredentialValidated`, `ProviderCredentialInvalidated`, `ProviderCredentialRevoked`.

## 6. UI

- AI Providers settings: provider cards, masked key, status chip, last validated, "Test" button, revoke with confirmation; policy section explaining cost implications of fallback.
- Editor generation dialog shows "Runs on: your OpenAI key / platform credits" (ownership mode) and the applicable fee.

## 7. Implementation tasks (ordered checklist)

1. [ ] Decide BYOK fee model; seed pricing entries.
2. [ ] Credential service on top of SecretsService; write-only API (never return secret, FR-SEC-134).
3. [ ] Adapter `verifyCredential` for each implemented provider (+ fake).
4. [ ] Org AI policy + routing changes; record routing decision with ownership mode.
5. [ ] Preflight split: platform fee/entitlements vs platform provider-cost budget (PRE-012).
6. [ ] Worker re-validates credential status at job start; invalid → fail with `CREDENTIAL_INVALID`, no fallback unless policy.
7. [ ] Metering & dashboard separation.
8. [ ] Redaction tests (logs, errors, events, prompts).
9. [ ] Update PROGRESS.md.

## 8. Tests

- Unit: routing matrix (preference × fallback × key status).
- Integration: key never appears in API responses, logs, job records, outbox payloads, compiled prompts (AC-12, CRED-012); revoked key blocks new jobs; queued job after revocation fails cleanly; usage tagged `customer_provided` and excluded from platform cost (AC-13, AC-06); no double billing for provider consumption (AC-07); designer without `credentials.manage` cannot add keys (AC-SEC-007); cross-org credential use impossible (FR-SEC-204).
- E2E: admin adds key (fake provider), designer generates, dashboard shows customer-paid usage separately.

## 9. Acceptance criteria

- [ ] AC1 — Raw keys are never sent to the browser or written to logs/events/prompts (CRED-001/003/012, AC-12).
- [ ] AC2 — Usage on customer keys is recorded with `customer_provided` mode and excluded from platform-managed provider cost (USG-004, COST-003, AC-13, AC-06).
- [ ] AC3 — A failing customer key never silently falls back to platform keys unless the org policy explicitly allows it with disclosed cost (§18.2, CRED-011, ROUTE-009).
- [ ] AC4 — Adding/replacing/revoking keys requires `credentials.manage` and step-up auth, and is audited (CRED-009, FR-SEC-040).
- [ ] AC5 — Revocation prevents future use within the documented target, including queued jobs (CRED-007, FR-SEC-139).
- [ ] AC6 — Customers are not billed again for provider consumption; only disclosed platform fees apply (CHG-005/006, AC-07).

## 10. Risks & notes

- Validation calls should be cheap (list-models style) — never run a billable generation to validate.
- Masked hint must be computed at submission and stored; never decrypt to display.

## 11. Handoff

- I34 reconciles customer-mode usage separately; I45 lets operators see provider/credential health (metadata only).

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
