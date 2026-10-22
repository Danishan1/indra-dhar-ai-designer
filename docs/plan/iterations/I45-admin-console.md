# I45 — Platform administration console

| Field | Value |
|---|---|
| Phase | 9 — Administration, observability, hardening, launch |
| Subsystems | SS-18 Platform Administration, SS-08 AI Providers, SS-14 Billing, SS-01 Identity (operator roles), SS-17 Audit |
| Depends on | I22 (providers/models), I30 (plans) — also uses I31 pricing, I38 templates |
| Estimated sessions | 2 |
| Spec references | `docs/init/04-ai-prompt.md` §11, §13, §26; `docs/init/05-ai-usage-metering.md` §9, §11, §22; `docs/init/09-specification.md` §16 (FR-SEC-186..197), FR-SEC-035/036; `docs/init/08-tech-pack.md` §22 (FR-TP-130..132); `docs/plan/05-decisions.md` ADR-030 |
| Open decisions to resolve first | none |

## 1. Goal
Give platform operators a separate, strongly authenticated console to manage everything that was so far seed-only: AI providers, model capability profiles, routing policies, prompt template versions, plans & pricing publication, spec templates/POM libraries/rule sets, feature flags and platform settings — with versioned, audited changes that never rewrite history — and a governed break-glass path for exceptional customer-data access.

## 2. Scope
### In scope
- Platform operator principal & roles separate from org roles: `platform_infra_admin`, `platform_security_admin`, `platform_billing_admin`, `platform_catalog_admin`, `platform_support` (FR-SEC-186, FR-SEC-194, FR-SEC-195). MFA (phishing-resistant preferred) mandatory (FR-SEC-187, FR-SEC-035/036).
- Admin UI under `/admin` (separate layout, distinct visual marker).
- **AI**: providers (enable/disable — REG-003), model capability profiles (new version on edit — REG-004), routing policies & fallbacks, prompt template versions publish/rollback (CMP-011/012), concurrency/timeouts/retry policies, provider health view.
- **Commercial**: plan versions publish, pricing versions publish with effective dates (PRICE-003, PRICE-009, PRICE-012), credit conversion schedules, approval-required for publication (two-person optional).
- **Tech pack catalog**: spec templates, POM libraries, validation rule sets — publish new versions, deprecate (FR-TP-130, FR-TP-132).
- **Artifact platform library** management (built-in artifacts publish/deactivate — ART-007, ART-010).
- **Feature flags** with org overrides (ADR-030).
- **Org support view**: org metadata, subscription status, usage summary — **no customer content** by default (FR-SEC-188).
- **Break-glass**: request with justification + scope + duration → (optional) second operator approval → time-limited grant → all access audited → alert to security personnel (FR-SEC-189..193); auto-expiry.
- Periodic access review report of operator roles (FR-SEC-197).

### Out of scope (deferred to)
- Customer-facing org admin (already in I06–I08, I30)
- Full observability dashboards (→ I46)

## 3. Deliverables
- `apps/api/src/modules/admin/` (controllers per area delegating to owning module services — admin never writes other modules' tables directly)
- `apps/api/src/modules/identity/platform-operators/`
- `apps/web/src/app/admin/**` + `features/admin/*`
- `packages/contracts/src/permissions.ts` platform permission namespace `platform.*`

## 4. Data model changes
- `PlatformOperator` (user_id, roles[], status) or system roles on a reserved platform organization (choose one; record in PROGRESS.md).
- `FeatureFlag` (key, default, description), `FeatureFlagOverride` (organization_id, value).
- `PlatformSetting` (key, version, value JSONB, published_by).
- `PlatformOperatorAccessGrant` (operator_id, organization_id, scope JSONB, justification, requested_at, approved_by, expires_at, revoked_at).
- `AdminChangeRequest` (optional two-person publish: entity, proposed version, requested_by, approved_by).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET/POST /v1/admin/ai/providers`, `/models`, `/routing-policies`, `/prompt-templates` | `platform.ai.manage` | AI catalog (versioned writes) |
| `GET/POST /v1/admin/plans`, `/pricing-versions`, `/credit-schedules` (+ `:publish`) | `platform.billing.manage` | Commercial catalog |
| `GET/POST /v1/admin/spec-templates`, `/pom-libraries`, `/rule-sets` (+ `:publish`) | `platform.catalog.manage` | Tech pack catalog |
| `GET/POST /v1/admin/artifacts/platform` | `platform.catalog.manage` | Built-in library |
| `GET/PUT /v1/admin/feature-flags[/{key}/overrides/{orgId}]` | `platform.settings.manage` | Flags |
| `GET /v1/admin/organizations[/{id}]` | `platform.support.view` | Support metadata (no content) |
| `POST /v1/admin/break-glass` / `:approve` / `:revoke` | `platform.breakglass.request` / `platform.security.manage` | Exceptional access |
| `GET /v1/admin/access-review` | `platform.security.manage` | Operator access report |

Events: `PlatformConfigPublished`, `BreakGlassGranted` (→ alert), `BreakGlassExpired`.

## 6. UI
- Admin shell with red/amber environment banner, sidebar per area, version history panels showing diff between versions, "publish" confirmations with effect date.
- Provider health table (status, error rate, latency from metrics when I46 available).
- Break-glass request form + active grants list with countdown.

## 7. Implementation tasks (ordered checklist)
1. [ ] Decide operator model (reserved platform org vs separate table); implement roles + MFA enforcement + step-up for publish actions.
2. [ ] Admin API facades calling owning services; every write creates a new version + audit event.
3. [ ] AI catalog screens; routing policy editor with validation (filters before ranking — SPEC-004 §13.2).
4. [ ] Commercial catalog screens with effective-date validation and no retroactive change.
5. [ ] Tech pack catalog screens.
6. [ ] Feature flags service + `useFeatureFlag` hook in web and `FeatureFlagService` in api.
7. [ ] Break-glass flow + authorization integration (grant consulted by PDP with obligation `audit_every_access`) + alert notification.
8. [ ] Access review report.
9. [ ] Tests; PROGRESS.md.

## 8. Tests
- Integration: org admin cannot reach `/v1/admin/*` (vertical escalation, TR-SEC-011); operator without break-glass cannot read customer designs (FR-SEC-188); break-glass grant expires and access is denied after; every access under grant audited; publishing new pricing doesn't change finalized charges (PRICE-009); model disable removes it from routing without editor changes (REG-003).
- E2E: operator publishes new credit schedule effective next month; user sees new estimate only after effective date.

## 9. Acceptance criteria
- [ ] AC1 — Operator privileges separate from org roles; strong auth required (FR-SEC-186, FR-SEC-187).
- [ ] AC2 — No default customer-content access; break-glass justified, time-limited, audited, alerted (FR-SEC-188..192).
- [ ] AC3 — Admin capabilities separated by role; no single role grants all (FR-SEC-194, FR-SEC-195).
- [ ] AC4 — Provider/model/routing/pricing/security changes versioned & audited; historical records untouched (FR-SEC-196, REG-004, PRICE-003, SPEC-004 §26).
- [ ] AC5 — Templates/rule sets publish as new versions; released specs unaffected (FR-TP-130).
- [ ] AC6 — Feature flags with org overrides operate without redeploy.

## 10. Risks & notes
- Admin console is a high-value target: separate route prefix, stricter rate limits, IP allowlist option in Caddy (document in I48).
- Do not let admin facades bypass module invariants.

## 11. Handoff
- I46 dashboards link from admin; I47 adds API-token admin for service identities.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
