# I47 — Security hardening, API tokens, export & deletion

| Field | Value |
|---|---|
| Phase | 9 — Administration, observability, hardening, launch |
| Subsystems | SS-01 Identity & Access, SS-11 Assets, SS-02 Projects, SS-17 Audit, all modules (review) |
| Depends on | I43 (all resource types exist) |
| Estimated sessions | 2 |
| Spec references | `docs/init/09-specification.md` §12.6 (FR-SEC-141..145), §13 (FR-SEC-146..163), §14 (FR-SEC-164..177), §18 (FR-SEC-216..225), §20 (NFR-SEC-001..019), §25, §26 (TR-SEC-010..026), §30; `docs/init/06-project-lifecycle.md` FR-PRJ-089..092; `docs/init/11-tech-stack.md` §10; `docs/init/10-visualization.md` FR-RV-190..193; `docs/plan/05-decisions.md` ADR-004, ADR-029 |
| Open decisions to resolve first | ADR-004 RLS (evaluate & decide); ADR-029 confirm ClamAV; retention periods defaults (OD-SEC-008, OD-PRJ-008) |

## 1. Goal
Bring the platform to a launch-grade security posture: scoped API tokens and service identities for integrations, hardened HTTP surface (CSP, headers, CSRF review, rate limits), real malware scanning of uploads, verified tenant isolation everywhere (with RLS evaluated as defence-in-depth), governed organization data export and deletion with retention jobs, and a completed penetration-test checklist — closing the SPEC-009 Definition of Done.

## 2. Scope
### In scope
- **API tokens** (FR-SEC-146..153): create (shown once), scopes from permission catalog, expiry, rotation, revocation, last-used, rate limits, audit; tokens bound to user or service identity + org; not accepted as session/provider credentials.
- **Service identities** (FR-SEC-154..158): worker and integrations use scoped identities, not admin; secret rotation procedure.
- **Webhook hardening** review (FR-SEC-159..163): signature verification, replay windows, SSRF-safe outbound URL validation (allowlist/deny private ranges).
- **HTTP surface**: strict CSP (nonce-based for Next.js), HSTS, X-Content-Type-Options, frame-ancestors, Referrer-Policy, Permissions-Policy; CSRF tokens verified on all cookie-auth mutations (FR-SEC-049); cookie flags audit (FR-SEC-048); rate limit review on auth, uploads, AI, exports (FR-SEC-041, FR-SEC-152).
- **Upload scanning** (ADR-029, FR-SEC-176/177): ClamAV `clamd` container; assets `quarantined` until clean; infected → `rejected` + audit + notify; size/complexity limits for SVG/GLB/images re-verified (FR-RV-191..193).
- **Tenant isolation verification** (FR-SEC-216..220, TR-SEC-012): extend cross-tenant suite to caches, search, object storage keys, jobs, exports, SSE streams; evaluate Postgres RLS (ADR-004): implement on highest-risk tables if low friction, or record rationale.
- **Organization export** (FR-SEC-141, FR-SEC-142): permissioned async job producing ZIP (JSON + assets) restricted to accessible resources, audited, expiring download.
- **Governed deletion** (FR-SEC-143..145, FR-PRJ-089..092): project & org logical delete → asynchronous physical erasure pipeline across DB, object storage, caches, derived assets; protected records (released tech packs, invoices, usage, audit, legal hold) retained/anonymized; deletion status tracked; provider-side copies limitation disclosed (FR-SEC-224).
- **Retention jobs**: temp render artefacts, compiled prompts (30-day default), expired idempotency keys/sessions/invitations, soft-deleted assets (FR-SEC-175, FR-SEC-222, INP-006).
- **Dependency & config scanning**: `pnpm audit`/OSV in `pnpm verify:security`; secret scanning (gitleaks) pre-commit/CI (FR-SEC-169, TR-SEC-024).
- **Pen-test checklist** (OWASP ASVS L2-style) executed manually + automated where possible; findings fixed or logged (TR-SEC-025).
- Security incident handling doc (NFR-SEC-017).

### Out of scope (deferred to)
- SSO/SCIM, conditional access (→ backlog, SPEC-009 Phase 3)
- External penetration test by a third party (owner arranges before public launch; checklist prepares it)

## 3. Deliverables
- `apps/api/src/modules/identity/{api-tokens, service-identities}/`
- `apps/api/src/platform/security/{headers.ts, csrf.ts, ssrf-guard.ts, rate-limits.ts}`
- `apps/worker/src/processors/{av-scan, org-export, erasure, retention}.ts`
- `infra/compose` ClamAV service; `infra/scripts/security-scan.*`
- `docs/deployment/security/{incident-response.md, pentest-checklist.md, data-retention.md, rls-evaluation.md}`
- `tests/integration/security/*` expanded suite

