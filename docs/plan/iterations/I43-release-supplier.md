# I43 — Spec review, release, change impact & supplier access

| Field                           | Value                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 8 — Tech pack & production specification                                                                                                                                                                                                                                                                                  |
| Subsystems                      | SS-15 Tech Pack, SS-02 Reviews, SS-01 Identity (guest accounts, grants), SS-16 Notifications, SS-17 Audit                                                                                                                                                                                                                 |
| Depends on                      | I42, I29 (notifications); uses I28 review engine                                                                                                                                                                                                                                                                          |
| Estimated sessions              | 2–3                                                                                                                                                                                                                                                                                                                       |
| Spec references                 | `docs/init/08-tech-pack.md` §7 (FR-TP-004..013), §23, §24 (FR-TP-145..153), §26, §27, §30, AC-TP-008..010, AC-TP-012..014; `docs/init/06-project-lifecycle.md` FR-PRJ-074..082, §9.5; `docs/init/09-specification.md` §12.3 (FR-SEC-120..125), §24.3, FR-SEC-101..105; `docs/plan/05-decisions.md` §3 (supplier identity) |
| Open decisions to resolve first | Separation-of-duty default for production release (default: enabled — releaser ≠ last editor)                                                                                                                                                                                                                             |

## 1. Goal

Close the production loop: specification revisions go through technical review and approval, an authorized user releases an exact approved revision with an immutable release manifest, later releases supersede earlier ones without rewriting them, releases can be withdrawn with reasons, design changes trigger an explicit impact assessment instead of silent edits, and suppliers receive scoped, expiring, revocable access to the released package only.

## 2. Scope

### In scope

- Spec lifecycle transitions: `validated → needs_review → changes_requested | approved → released → superseded | withdrawn`; reopening creates a new editable revision (FR-TP-004..013, FR-TP-137).
- Reuse I28 review engine with `approval_type=production_spec_review` and `production_release`; findings on fields/sections/records (FR-TP-005); SoD policy (FR-SEC-103).
- Release gate: approved revision + fresh READY/READY_WITH_WARNINGS readiness per policy + successful locked exports (FR-TP-009, FR-TP-139, FR-PRJ-074, FR-PRJ-075, FR-PRJ-080); step-up auth for release (FR-SEC-040).
- **Release manifest** (FR-TP-140): spec revision, source design revision, artifact revisions, rule-set version, template revision, export artifact ids + checksums, readiness run id, exceptions; release record immutable; exports locked.
- Supersession & withdrawal (FR-TP-011, FR-TP-012, FR-TP-143, FR-TP-144); superseded warning on access.
- Change impact: on new design revision (or artifact revision replacement), compute affected sections by diffing design revisions (I12 diff) → map changed components/artifacts to BOM, POM, construction, placements, views (FR-TP-021, FR-TP-149, FR-TP-150, AC-TP-012); mark released export "potentially outdated" (FR-PRJ-082); never auto-edit.
- Spec revision comparison at section/field/record level (FR-TP-146); change reason capture where policy requires (FR-TP-148).
- **Supplier access**: restricted guest accounts (email-verified invitation) with `DistributionGrant` per release: scope, expiry, revocation, access log; supplier sees only released revision + supplier-profile exports; costing excluded (FR-TP-142, FR-TP-167..170, FR-TP-183, FR-SEC-098..100, FR-SEC-124, FR-SEC-125).
- Supplier comments linked to release (FR-TP-174) — comments only; proposed changes enter internal review (FR-TP-175).
- Notifications on review requests, decisions, release, supersede, withdraw, grant (FR-TP-141).

### Out of scope (deferred to)

- PLM/ERP/API distribution (FR-TP-171..173 → backlog)
- Structured supplier change workflows beyond comments (→ backlog)

## 3. Deliverables

- `apps/api/src/modules/techpack/{release.service, impact.service, distribution.service, spec-review.adapter}.ts` + controllers
- `apps/api/src/modules/identity/guest-accounts` (restricted principal type `external_supplier`)
- `apps/web/src/features/techpack/{review,release,impact,distribution}/`
- `apps/web/src/app/(supplier)/…` minimal supplier portal: list grants → view released package → download
- Notification templates for release events

## 4. Data model changes

- `ReleaseRecord` (immutable; superseded_by, withdrawn_at, withdrawal_reason, withdrawn_by).
- `DistributionGrant` (release_record_id, recipient_user_id, organization_id, scope, expires_at, revoked_at, revoked_by) + `DistributionAccessLog`.
- `ImpactAssessment` (spec_id, from_design_revision_id, to_design_revision_id, affected_sections JSONB, status `open|reviewed|dismissed`, decided_by).
- `User` principal type flag for guest supplier accounts; `Membership` role `supplier_external` restricted.
- Lock trigger on `ExportArtifact.locked_at`.

