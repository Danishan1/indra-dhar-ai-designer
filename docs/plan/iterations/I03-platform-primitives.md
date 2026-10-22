# I03 — Platform primitives

| Field                           | Value                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 0 — Foundation & platform primitives                                                                                                                                                                                                                                                                                       |
| Subsystems                      | Cross-cutting platform; SS-17 Audit (event store); SS-09 (durable job skeleton)                                                                                                                                                                                                                                            |
| Depends on                      | I02                                                                                                                                                                                                                                                                                                                        |
| Estimated sessions              | 2                                                                                                                                                                                                                                                                                                                          |
| Spec references                 | `docs/init/11-tech-stack.md` §3.2, §3.5, §7; `docs/init/04-ai-prompt.md` §14 (job record shape), §20.1 (error categories), §21 (events, outbox); `docs/init/06-project-lifecycle.md` §10.3, §14 (error codes), §15 (event fields); `docs/init/09-specification.md` §15.2 (audit schema); `docs/plan/01-architecture.md` §4 |
| Open decisions to resolve first | ADR-001 (IDs), ADR-002 (zod contracts + OpenAPI), ADR-005 (outbox) — Proposed; confirm and mark Accepted                                                                                                                                                                                                                   |

## 1. Goal

Build the reusable backbone every module depends on: shared contracts (zod), a uniform error envelope with stable codes, request context, ID generation (UUIDv7 + display IDs), append-only audit events, the transactional outbox with an idempotent dispatcher, HTTP idempotency keys, a generic durable-job record pattern, and OpenAPI generation. After this iteration no module needs to invent its own plumbing.

## 2. Scope

### In scope

- `packages/contracts`: zod setup, `errors.ts` (error code catalog + envelope schema), `ids.ts` (display-id prefixes), `events/` (event envelope schema + versioning), `pagination.ts`, `common.ts` (timestamps, money minor units, units placeholder). Permission catalog file is created empty here and filled in I07.
- API platform: global exception filter → error envelope; zod validation pipe; `RequestContext` (AsyncLocalStorage) with `requestId`, `principal` (anonymous for now), `organizationId` (null for now); correlation/causation id propagation.
- IDs: `uuidv7` for PKs; `IdSequenceService.next(orgId, prefix)` → `PRJ-000123` style using `id_sequences` row lock.
- Audit: `AuditEvent` table (append-only, DB trigger blocks UPDATE/DELETE), `AuditService.record(ctx, event)` callable inside transactions; redaction utility.
- Outbox: `OutboxEvent` table; `OutboxService.add(tx, event)`; worker `outbox-dispatcher` (polling with `FOR UPDATE SKIP LOCKED`, batching, exponential backoff, dead-letter flag); `ProcessedEvent` table + `withIdempotentConsumer(consumer, eventId, fn)` helper.
- Idempotency: `IdempotencyKey` table; `@Idempotent()` interceptor using `Idempotency-Key` header, request hash, stored response snapshot; conflict on different payload → `IDEMPOTENCY_CONFLICT`; TTL cleanup job.
- Durable job skeleton: `Job` + `JobAttempt` tables (generic, `kind` discriminator per ADR-023) with minimal states; `JobService.create(tx, …)` writes job + outbox event; BullMQ message carries `jobId` only; worker base class `DurableJobProcessor` (load → mark running → execute → persist result). Full AI state machine is I21.
- OpenAPI: generated from zod/Nest metadata; `pnpm api:openapi` writes `docs/api/openapi.json`; snapshot test.
- Optimistic concurrency helper (`assertVersion(expected, actual)` → `CONCURRENT_MODIFICATION`).

### Out of scope (deferred to)

- Authentication/principal resolution (→ I05), authorization guard (→ I07)
- AI-specific job states, SSE, recovery sweeper (→ I21)
- Audit search UI (→ I08/I46)

## 3. Deliverables

- `packages/contracts/src/{index,errors,ids,events/envelope,pagination,common,permissions}.ts`
- `apps/api/src/platform/{context,errors,validation,ids,audit,outbox,idempotency,jobs,concurrency,openapi}/`
- `apps/worker/src/processors/{outbox-dispatcher,idempotency-cleanup,system}.ts`, `apps/worker/src/framework/durable-job-processor.ts`
- Prisma models: `IdSequence`, `AuditEvent`, `OutboxEvent`, `ProcessedEvent`, `IdempotencyKey`, `Job`, `JobAttempt`
- Migration with immutability trigger for `audit_events`
- `docs/api/openapi.json` (generated snapshot)
- A demo module `apps/api/src/modules/_examples/` (dev-only, removed or flagged) proving outbox → consumer and idempotent POST

## 4. Data model changes

