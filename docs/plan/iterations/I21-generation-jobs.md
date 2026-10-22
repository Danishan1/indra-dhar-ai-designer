# I21 — Generation job management & progress (SSE)

| Field                           | Value                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 4 — AI execution & metering foundation                                                                                                                                                                                                                                                                                                                                                               |
| Subsystems                      | SS-09 Generation Job Management, SS-17 Audit/Observability, SS-01 (re-authorization)                                                                                                                                                                                                                                                                                                                 |
| Depends on                      | I03, I14                                                                                                                                                                                                                                                                                                                                                                                             |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                                                                                                    |
| Spec references                 | `docs/init/04-ai-prompt.md` §14 (job record, states, JOB-001…012), §20 (failures, retries, unknown outcomes ERR-001…012), §21 (events EVT-001…007), §24 (PERF-001…010), §25.4 (Workflow D); `docs/init/09-specification.md` FR-SEC-059, FR-SEC-110, FR-SEC-111, FR-SEC-203, §24.2; `docs/init/11-tech-stack.md` §3.5, §7; `docs/init/10-visualization.md` §16 (render job states — same table later) |
| Open decisions to resolve first | ADR-023 (single jobs table — confirm)                                                                                                                                                                                                                                                                                                                                                                |

## 1. Goal

Provide durable, auditable, recoverable **job infrastructure** for every long-running operation (AI generation, interpretation, later render/export/reconciliation): a single `jobs` table with `kind` discriminator, per-attempt records, the full SPEC-004 §14.3 state machine including `outcome_unknown`, BullMQ transport carrying only `jobId`, a recovery sweeper, cancellation, re-authorization at execution start, and an authenticated **SSE** progress stream for the editor. Executed end-to-end with a no-op/fake executor so I22–I25 only plug in real work.

## 2. Scope

### In scope

