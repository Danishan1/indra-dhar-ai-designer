# 09 — Backlog (post-I49 and deferred items)

Items deliberately left out of the 49 iterations, with the spec references that ask for them. Each becomes one or more new iterations (I50+) when prioritized. Iterations may append deferred work here (with date and source iteration).

| ID   | Item                                                                                                                       | Spec refs                                                          | Why deferred / prerequisite                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| B-01 | Branch creation, branch isolation & merge with conflict detection                                                          | SPEC-006 FR-PRJ-035…038, Phase 4; SPEC-003 open decision 10        | OD-PRJ-003 recommends deferral; ADR-018 single working copy |
| B-02 | Real-time multi-user co-editing (presence, CRDT/OT)                                                                        | SPEC-007 Phase 4, FR-EDT-085; SPEC-010 §14.3                       | Needs WebSockets (T-03 justification)                       |
| B-03 | Editable 3D geometry (3D-L2 / G4, S3 sync)                                                                                 | SPEC-007 §16.2; SPEC-010 §10.2, §14.2                              | ADR-019 viewer-only first release                           |
| B-04 | Pattern-linked 3D (G5, S4), pattern-engine integration, external grading software import                                   | SPEC-010 Phase 4; SPEC-008 FR-TP-069                               | Needs pattern engine decision                               |
| B-05 | Cloth simulation with physical material parameters (3D-L4)                                                                 | SPEC-010 §13; SPEC-007 FR-EDT-115                                  | Needs validated material data                               |
| B-06 | AI geometry generation / image-to-vector reconstruction pipeline                                                           | SPEC-004 §8.1 `geometry_generation`; SPEC-010 FR-RV-043, FR-RV-069 | Separate capability with own validation                     |
| B-07 | Enterprise SSO (OIDC/SAML), SCIM provisioning, conditional access                                                          | SPEC-009 Phase 3, FR-SEC-029                                       | Confirm enterprise demand (OD-SEC-009)                      |
| B-08 | Custom roles UI (beyond predefined roles)                                                                                  | SPEC-009 FR-SEC-092, OD-SEC-005                                    | After baseline model proven                                 |
| B-09 | PLM / ERP / supplier-system integrations, versioned integration APIs                                                       | SPEC-008 FR-TP-171…173, Phase 4                                    | Customer-driven                                             |
| B-10 | Structured supplier change requests & substitution workflow                                                                | SPEC-008 FR-TP-174…175, OD-TP-007                                  | Start with comments (I43)                                   |
| B-11 | Multi-currency pricing & FX                                                                                                | SPEC-005 PRICE-007/008, Phase 3                                    | Launch single currency                                      |
| B-12 | Advanced pricing tiers, per-model pricing, profitability reporting, cost anomaly detection                                 | SPEC-005 Phase 3                                                   | After commercial beta data                                  |
| B-13 | Project-level and user-level budgets, spend approval workflows                                                             | SPEC-005 §18.1, Phase 3                                            | Org budgets first (I30)                                     |
| B-14 | Accounting-system integration / financial exports                                                                          | SPEC-005 §2.2                                                      | Out of scope v1                                             |
| B-15 | Artifact marketplace / cross-organization sharing                                                                          | SPEC-003 open decision 6, FR-SEC-118/221                           | Needs licensing policy                                      |
| B-16 | Data residency per organization                                                                                            | SPEC-004 §30.11, OD-SEC-014                                        | Infra-dependent                                             |
| B-17 | Model quality evaluation datasets, controlled rollouts, adaptive cost/quality routing                                      | SPEC-004 §27.4, Phase 4                                            | Needs usage data                                            |
| B-18 | Python processing service (segmentation, advanced CV)                                                                      | TECH §3.9                                                          | Only when a concrete requirement proves it                  |
| B-19 | Multi-stage / configurable approval workflows (sample-order gate)                                                          | SPEC-006 Phase 4, OD-PRJ-012                                       | Basic review first (I28)                                    |
| B-20 | Legal hold & enterprise retention policies UI                                                                              | SPEC-006 FR-PRJ-090, Phase 4                                       | Basic retention in I47                                      |
| B-21 | Mobile/tablet-optimized editor                                                                                             | SPEC-007 FR-EDT-007                                                | Desktop-first                                               |
| B-22 | Additional garment categories (dresses, trousers, kurta, outerwear…) with templates, POM libraries, construction templates | SPEC-003 §8.2; SPEC-008 OD-TP-001                                  | Template-driven; add per demand after ADR-008 set           |