| Model               | Notes                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdSequence`        | (`organization_id` nullable for platform scope, `prefix`) unique; `next_value bigint`                                                                                                              |
| `AuditEvent`        | fields per `03-domain-model.md`; append-only trigger; indexes on (`organization_id`, `occurred_at`), (`resource_type`, `resource_id`)                                                              |
| `OutboxEvent`       | `type`, `schema_version`, `payload jsonb`, `organization_id`, `correlation_id`, `causation_id`, `available_at`, `published_at`, `attempts`, `last_error`, `dead_lettered_at`; index on unpublished |
| `ProcessedEvent`    | unique (`consumer`, `event_id`)                                                                                                                                                                    |
| `IdempotencyKey`    | unique (`principal_key`, `route`, `key`); `request_hash`, `status` (`in_progress`,`completed`), `response_status`, `response_body jsonb`, `expires_at`                                             |
| `Job`, `JobAttempt` | generic per ADR-023; `kind`, `status`, `display_id`, `payload jsonb`, `result jsonb`, `failure jsonb`, `correlation_id`, timestamps; attempts numbered                                             |

## 5. API / contracts

| Method & path                   | Permission                                | Purpose                          |
| ------------------------------- | ----------------------------------------- | -------------------------------- |
| `POST /v1/_dev/echo-idempotent` | dev-only (disabled in prod config)        | Exercise idempotency interceptor |
| `GET /v1/jobs/{jobId}`          | dev-only now; `job.view` added in I07/I21 | Read durable job status          |

Error codes introduced (catalog in `packages/contracts/src/errors.ts`): `VALIDATION_FAILED`, `UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`, `INVALID_STATE_TRANSITION`, `CONCURRENT_MODIFICATION`, `IDEMPOTENCY_CONFLICT`, `VALIDATION_BLOCKED`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `UNSUPPORTED_CAPABILITY`, `RETENTION_POLICY_BLOCKED`, `REVISION_NOT_FOUND`, `REVISION_NOT_APPROVED`, `INTERNAL_ERROR`.

Event envelope: `{ eventId, type, schemaVersion, occurredAt, organizationId, actor: {type,id}, correlationId, causationId, payload }` (SPEC-006 §15, SPEC-004 EVT-005).

## 6. UI

None.

## 7. Implementation tasks (ordered checklist)

1. [ ] Confirm ADR-001/002/005 → Accepted in `05-decisions.md`.
2. [ ] Create `packages/contracts` (pure TS, zod only); wire into api/web/worker builds.
3. [ ] Exception filter + zod pipe; map Prisma known errors (unique violation → 409, not found → 404) without leaking SQL.
4. [ ] `RequestContext` via AsyncLocalStorage; logger mixin adds context fields.
5. [ ] IDs: uuidv7 helper; `IdSequenceService` with `SELECT … FOR UPDATE` inside transaction; zero-padded format per prefix.
6. [ ] Audit table + trigger + `AuditService` + redaction utility (shared with logger list).
7. [ ] Outbox table/service; worker dispatcher loop (configurable interval, batch size, backoff, max attempts → dead letter); consumer registry; `ProcessedEvent` helper.
8. [ ] Idempotency interceptor + table + cleanup processor.
9. [ ] Generic `Job`/`JobAttempt` + `JobService.create` (+ outbox `job.queued`), worker `DurableJobProcessor` base; system `noop` job kind for tests.
10. [ ] Optimistic concurrency helper.
11. [ ] OpenAPI generation script + snapshot test (fails when API changes without regenerating).
12. [ ] Example module demonstrating all primitives; document usage in `docs/architecture/platform-primitives.md` (short how-to for later sessions).
13. [ ] Update `PROGRESS.md`.

## 8. Tests

- Unit: error filter maps each code to status; display-id formatting; redaction; request-hash stability; version assertion.
- Integration: concurrent `IdSequenceService.next` calls produce unique, gap-tolerant sequence; audit UPDATE/DELETE rejected by DB; outbox event written in same tx is not published if tx rolls back; dispatcher publishes exactly once per consumer under duplicate delivery (simulate double dispatch); idempotent POST twice returns same response and executes once; same key different body → 409 `IDEMPOTENCY_CONFLICT`; durable job survives worker restart (job stays `queued` and is picked up when worker restarts).
- Contract: OpenAPI snapshot.

## 9. Acceptance criteria

- [ ] AC1 — All API errors use the envelope with stable codes and `requestId` (SPEC-006 §14; SPEC-004 ERR-001).
- [ ] AC2 — Audit records are append-only at the DB level (SPEC-009 FR-SEC-178, NFR-041 of SRS).
- [ ] AC3 — A state change and its outbox event commit atomically; consumers tolerate duplicates (SPEC-004 EVT-002, SPEC-006 §10.3).
- [ ] AC4 — Retried mutation with the same `Idempotency-Key` creates no duplicate effect (SPEC-006 AC-013, FR-PRJ-096).
- [ ] AC5 — A durable job record exists for every enqueued job and is recoverable after worker restart (TECH §3.5; SPEC-004 JOB-001, JOB-009 basics).
- [ ] AC6 — OpenAPI document generated and snapshot-tested.

## 10. Risks & notes

- Keep `packages/contracts` free of NestJS/Prisma imports (it is consumed by the browser).
- Outbox polling interval vs latency: start at 250–500 ms; SSE latency target ≤2 s (TECH §9.5) depends on it.
- Never put secrets or full payloads of confidential content in outbox/audit payloads — use references (SPEC-004 EVT-004).
- Don't over-generalize the job model; I21 extends states.

## 11. Handoff

- I05 plugs the principal into `RequestContext`; I07 fills `permissions.ts` and adds the guard.
- I21 extends `Job` with AI states and recovery sweeper.
- Write the short "how to use platform primitives" doc so later sessions reuse instead of re-inventing.

## 12. Completion record

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
