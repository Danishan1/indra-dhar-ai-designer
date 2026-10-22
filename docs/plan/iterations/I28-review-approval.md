# I28 — Review & approval workflow

| Field | Value |
|---|---|
| Phase | 5 — Review, approval & notifications |
| Subsystems | SS-02 Project Lifecycle (`reviews` module), SS-01 Authorization, SS-04 Editor, SS-17 Audit |
| Depends on | I19 (revision history/compare UI), I07 (authorization), I08 (step-up/audit) |
| Estimated sessions | 2 |
| Spec references | `docs/init/06-project-lifecycle.md` §4.3, §6.5, §7.2–7.3, §8.6 (FR-PRJ-049…062), §9.2–9.3, §10.2, §12, §16.2–16.3, §16.7, AC-006/014/015; `docs/init/07-editor.md` §14 (FR-EDT-093…099); `docs/init/09-specification.md` §11.6 (FR-SEC-101…105), §12.1 (FR-SEC-112/113); `docs/init/03-artifact-schema.md` §18 (APR-001…005) |
| Open decisions to resolve first | Self-approval default (see `05-decisions.md` §3 — SoD configurable, default off for design review) |

## 1. Goal
Let a user submit an exact committed design revision for review, let authorized reviewers approve / request changes / reject with comments anchored to components or regions, and record approvals that are permanently bound to that revision. After this iteration the platform distinguishes "latest committed", "latest approved" and "current working state", and editing after approval never silently carries the approval forward.

## 2. Scope
### In scope
- `ReviewRequest`, `ApprovalRecord` (decision record), `ReviewComment` tables per `03-domain-model.md`.
- Commands: `SubmitRevisionForReview`, `RecordReviewDecision`, `RevokeApproval`, `CancelReviewRequest`, list review history per revision/design.
- Approval types: `design_review` and `sample_review` active; `production_spec_review` / `production_release` reserved for I43 (same tables).
- Review eligibility checks (revision exists, immutable, not already under an open review of the same type, configurable prerequisites e.g. "no blocking validation findings" from I20).
- Separation-of-duties policy in `SecurityPolicy` (org-level): `design_review.require_different_approver` (default false) — when true the revision author and the submitter cannot approve (FR-SEC-102, FR-PRJ-061).
- Design status derivation: `DRAFT → IN_REVIEW → APPROVED | CHANGES_REQUESTED`; `approved_revision_id` updated on approval; status derived from explicit records (§7.3).
- Approval revocation with actor, time, reason; original decision preserved (FR-PRJ-059).
- Idempotent decisions (Idempotency-Key); concurrent decisions on the same review resolved by row lock + state check.
- Editor review mode: banner showing the exact revision under review, "not latest" warning when a newer revision exists (§16.3), comments pinned to component IDs or annotation regions (from I27), approve / request-changes buttons only for authorized users.
- Outbox events: `RevisionSubmittedForReview`, `ReviewDecisionRecorded`, `ApprovalRevoked`.

### Out of scope (deferred to)
- Notifications delivery for these events (→ I29; events are emitted now).
- Multi-stage / configurable multi-approver workflows (→ backlog).
- Spec / tech-pack reviews (→ I43, reusing this module).
- External (supplier/customer) reviewers (→ I43/I47).

## 3. Deliverables
- `apps/api/src/modules/reviews/` (controller, service, repository, policy evaluator, events)
- `packages/contracts/src/reviews.ts` (zod DTOs, enums `ReviewDecision`, `ApprovalType`)
- Permission catalog additions: `design.submit_review`, `design.approve`, `design.revoke_approval`, `review.comment`, `review.view`
- `apps/web/src/features/reviews/` — review panel, decision dialog, review history list, approval badges
- Migration `…_i28_reviews`