## 4. Data model changes
- `ApiToken`, `ServiceIdentity` (per 03-domain-model).
- `DeletionRequest` (target_type, target_id, requested_by, status `requested|logical_deleted|erasing|erased|blocked`, blocked_reason, legal_hold), `LegalHold` (org/project scope).
- `OrgExportRequest` (status, asset_id, expires_at).
- Optional RLS policies migration (if adopted).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET/POST /v1/api-tokens`, `DELETE /v1/api-tokens/{id}`, `POST …/{id}:rotate` | `api_tokens.manage` | Token lifecycle |
| `GET/POST /v1/admin/service-identities` | `platform.security.manage` | Service identities |
| `POST /v1/organizations/{orgId}/exports` / `GET …/{id}` | `organization.export` (+ step-up) | Org data export |
| `POST /v1/projects/{id}:delete`, `POST /v1/organizations/{id}:delete` | `project.delete` / `organization.delete` (+ step-up, confirmation) | Governed deletion |
| `GET /v1/deletion-requests/{id}` | same | Deletion status |
| `POST /v1/admin/legal-holds` | `platform.security.manage` | Legal hold |

Events: `ApiTokenCreated/Revoked`, `AssetQuarantined/Rejected`, `DeletionRequested/Completed/Blocked`, `OrgExportCompleted`.

## 6. UI
- Settings → API tokens (create once-shown modal, scopes picker, expiry).
- Settings → Data: export organization, delete project/org with dependency warnings (FR-PRJ-091) and typed confirmation.
- Asset UI shows "scanning…/quarantined/rejected" states.

## 7. Implementation tasks (ordered checklist)
1. [ ] Decide RLS (spike on 3 tables) and retention defaults; record ADR updates.
2. [ ] API tokens + service identities + auth strategy accepting tokens on API routes only (not web session routes).
3. [ ] Headers/CSP/CSRF/rate-limit hardening; verify Next.js works with nonce CSP.
4. [ ] ClamAV integration in asset pipeline (I09 hook) with quarantine flow.
5. [ ] SSRF guard for outbound URLs (webhooks, provider endpoints configured by admins).
6. [ ] Org export job; deletion pipeline with protected-record rules; retention jobs scheduled (BullMQ repeatable).
7. [ ] Expand security test suite (TR-SEC-010..020) incl. caches/SSE/storage keys.
8. [ ] Security scans in `pnpm verify:security`; gitleaks config.
9. [ ] Pen-test checklist run; fix or log findings; incident response doc.
10. [ ] PROGRESS.md.

## 8. Tests
- Security integration: horizontal & vertical escalation across all resource types; token scope enforcement; revoked token rejected within target (NFR-SEC-007); CSRF missing → 403; SSRF to 169.254.169.254 / 10.0.0.0/8 blocked; EICAR test file quarantined & rejected; export excludes inaccessible projects (TR-SEC-019); deletion preserves released tech packs/invoices and blocks under legal hold; authz dependency down → fail closed (TR-SEC-017).
- Automated: `pnpm verify:security` green.

## 9. Acceptance criteria
- [ ] AC1 — Scoped, revocable, expiring API tokens shown once, audited (FR-SEC-146..153).
- [ ] AC2 — Service identities least-privilege; worker not running as admin (FR-SEC-155, FR-SEC-158).
- [ ] AC3 — Uploads scanned before processing; unsafe content quarantined (FR-SEC-176, AC-RV-016).
- [ ] AC4 — Cross-tenant isolation verified across DB, storage, caches, search, jobs, exports, SSE (FR-SEC-216..220, AC-SEC-002, AC-SEC-016).
- [ ] AC5 — Org export and deletion are permissioned, governed, retention-aware and distinguish revocation/logical/anonymization/physical deletion (FR-SEC-141..145, FR-PRJ-089..092).
- [ ] AC6 — Security headers, CSRF, rate limits verified; no secrets in repo (FR-SEC-049, FR-SEC-169).
- [ ] AC7 — Pen-test checklist completed; incident process documented (TR-SEC-025, NFR-SEC-017); SPEC-009 §30 DoD items checked.

## 10. Risks & notes
- CSP with Next.js + Three.js/Konva may need `worker-src blob:` and `img-src blob: data:` — test editor & 3D thoroughly.
- Physical erasure is irreversible: dry-run mode + dependency report first; never erase audit/financial records required for retention.

## 11. Handoff
- I48 runs ClamAV in prod compose and wires retention jobs; record RLS decision and retention periods in PROGRESS.md.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
