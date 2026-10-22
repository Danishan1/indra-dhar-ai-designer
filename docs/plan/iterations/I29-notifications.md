# I29 — Notifications (in-app & email)

| Field                           | Value                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 5 — Review, approval & notifications                                                                                                                                                                                                                                                              |
| Subsystems                      | SS-16 Notification, SS-17 Audit, consumers of SS-02/SS-09/SS-13/SS-01 events                                                                                                                                                                                                                      |
| Depends on                      | I28 (review events), I03 (outbox/processed_events), I21 (job events), I24 (quota events), I08 (security events)                                                                                                                                                                                   |
| Estimated sessions              | 1–2                                                                                                                                                                                                                                                                                               |
| Spec references                 | `docs/init/01-overview.md` §6 (Notification Engine); `docs/init/06-project-lifecycle.md` §8.10 (FR-PRJ-060, 097, 098), §10.3–10.4; `docs/init/09-specification.md` §19 (FR-SEC-226…232); `docs/init/04-ai-prompt.md` §21 (job events); `docs/init/05-ai-usage-metering.md` §18 (BUD-003 warnings) |
| Open decisions to resolve first | ADR-013 (SMTP provider choice for production can wait until I48; Mailpit in dev)                                                                                                                                                                                                                  |

## 1. Goal

Deliver a reliable, outbox-driven notification subsystem with an in-app inbox and email channel, so users learn about review requests, decisions, job completion/failure, quota warnings and security events — only after the underlying action is durably committed, never duplicated, and never carrying secrets.

## 2. Scope

### In scope

- `Notification`, `NotificationDelivery`, `NotificationPreference` tables.
- Notification router: idempotent outbox consumer mapping domain events → recipients → notification types (unique `(recipient, source_event_id, type)`).
- Channels: `in_app` (DB + SSE push to header bell) and `email` (Nodemailer via SMTP, BullMQ `email` queue, retries with backoff, ADR-013).
- Templates (React Email or MJML/handlebars, decided in-session; keep simple) with per-type subject/body; links point to authenticated routes (FR-SEC-231).
- Preferences per user per type/channel; mandatory security notifications cannot be disabled.
- Initial event wiring: `RevisionSubmittedForReview`, `ReviewDecisionRecorded`, `ApprovalRevoked`, `ai.job.completed`/`failed`/`awaiting_review`, `ai.provider.outcome_unknown`, allowance/budget threshold events from metering (BUD-003), security events (new login, MFA change, password change, role change, membership revoked).
- Recipient resolution re-checks current membership/permissions at send time.

### Out of scope (deferred to)

- Push/mobile, Slack/webhook channels (→ backlog).
- Spec release/supersession notifications (→ I43 wires them using this module).
- Digest emails (→ backlog).

## 3. Deliverables

- `apps/api/src/modules/notifications/` (router consumer, service, controller, preferences)
- `apps/worker/src/processors/email.processor.ts`
- `apps/api/src/modules/notifications/templates/*`
- `packages/contracts/src/notifications.ts` (types enum, DTOs)
- `apps/web/src/features/notifications/` (bell, inbox drawer, preferences page)
- Migration `…_i29_notifications`

## 4. Data model changes

- `notifications` (organization_id, recipient_user_id, type, payload JSONB — references & display strings only, source_event_id, read_at, created_at; unique (recipient_user_id, source_event_id, type))
- `notification_deliveries` (notification_id, channel, status `pending|sent|failed|suppressed`, attempts, last_error_code, sent_at)
- `notification_preferences` (user_id, organization_id?, type, channels[])

## 5. API / contracts

| Method & path                             | Permission               | Purpose             |
| ----------------------------------------- | ------------------------ | ------------------- |
| `GET /v1/notifications?cursor=&unread=`   | authenticated (own only) | Inbox               |
| `POST /v1/notifications/{id}/read`        | own                      | Mark read           |
| `POST /v1/notifications/read-all`         | own                      | Mark all read       |
| `GET /v1/notifications/stream`            | own (SSE)                | Live unread updates |
| `GET/PUT /v1/me/notification-preferences` | own                      | Preferences         |

Events consumed: listed in §2. Events emitted: none (deliveries logged to audit for security types).

## 6. UI

- Header bell with unread count, inbox drawer grouped by day, deep links into review/job/billing pages.
- Settings → Notifications preferences table (type × channel), security rows locked on.

## 7. Implementation tasks (ordered checklist)

1. [ ] Schema + migration.
2. [ ] Notification type registry (type → recipients resolver → template → default channels → mandatory flag).
3. [ ] Outbox consumer with `processed_events` idempotency; creates notifications in one transaction.
4. [ ] Email queue processor with retries/backoff; delivery failure never touches source records (FR-SEC-232).
5. [ ] Payload sanitizer: whitelist fields; assert no secret-like keys (test).
6. [ ] SSE stream + inbox endpoints.
7. [ ] Web bell, drawer, preferences.
8. [ ] Wire initial event types; update PROGRESS.md.

## 8. Tests

- Unit: recipient resolvers (reviewers, submitter, org admins for security), template rendering, payload sanitizer.
- Integration: event delivered twice → one notification; email failure retried then marked failed without affecting review/job state; rolled-back transaction emits no event → no notification (FR-PRJ-097); revoked member receives nothing; cross-tenant isolation of inbox.
- E2E: approver gets in-app notification when review submitted; email visible in Mailpit.

## 9. Acceptance criteria

- [ ] AC1 — Notifications are created only from committed outbox events (FR-PRJ-097).
- [ ] AC2 — Duplicate event delivery or email retries do not duplicate notifications or underlying actions (FR-PRJ-098).
- [ ] AC3 — Payloads and emails contain no secrets, tokens or credential values (FR-SEC-230).
- [ ] AC4 — Email links lead to authenticated, authorized routes and grant no access by themselves (FR-SEC-231).
- [ ] AC5 — Review requests/decisions, job completion/failure, quota warnings and security events notify the right users (FR-PRJ-060, FR-SEC-226…229, BUD-003).
- [ ] AC6 — Users can manage optional notification preferences; mandatory security notices remain on.

## 10. Risks & notes

- Keep templates text-light; never include design images inline in email (confidential data).
- Use Mailpit in dev/test; real SMTP only via env in deployment.

## 11. Handoff

- I43 adds release/supersession/withdrawal notification types; I34 adds reconciliation alerts for operators; I47 adds export-ready notices.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