## 4. Data model changes
- `review_requests` (organization_id, design_id, revision_id, approval_type, status `open|decided|cancelled`, submitted_by, policy_version, idempotency key)
- `approval_records` (review_request_id, revision_id, approval_type, decision, decided_by, comments, policy_version, revoked_at/by/reason) — **append-only except revocation columns**; DB trigger forbids changing decision/revision/decided_by.
- `review_comments` (review_request_id, target JSONB `{componentId?|annotationId?|general}`, body, author, resolved_at)
- `designs.approved_revision_id` maintained by the reviews service via the designs service facade.
- `security_policies.config` gains `separationOfDuties` block.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{designId}/revisions/{revisionId}/reviews` | `design.submit_review` | Submit exact revision for review (Idempotency-Key) |
| `GET /v1/designs/{designId}/reviews?revisionId=` | `review.view` | Review history |
| `GET /v1/reviews/{reviewId}` | `review.view` | Review detail incl. comments & decisions |
| `POST /v1/reviews/{reviewId}/decisions` | `design.approve` | APPROVE / REQUEST_CHANGES / REJECT (+comment; Idempotency-Key) |
| `POST /v1/reviews/{reviewId}/comments` | `review.comment` | Add comment anchored to component/region |
| `POST /v1/approvals/{approvalId}/revoke` | `design.revoke_approval` (+ step-up) | Revoke with reason |
| `POST /v1/reviews/{reviewId}/cancel` | `design.submit_review` | Submitter cancels open review |

Error codes: `REVISION_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `SEPARATION_OF_DUTIES_VIOLATION`, `VALIDATION_BLOCKED`, `IDEMPOTENCY_CONFLICT`.
Events emitted: `RevisionSubmittedForReview`, `ReviewDecisionRecorded`, `ApprovalRevoked` (outbox).

## 6. UI
- Revision history panel: per-revision chips "In review", "Approved (design_review) by X", "Changes requested".
- Header shows three distinct pointers: working state, latest committed, latest approved (NFR-PRJ-013, FR-EDT-099).
- Review mode in editor: read-only canvas of the reviewed revision, comment pins on components/regions, decision dialog with required comment for REJECT/REQUEST_CHANGES (configurable).
- Approval/decision actions hidden for unauthorized users — backend still enforces.

## 7. Implementation tasks (ordered checklist)
1. [ ] Add permissions & role mappings (Design Lead, Approver get `design.approve`; Designer gets `design.submit_review`).
2. [ ] Migration + immutability trigger for `approval_records`.
3. [ ] Policy evaluator: eligibility (revision committed, prerequisites from I20 findings per policy), SoD rule, reviewer permission.
4. [ ] Service commands in single transactions writing audit + outbox events.
5. [ ] Derived design-status computation and `approved_revision_id` update via designs facade.
6. [ ] Revocation flow (step-up required per FR-SEC-040 policy hook).
7. [ ] Controllers + OpenAPI; tenant isolation tests.
8. [ ] Web: review panel, decision dialog, comment pins, pointers in header.
9. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: policy evaluator (SoD on/off, author vs submitter vs approver), status derivation.
- Integration: approval bound to revision; committing R6 during open review of R5 leaves decision on R5 (AC-015); post-approval edit → new revision not approved (AC-006); duplicate decision with same key returns same result; conflicting concurrent decisions → one wins, other gets `INVALID_STATE_TRANSITION`; revocation keeps original record; cross-tenant 404.
- E2E: designer submits, approver (second user) approves; designer edits, commits, sees "requires review".

## 9. Acceptance criteria
- [ ] AC1 — A review always references one exact revision ID and approval type (FR-PRJ-050/051/056).
- [ ] AC2 — Approval of R5 is never transferred to R6 even if R6 is committed before the decision (AC-015, FR-PRJ-057).
- [ ] AC3 — With SoD enabled, the author cannot approve their own revision; backend returns `SEPARATION_OF_DUTIES_VIOLATION` (FR-SEC-102, AC-SEC-014).
- [ ] AC4 — Revocation records actor/time/reason and the original approval remains visible in history (FR-PRJ-059, FR-PRJ-062).
- [ ] AC5 — UI distinguishes working state, latest committed and latest approved revisions (FR-EDT-099).
- [ ] AC6 — Every decision produces an audit event with revision, approver, decision, timestamp, policy version (AC-014).
- [ ] AC7 — Retrying a decision request with the same Idempotency-Key creates no duplicate record (FR-PRJ-096).

## 10. Risks & notes
- Do not store review status on the revision row — revisions are immutable; derive from records (§7.3).
- AI success must never create an approval (FR-PRJ-048).
- Reviewer may act on a historical revision only with explicit "not latest" disclosure.

## 11. Handoff
- I29 consumes the three events to notify submitter/reviewers.
- I38/I43 reuse `reviews` with `production_spec_review` / `production_release` approval types.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