## 5. API / contracts

| Method & path                                                               | Permission                             | Purpose                                |
| --------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `POST /v1/spec-revisions/{revId}:submit-review`                             | `techpack.edit`                        | Submit for technical review            |
| `POST /v1/spec-reviews/{reviewId}/decisions`                                | `techpack.review` / `techpack.approve` | Approve / request changes / reject     |
| `POST /v1/spec-revisions/{revId}:release`                                   | `techpack.release` (+ step-up)         | Release with manifest; Idempotency-Key |
| `POST /v1/releases/{releaseId}:withdraw`                                    | `techpack.withdraw`                    | Withdraw with reason                   |
| `GET /v1/specifications/{specId}/releases`                                  | `techpack.view`                        | Release history, current release       |
| `GET /v1/spec-revisions/{a}/compare/{b}`                                    | `techpack.view`                        | Revision diff                          |
| `GET /v1/specifications/{specId}/impact-assessments` / `POST …/{id}:decide` | `techpack.view` / `techpack.edit`      | Impact review                          |
| `POST /v1/releases/{releaseId}/grants` / `DELETE …/grants/{grantId}`        | `techpack.distribute`                  | Supplier grants                        |
| `GET /v1/supplier/grants`, `/v1/supplier/releases/{id}`                     | supplier principal + valid grant       | Supplier portal                        |

Events: `TechPackReleased`, `TechPackSuperseded`, `TechPackWithdrawn`, `SpecImpactDetected`, `DistributionGranted`, `DistributionRevoked`.

## 6. UI

- Review panel in spec workspace (findings anchored to fields/records).
- Release wizard: checklist (approval ✔, readiness ✔ with rule-set version, exports ✔), manifest preview, step-up prompt.
- Release history with superseded/withdrawn badges; superseded warning banner when viewing old release.
- Impact assessment view: affected sections list with links; "create new spec revision" action.
- Distribution tab: invite supplier email, expiry date, revoke, access log.
- Supplier portal: minimal, branded neutral, read-only.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm SoD default; record.
2. [ ] Lifecycle state machine transitions + guard tests.
3. [ ] Review adapter on top of I28 with spec-specific findings targets.
4. [ ] Release service (transaction: release record + lock exports + manifest + outbox + audit), idempotent.
5. [ ] Supersede / withdraw logic; current-release resolution.
6. [ ] Impact service consuming `RevisionCommitted`/approval events; component→section mapping; potentially-outdated flag.
7. [ ] Spec revision compare.
8. [ ] Guest supplier accounts + grants + access checks on every request/download; revoke immediate.
9. [ ] Supplier portal pages; notification templates.
10. [ ] Tests; PROGRESS.md.

## 8. Tests

- Integration: draft cannot be released (TR workflow tests §31.3); unauthorized approve rejected by backend (AC-TP-008); release record identifies exact spec/design/template/export (AC-TP-010); design change after release leaves release & export unchanged (AC-TP-009) and creates impact assessment flagging sleeve-related sections (AC-TP-012); new release supersedes prior which remains retrievable (AC-TP-014); withdrawal auditable; retrying release with same key → one record; supplier sees only granted release, no costing (AC-TP-013); revoked/expired grant → 404 on download.
- Security: supplier principal cannot access projects, designs or other org data (cross-tenant/role suite).
- E2E: full SPEC-008 §30 scenario steps 12–20.

## 9. Acceptance criteria

- [ ] AC1 — Approval applies to an exact spec revision; changes require a new revision (FR-TP-136, FR-TP-137, FR-TP-013).
- [ ] AC2 — Release requires authorization, validation and approval; creates immutable manifest (FR-TP-139, FR-TP-140, FR-TP-010).
- [ ] AC3 — Supersession and withdrawal preserve history and reasons (FR-TP-011, FR-TP-012, FR-TP-144, AC-TP-014).
- [ ] AC4 — Design changes trigger impact assessment without rewriting released packages (FR-TP-149, FR-TP-150, FR-TP-151, AC-TP-012, FR-PRJ-082).
- [ ] AC5 — Supplier access explicit, scoped, expiring, revocable, audited; restricted commercial data excluded (FR-TP-167..170, FR-TP-183, AC-TP-013, FR-SEC-125).
- [ ] AC6 — SoD enforceable for release (FR-SEC-103); release audited (FR-TP-178).
- [ ] AC7 — Stakeholders notified on release/supersede/withdraw (FR-TP-141).

## 10. Risks & notes

- Guest supplier identity must not become an org member with normal roles; deny by default on all non-supplier routes.
- Release must be a single DB transaction; notifications after commit only (FR-PRJ-097).

## 11. Handoff

- I44 adds AI drafting into draft revisions; I47 adds API-token-based distribution later; record SoD default and portal URL in PROGRESS.md. **M8 nearly reached** after I44.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
