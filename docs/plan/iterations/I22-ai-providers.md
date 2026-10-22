# I22 — AI provider registry, credentials & adapters

| Field | Value |
|---|---|
| Phase | 4 — AI execution & metering foundation |
| Subsystems | SS-08 AI Provider & Orchestration, SS-01 (secrets), SS-18 (config via seeds) |
| Depends on | I21 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/04-ai-prompt.md` §4.4, §11 (registry REG-001…010), §12 (adapter interface ADP-001…012), §18 (credential modes & security CRED-001…012), §19 (usage metadata USG-001…010), §20 (errors), §22 (SEC-AI-001…012), §27.2 (contract tests); `docs/init/09-specification.md` §12.5 (FR-SEC-132…140), §14.1 (secret storage FR-SEC-164…169); `docs/init/11-tech-stack.md` §7 |
| Open decisions to resolve first | **ADR-009 (initial providers/models — Open, decide here)**, ADR-007 (envelope encryption — confirm) |

## 1. Goal
Create the provider-independent AI integration layer: a **registry** of providers and **versioned model capability profiles**, a **secrets service** with envelope encryption for platform-managed credentials, the normalized **adapter interface**, a scriptable **fake adapter** used by all tests, and the **first real adapter(s)** selected under ADR-009 with contract tests against recorded fixtures. Business logic never sees provider-specific formats or raw keys.

## 2. Scope
### In scope
- `packages/ai-contracts`: `ProviderAdapter` interface —
  `validateRequest(req, profile)`, `submit(req, credentialCtx, idempotencyKey) → SubmissionResult (sync_completed | accepted_async)`, `poll(providerJobRef)`, `retrieveResult(ref)`, `cancel(ref)`, `normalizeError(err) → { category, retryable, safeMessage, diagnostics }`, `extractUsage(raw) → ProviderUsage`, `health()`, `capabilities()`; unsupported methods return explicit `UNSUPPORTED` (ADP-010).
  `NormalizedResult` (SPEC-004 §15.2), `ProviderUsage` (reported/estimated/unavailable — never zero for missing), error categories (SPEC-004 §20.1).
- `ai-providers` module:
  - `AiProvider`, `AiModelProfile` (versioned rows; edits create new version; REG-004), `ProviderCredential` (`owner_scope=platform` now; `organization` in I33), `SecretRecord`.
  - Capability fields per SPEC-004 §11.3 with support status `verified | documented | configured | unknown` (REG-008).
  - Enable/disable model without code changes (REG-003); distinguish `unavailable` vs `not_configured` vs `not_authorized` (REG-005).
  - Seeds: providers/models/profiles from `prisma/seed/platform/ai-providers.ts`; platform credential loaded from deployment secret (env/file) into SecretRecord via admin CLI `pnpm --filter api secrets:put`.
  - `CredentialResolver` (worker-only): resolves `credential_context_ref` → decrypted key in memory just-in-time; never logged/serialized (CRED-001…006).
- `SecretsService` (ADR-007): AES-256-GCM per-secret DEK, wrapped by master key `SECRETS_MASTER_KEY` (+ `SECRETS_MASTER_KEY_VERSION`) for rotation; rewrap command; redaction list updated (`apiKey`, `authorization`, `x-api-key`).
- Fake adapter `packages/test-utils/fake-ai-adapter`: deterministic scripted scenarios selected by request tag: `success_sync`, `success_async(after n polls)`, `timeout_after_submit` (→ unknown outcome), `rate_limited`, `quota_exceeded`, `auth_failed`, `malformed_response`, `partial_result`, `late_result_after_cancel`; produces placeholder PNGs and usage numbers.
- First real adapter(s) per ADR-009: one image generation/editing model and (if separate) one multimodal interpretation model. Implement with official SDK or fetch; timeouts; provider idempotency key if supported (ERR-004); status lookup for reconciliation if supported (§20.3); usage extraction.
- Contract tests: run adapter against recorded HTTP fixtures (no network) — valid/invalid request, auth failure, rate limit, timeout, malformed, async completion, usage extraction (ADP-012, §27.2). Optional manual live smoke script gated by `AI_LIVE_SMOKE=1` never run in CI.
- Concurrency limits per provider/model enforced in worker (BullMQ group/limiter) (PERF-004).
- Provider health status recorded; admin can temporarily disable (UI in I45).

### Out of scope (deferred to)
- Prompt compilation & routing policies (→ I23); usage ledger (→ I24)
- Customer-provided credentials & UI (→ I33); admin console UI (→ I45)

## 3. Deliverables
- `packages/ai-contracts/src/{adapter.ts, results.ts, errors.ts, usage.ts, capabilities.ts}`
- `packages/test-utils/src/fake-ai-adapter/*`
- `apps/api/src/modules/ai-providers/{module, registry.service.ts, credentials.service.ts, repository.ts}` + `apps/api/src/platform/secrets/*`
- `apps/worker/src/ai/{adapter-registry.ts, credential-resolver.ts, adapters/<provider>/*}`
- `apps/worker/test/fixtures/<provider>/*.json` + contract test suites
- Migration `…_i22_ai_providers`; ADR-009 decision recorded with evaluation notes in `docs/architecture/adr/009-initial-ai-providers.md`

## 4. Data model changes
`AiProvider`, `AiModelProfile` (immutable versions + `is_current`), `ProviderCredential`, `SecretRecord` (ciphertext, wrapped_dek, key_version, iv, tag). `JobAttempt` gains `credential_id`, `credential_ownership_mode`, `provider_request_id` (if not added in I21).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/ai/models` | `design.generate` | Models available to caller's org (capabilities summary, no secrets, no internal pricing) |
| `GET /v1/admin/ai/providers` (+ CRUD minimal) | `platform.ai.manage` (platform operator) | Registry admin API (UI in I45) |

Events: `ai.provider.health_changed`, `ai.model.profile_versioned` (audit).

## 6. UI
None user-facing beyond a read-only model list later used by I25. Admin UI in I45.

## 7. Implementation tasks (ordered checklist)
1. [ ] **Decide ADR-009**: evaluate current candidates (verify docs/pricing/data terms at that time); record choice + rationale.
2. [ ] Define `ai-contracts` types; adapter interface; error categories.
3. [ ] SecretsService + tests (encrypt/decrypt, rotation, tamper detection).
4. [ ] Registry tables, versioned profile writes, seeds.
5. [ ] Fake adapter with all scenarios.
6. [ ] Real adapter(s) + fixture-based contract tests; usage extraction; error normalization; idempotency/status-lookup support flags.
7. [ ] Worker adapter registry + credential resolver + provider concurrency limiter.
8. [ ] Log-redaction tests (no key in logs/errors/events).
9. [ ] Update 05-decisions.md, PROGRESS.md.

## 8. Tests
- Unit: secrets crypto; profile versioning; capability support-status logic.
- Contract: every adapter passes the shared adapter contract suite (same suite runs on fake adapter).
- Integration: credential never appears in logs, events, job records, error messages (CRED-003, CRED-012, SPEC-004 AC-12 pre-work); disabling a model removes it from `/v1/ai/models`.

## 9. Acceptance criteria
- [ ] AC1 — All external AI calls go through an adapter implementing the normalized interface. (ADP-001, FR-070, FR-071)
- [ ] AC2 — Providers/models have stable internal ids and versioned capability profiles; model selection data comes from the registry, not hardcoded names. (REG-001, REG-002, REG-006)
- [ ] AC3 — Admins can enable/disable a model without changing editor code. (REG-003)
- [ ] AC4 — Provider errors are normalized into stable categories with safe messages. (ADP-003, ERR-001, ERR-010)
- [ ] AC5 — Adapters distinguish sync completion from async acceptance and preserve provider request/job ids. (ADP-004, ADP-005)
- [ ] AC6 — Usage reported by providers is extracted; missing usage is `unavailable`, never zero. (ADP-006, USG-003, USG-007)
- [ ] AC7 — Raw credentials are encrypted at rest, resolved only in trusted backend components, never sent to browser/logs. (CRED-001…006, FR-SEC-164…169, NFR-020)
- [ ] AC8 — Adapter contract tests run offline on fixtures; CI makes no real provider calls. (ADP-012, 02-conventions §8)

## 10. Risks & notes
- Provider APIs and model names change quickly — keep provider specifics inside adapter folders and profiles only (AR-004, NFR-030).
- Provider pricing in profiles is time-dependent configuration, not a fact (REG-010).
- Document each provider's data retention/training terms in the ADR (SEC-AI-009, FR-SEC-211).

## 11. Handoff
- I23 uses profiles for capability-filtered routing and model-specific mappings.
- I24 consumes `ProviderUsage` from attempts.
- I33 adds organization-scoped credentials reusing SecretsService.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