- Prisma: `Job`, `JobAttempt`, `Candidate` (schema only; populated in I25) per `03-domain-model.md`.
- `packages/contracts/jobs.ts`: job kinds (`ai_generation`, `ai_interpretation`, `render`, `export`, `reconciliation`, `test_noop`), states (SPEC-004 §14.3 exact spelling), substates, transition table, error categories (SPEC-004 §20.1).
- `JobStateMachine` (pure): allowed transitions; terminal states `succeeded|failed|cancelled`; `outcome_unknown` non-terminal but blocks blind resubmission (JOB-010); `awaiting_review` for candidate jobs.
- `jobs` module (api): create job (inside caller's transaction + outbox `ai.job.queued`), query, list by design, cancel request; `JobsService.transition(jobId, from, to, data)` with optimistic guard (`WHERE status = from`) to avoid duplicate processing.
- Worker: queue per kind (`ai`, `render`, `export`, `maintenance`) with configurable concurrency (per-provider limits arrive in I22); processor skeleton:
  1. load job; if not `queued`/`preparing` → ack & exit (idempotent);
  2. **re-authorize** initiating principal + org membership + resource access (FR-SEC-110, FR-SEC-203 policy: cancel with reason `AUTHORIZATION_REVOKED`);
  3. create `JobAttempt`; run executor registered for `kind`;
  4. persist transitions; emit events; on executor timeout where the external side effect may have happened → `outcome_unknown` (not `failed`) (ERR-003, ERR-005).
- Retry policy framework: per error category retryable flag, bounded attempts with backoff, retries linked to the same job (ERR-002, ERR-007, ERR-008); never auto-retry after `outcome_unknown` without reconciliation hook (implemented per adapter in I22).
- Recovery sweeper (repeatable BullMQ job): re-enqueue `queued` jobs missing from Redis, move `preparing/running` jobs whose heartbeat expired to `outcome_unknown` or back to `queued` depending on whether an external submission was recorded (JOB-009, PERF-003, PERF-007).
- Cancellation: `cancel_requested` → executor checks cooperative cancellation token; provider-side cancellation hook (I22); confirmed → `cancelled`; if provider may still run → stays `cancel_requested` with message "cancellation not guaranteed" (JOB-005, ERR-011).
- SSE: `GET /v1/jobs/{jobId}/events` and `GET /v1/designs/{designId}/job-events` (stream of job status for a design); auth on connect, tenant check, heartbeat comments every 15 s, resumable via `Last-Event-ID`; events sourced from Redis pub/sub fed by worker after DB commit (job status visible < 2 s, TECH §9.5).
- `test_noop` executor + dev endpoint to enqueue it (non-production) to prove the pipeline.
- Metrics hooks (queue depth, wait time, duration, failure counts) via logger now; OTel in I46.

### Out of scope (deferred to)

- Provider adapters, compilation (→ I22, I23); usage reservation/settlement hooks (→ I24, but add executor lifecycle hooks `beforeSubmit`, `afterAttempt` now)
- Editor progress UI (→ I25; build only a minimal dev job viewer page)

## 3. Deliverables

- `packages/contracts/src/jobs.ts`; `apps/api/src/modules/jobs/{jobs.module.ts, jobs.service.ts, jobs.controller.ts, jobs.repository.ts, state-machine.ts, sse.controller.ts}`
- `apps/worker/src/{queues.ts, processors/job-processor.ts, executors/registry.ts, executors/test-noop.ts, sweeper.ts, publisher.ts}`
- Migration `…_i21_jobs`
- Dev page `apps/web/src/app/(app)/dev/jobs/page.tsx` (flagged)

## 4. Data model changes

**Extend** the generic `Job`/`JobAttempt` tables created in I03 (ADR-023) — do not create new job tables. Add/adjust columns as listed:
`Job` (display_id `JOB-…`, kind, operation_id, design_id, base_revision_id, base_working_copy_version, status, substatus, credential_ownership_mode, provider_id, model_id, compilation_record_id, output_asset_ids, validation JSONB, review_required, correlation_id, initiated_by, failure JSONB, heartbeat_at, queued_at/submitted_at/started_at/completed_at, kind_data JSONB), `JobAttempt`, `Candidate`. Indexes: `(organization_id, design_id, created_at)`, `(status, heartbeat_at)`.

## 5. API / contracts

| Method & path                                 | Permission                                                | Purpose                |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------- |
| `GET /v1/jobs/{jobId}`                        | `design.view` on job's design (or kind-specific resource) | Status (JOB-012)       |
| `GET /v1/designs/{designId}/jobs`             | `design.view`                                             | List                   |
| `POST /v1/jobs/{jobId}/cancel`                | `design.generate`                                         | Request cancellation   |
| `GET /v1/jobs/{jobId}/events` (SSE)           | as GET                                                    | Progress stream        |
| `GET /v1/designs/{designId}/job-events` (SSE) | `design.view`                                             | Design-wide job stream |

Events (outbox, versioned): `ai.job.queued`, `ai.job.started`, `ai.provider.submission_accepted`, `ai.provider.outcome_unknown`, `ai.job.progress_updated`, `ai.job.output_received`, `ai.job.validation_completed`, `ai.job.awaiting_review`, `ai.job.completed`, `ai.job.failed`, `ai.job.cancelled` (SPEC-004 §21.1). Completion event states whether a candidate was produced, a revision committed, or nothing applied (EVT-007).

## 6. UI

Dev-only job viewer listing jobs with live SSE status (for manual testing). Real UI in I25.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-023; write state machine + transition tests first.
2. [ ] Prisma models + migration; display ids.
3. [ ] JobsService create/transition/cancel with guarded updates & outbox events.
4. [ ] Worker queues, processor, executor registry, re-authorization step, heartbeat.
5. [ ] Retry framework; error category mapping.
6. [ ] Sweeper (restart recovery); chaos test: kill worker mid-job.
7. [ ] SSE endpoints + Redis pub/sub bridge; auth & tenant checks; Last-Event-ID resume.
8. [ ] test_noop executor + dev page.
9. [ ] Update PROGRESS.md.

## 8. Tests

- Unit: transition table (illegal transitions rejected); retry eligibility per category.
- Integration: duplicate BullMQ delivery processes once; worker crash → sweeper recovers (no lost job); user removed from org before execution → job cancelled with `AUTHORIZATION_REVOKED`; timeout in executor flagged as possibly-executed → `outcome_unknown`, no auto-resubmit; SSE stream rejects other-tenant user; job status query isolated by tenant (JOB-008).

## 9. Acceptance criteria

- [ ] AC1 — Every accepted job has a durable record; state changes persisted & auditable. (JOB-001, JOB-002, EVT-001)
- [ ] AC2 — Attempts are separately identifiable and linked to the job. (JOB-004, ERR-007)
- [ ] AC3 — Provider acceptance alone never marks success. (JOB-006)
- [ ] AC4 — Known failure vs unknown outcome are distinct; unknown outcomes are not blindly resubmitted. (ERR-003, JOB-010, SPEC-004 AC-14)
- [ ] AC5 — Jobs survive worker/API restarts. (JOB-009, PERF-003)
- [ ] AC6 — Authorization re-checked when execution begins and when status/results are retrieved. (FR-SEC-110, FR-SEC-111, FR-SEC-202)
- [ ] AC7 — Cancellation is supported and communicates when not guaranteed. (JOB-005)
- [ ] AC8 — Editor-facing SSE delivers status updates (< 2 s typical) without holding API requests open for job completion. (PERF-001, PERF-002, PERF-010)
- [ ] AC9 — Event consumers tolerate duplicate delivery. (EVT-002)

## 10. Risks & notes

- BullMQ is transport only; truth is Postgres (TECH §3.5). Never store business payloads in Redis.
- Use guarded transitions to avoid race between sweeper and slow worker.
- Keep render/export kinds in mind: state vocabulary differs (SPEC-010 §16.1) — store kind-specific substate mapping rather than a second table.

## 11. Handoff

- I22 registers `ai_generation`/`ai_interpretation` executors with adapter calls and provider idempotency/reconciliation hooks.
- I24 plugs reservation (before submit) and settlement (after attempt) into executor lifecycle hooks.
- I25 builds editor progress UI on the SSE endpoints.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
