# Platform primitives — how to use them

Built in I03. **Reuse these; never re-invent the plumbing in a module.** The reference
implementation is `apps/api/src/modules/dev-examples/dev-examples.controller.ts` (dev-only routes).

| Need                                | Use                                                                                                       | Where                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Validate input + document the route | `@Endpoint({ summary, tags, body, query, params, response, successStatus, errors })`                      | `apps/api/src/platform/validation/endpoint.ts`                              |
| Fail with a stable error code       | `throw new AppError('CONFLICT', 'message', details?)` (`AppError.notFound('Project')`)                    | `platform/errors/app-error.ts`; codes in `packages/contracts/src/errors.ts` |
| Who/which request am I serving      | `RequestContext.get()` / `.writeMeta()`                                                                   | `platform/context/request-context.ts`                                       |
| Human-readable id (`PRJ-000123`)    | `IdSequenceService.next('PRJ', organizationId, tx)`                                                       | `platform/ids/` → `@ai-designer/db` `nextDisplayId`                         |
| Primary key                         | `newId()` (UUIDv7)                                                                                        | `@ai-designer/db`                                                           |
| Audit trail                         | `AuditService.record({ eventType, action, outcome, resourceType, resourceId, metadata }, tx)`             | `platform/audit/` (rows are immutable; metadata redacted)                   |
| Domain event                        | `OutboxService.append(tx, MyEvent, payload)` with `defineEvent(type, version, zodSchema)` in contracts    | `platform/outbox/`; events in `packages/contracts/src/events/`              |
| React to an event (worker)          | add an `EventConsumer` to `apps/worker/src/events/consumers.ts`                                           | runs at most once per (consumer, eventId) in a transaction                  |
| Background work                     | `JobService.create({ kind, payload, maxAttempts }, tx)` + a handler in `apps/worker/src/jobs/handlers.ts` | Postgres `jobs` row is the truth; BullMQ carries only the id                |
| Retry-safe POST                     | `@Idempotent()` on the handler                                                                            | `platform/idempotency/`; header `Idempotency-Key`                           |
| Optimistic concurrency              | `assertVersion(expected, actual)` / `assertUpdated(count)` after `updateMany({ where: { id, version } })` | `platform/concurrency/`                                                     |
| API docs                            | automatic from `@Endpoint`; regenerate `pnpm api:openapi`                                                 | `docs/api/openapi.json` (snapshot test fails when stale)                    |

## Writing a mutation — the canonical shape

```ts
@Post()
@Idempotent()
@Endpoint({ summary: 'Create project', tags: ['projects'], body: createProjectSchema, response: projectSchema, errors: ['CONFLICT'] })
async create(@Body() body: CreateProject): Promise<Project> {
  return this.prisma.$transaction(async (tx) => {
    const ctx = RequestContext.require();
    const displayId = await this.ids.next(DisplayIdPrefixes.project, ctx.organizationId, tx);
    const project = await this.repo.create(tx, { id: newId(), displayId, ...body });
    await this.audit.record({ eventType: 'project.created', action: 'project.create', outcome: 'success', resourceType: 'project', resourceId: project.id }, tx);
    await this.outbox.append(tx, ProjectCreatedEvent, { projectId: project.id });
    return toProjectView(project);
  });
}
```

Rules:

1. State change, audit record and outbox event **in the same transaction** (pass `tx` everywhere).
2. Outbox/audit payloads hold references and small facts — never secrets or confidential content (they are redacted, but don't rely on it).
3. Consumers must tolerate duplicates; side effects outside Postgres use deterministic ids (e.g. BullMQ `jobId`).
4. Event payload schemas are versioned (`schemaVersion`); add a new version instead of changing an old one.
5. Job handlers are idempotent per attempt and call `heartbeat()` in long loops. Throwing → retry until `maxAttempts`; set `permanent: true` on the error to fail at once.
6. Every new route has `@Endpoint` (the OpenAPI test fails on undocumented routes) and, from I07, a permission.

## Runtime flow

```text
API tx: state + audit + outbox_events row ──commit──▶ worker OutboxDispatcher (poll 500 ms, FOR UPDATE SKIP LOCKED)
   ──▶ BullMQ "events" (message id = event id) ──▶ consumers (processed_events marker, same tx)
job.queued consumer ──▶ BullMQ "jobs" (message id = job id) ──▶ runDurableJob: claim queued→running,
   handler, succeeded/failed + job.finished outbox event; failures back to queued until max_attempts
MaintenanceSweeper (60 s): re-enqueue stale queued jobs, recover running jobs without heartbeat, delete expired idempotency keys
```

Failed outbox publishes back off (1 s → 5 min) and are dead-lettered after `OUTBOX_MAX_ATTEMPTS`
(`dead_lettered_at` set, error logged to `logs/worker/worker-error.*`).

## Testing helpers

- `@ai-designer/db/testing`: `resetTestDatabase(url)`, `applyIntegrationEnv(defaults)` (AID_IT_* overrides from shell or root `.env`).
- API integration tests boot the full app with `startTestApp()` (`apps/api/test/integration/app-factory.ts`).
- Worker: `startWorker(env, { logger, loops: false })` and drive `handle.dispatcher.dispatchOnce()` / `handle.sweeper.sweepOnce()` manually.