## Deferred during the build

_(Append: date — source iteration — item — reason)_

- none yet

## From I05 (2026-10-22)

- Compromised-password check on register/reset/change (FR-SEC-019, SHOULD): HIBP range API (k-anonymity) behind a pluggable `PasswordBreachChecker`, fail-open with audit. → I08 or I47.
- Worker sweep for expired `verification_tokens` and expired `sessions` rows. → I08 (session management).
- Hashed session tokens at rest once Better Auth supports it (ADR-006 gap 1). → watch per Better Auth upgrade.

## From I06 (2026-10-23)

- Short-TTL membership cache invalidated by `organizations.membership_*` events — only if profiling shows the per-request membership query matters (NFR-SEC-007). → I07 or later.
- Workspace UI and workspace-scoped role grants (schema exists, ADR-017). → when a customer needs it.
- Invitation for an email without an account: sign-up link with the email prefilled and an automatic return to the invitation. → I47 (UX polish).
- Platform-admin organization suspension/deletion (never ownership takeover, FR-SEC-083). → I45.

## From I07 (2026-10-23)

- Custom roles UI and API (`roles.manage`; schema + PDP already support organization-owned roles, FR-SEC-092). → when requested.
- Workspace-scoped role assignments (`membership_roles.scope_id`, ADR-017). → with workspace UI.
- Audit view limited to billing events for Billing admins ("Billing scope only", §23) — needs audit filtering by category. → I46.
- Admin-delegable roles: Admins cannot assign Merchandiser/Production roles by default (they lack `techpack.edit`); revisit if owners find it restrictive (security policy option). → I08 policy work.
- Platform-operator principal type and `platform.*` enforcement. → I45.
- Postgres RLS as defence in depth (ADR-004). → I47 evaluation.

## From I08 (2026-10-23)

- Passkeys / WebAuthn as a phishing-resistant factor, preferred for privileged accounts (FR-SEC-036, ADR-043 e). → when Better Auth's passkey support is evaluated, or I47.
- SSO/SCIM and conditional access (SPEC-009 Phase 3). → backlog.
- Self-service second-factor reset with identity proofing; operator tooling for the runbook steps. → I45.
- Admin notifications for critical membership/ownership/policy changes (FR-SEC-228) and credential admins (FR-SEC-229). → I29 (notifications).
- Audit retention configuration (FR-SEC-183) and audit export (`audit.export`). → I46.
- Anomaly alerts on repeated denials / role escalation (FR-SEC-184). → I46.
- Org admin "sign out this member everywhere" (today: suspend/revoke takes effect immediately for the org, FR-SEC-056). → if requested.
- Idle-timeout precision is bounded by `SESSION_TOUCH_INTERVAL_MIN` (org idle minimum = touch + 5 min); a lighter last-seen tracker could lift that. → I46.

## From I09 (2026-10-26)

- Presigned direct browser → bucket PUT (`presignPut` + CORS on the bucket) for very large files; today uploads stream through the API (ADR-044). → when files > 50 MB are needed (I36 GLB?).
- ClamAV adapter for the `Scanner` port and a `clamd` compose service (ADR-029). → I47.
- Retention purge job: hard-delete soft-deleted assets after `retention_until`, orphaned `pending_upload` rows and objects. → I47.
- Validate `projectId` on uploads and filter by project (upload currently refuses `projectId`). → I12 (project sources arrive with designs; needs a project-existence check via `ProjectsService`).
- Signed-URL thumbnails with refresh on expiry (today thumbnails stream same-origin through the API); revisit when a CDN/reverse proxy is in place. → I48.
- Color-space/ICC metadata extraction and normalized previews for CMYK sources. → I23 (AI input preparation).

## From I10 (2026-10-26)

- Trigram (`pg_trgm`) index for project search once lists grow past a few thousand rows per org. → I48.
- Duplicate project should also copy designs (latest approved/working revision) and sources. → I12.
- Dependents counts (designs, revisions, tech packs) and completion checks (unresolved reviews): modules call `ProjectLifecycleRegistry`. → I12, I28.
- Physical erasure of deleted projects after retention. → I47.
- Grant expiry in the Access tab (API supports `expiresAt`; UI does not set it). → I28.
- Project thumbnails/cover image on cards. → I35.
- Move the Files page into project Sources; wire `projectId` on uploads. → I12.
- Bulk lifecycle actions and saved filters on the dashboard. → unscheduled.
