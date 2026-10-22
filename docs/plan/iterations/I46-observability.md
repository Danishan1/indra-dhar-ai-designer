# I46 — Observability & audit tooling

| Field | Value |
|---|---|
| Phase | 9 — Administration, observability, hardening, launch |
| Subsystems | SS-17 Audit & Observability (all modules instrumented) |
| Depends on | I03 (audit events, logging); can be pulled forward any time after M4 |
| Estimated sessions | 1–2 |
| Spec references | `docs/init/11-tech-stack.md` §3.11, §9.5; `docs/init/04-ai-prompt.md` §23 (OBS-001..008, §23.3 metrics); `docs/init/05-ai-usage-metering.md` §19 (REC-012); `docs/init/09-specification.md` §15 (FR-SEC-178..185), NFR-SEC-012; `docs/init/10-visualization.md` NFR-RV-008/010; `docs/init/07-editor.md` NFR-EDT-013/014; `docs/init/08-tech-pack.md` NFR-TP-011/012 |
| Open decisions to resolve first | Monitoring stack (default: OpenTelemetry Collector → Prometheus + Grafana + Loki or Tempo optional; all self-hosted under `infra/monitoring`, opt-in compose profile) |

## 1. Goal
Make the running system explainable: distributed traces across web → api → worker → provider adapters, metrics for every SLO-relevant path (API latency, queue depth, AI latency/failures/cost, render/export failures, billing discrepancies), correlated structured logs with secrets redacted, an authorized audit search UI, and alerts for the conditions the specs call out.

## 2. Scope
### In scope
- OpenTelemetry SDK in api and worker (HTTP, NestJS, Prisma, ioredis/BullMQ, fetch/undici instrumentations); trace context propagated into BullMQ job data and outbox events (correlation/causation ids) (OBS-001, OBS-002, FR-SEC-185).
- Web vitals + editor interaction latency beacons (NFR-EDT-014) to an API ingest endpoint (sampled, no PII).
- Metrics (Prometheus via OTel): API latency & error rates by route; DB query duration; queue depth, wait time, job duration per kind; AI provider latency, failures, unknown-outcome rate, retry rate, rate-limit hits; AI usage & provider cost; input-prep & output-validation failures; revision conflicts; render/export failures & durations per stage (NFR-RV-008); storage errors; authn/authz failures; billing reconciliation discrepancies; cache hit rates; save failures/conflict rate (TECH §3.11, SPEC-004 §23.3).
- Distinguish provider failures from internal failures in metrics labels (OBS-003).
- Log hygiene review: redaction tests for passwords, tokens, API keys, cookies, prompts (configurable) (OBS-005, FR-SEC-181).
- Compose profile `monitoring`: otel-collector, prometheus, grafana with provisioned dashboards (API, Jobs & AI, Billing/Reconciliation, Rendering/Exports, Security), alert rules (Alertmanager or Grafana alerting → email).
- Alerts: reconciliation discrepancy over threshold (OBS-007, REC-012), unknown-outcome spikes, queue backlog, error-rate SLO burn, repeated denied access / role escalation / abnormal exports / unusual credential activity (FR-SEC-184), audit delivery failures (NFR-SEC-012), disk usage.
- Audit search UI for org admins (own org, permission `audit.view`) and platform security (all) with filters actor/resource/type/time/outcome (FR-SEC-182); audit-log access itself audited (FR-SEC-180); export CSV permissioned.
- Health/readiness endpoints enriched (DB, Redis, storage, queue lag).

### Out of scope (deferred to)
- SIEM integration, long-term log archive (→ backlog)
- Load testing (→ I49)

## 3. Deliverables
- `apps/api/src/platform/observability/{otel.ts, metrics.ts, tracing-context.ts}`; same in worker
- `apps/api/src/modules/audit/audit-search.controller.ts`
- `apps/web/src/features/audit/` (org admin) and `apps/web/src/app/admin/audit` (platform)
- `infra/monitoring/{otel-collector.yaml, prometheus.yml, grafana/dashboards/*.json, alerts/*.yml}`
- `infra/compose/docker-compose.dev.yml` profile `monitoring`
- `docs/deployment/observability.md` (what each dashboard/alert means, runbook links)

## 4. Data model changes
- Indexes on `audit_events` for search (organization_id, occurred_at desc; actor_id; resource_type+resource_id; event_type).
- Optional `audit_events` monthly partitioning (record decision).

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `GET /v1/audit-events?…` | `audit.view` (org-scoped) | Search audit events |
| `GET /v1/admin/audit-events?…` | `platform.security.manage` | Platform-wide search |
| `POST /v1/audit-events:export` | `audit.export` | CSV export job (audited) |
| `POST /v1/telemetry/client` | authenticated, rate-limited | Client perf beacons |
| `GET /v1/health/ready` | public (internal network only via Caddy rules) | Readiness |

## 6. UI
- Audit log page: filter bar, results table, event detail drawer (redacted metadata), export button.
- Admin: links to Grafana dashboards; provider health widget fed by metrics API.

## 7. Implementation tasks (ordered checklist)
1. [ ] Decide monitoring stack; record ADR note.
2. [ ] OTel bootstrap in api & worker (must load before NestJS); propagate context through BullMQ/outbox.
3. [ ] Custom metrics registry + instrument modules (jobs, ai-providers, rendering, techpack export, billing reconciliation, authz).
4. [ ] Client telemetry endpoint & web beacons (sampled).
5. [ ] Redaction test suite scanning captured logs/spans in integration tests for secret patterns.
6. [ ] Compose monitoring profile + dashboards + alerts.
7. [ ] Audit search API/UI + export job + access auditing.
8. [ ] Docs; PROGRESS.md.

## 8. Tests
- Integration: a generation request yields one trace spanning api → outbox → worker → adapter (fake) with same correlation id; metrics counters increment on provider failure vs internal failure distinctly; logs contain no API key/token after deliberately erroring with a key in context; org admin cannot search another org's audit events; audit search access creates audit event.
- Manual: Grafana dashboards render with dev data; a forced reconciliation discrepancy triggers alert.

## 9. Acceptance criteria
- [ ] AC1 — Every job and request has a correlation id; attempts trace to parent job (OBS-001, OBS-002).
- [ ] AC2 — Metrics listed in TECH §3.11 and SPEC-004 §23.3 are exported and dashboarded.
- [ ] AC3 — Provider vs internal failures distinguishable (OBS-003); render stage timings separated (NFR-RV-008).
- [ ] AC4 — No credentials/tokens/sensitive content in logs or traces (OBS-005, FR-SEC-181) — enforced by tests.
- [ ] AC5 — Audit search by actor/resource/type/time/outcome, permissioned and itself audited (FR-SEC-180, FR-SEC-182).
- [ ] AC6 — Alerts exist for reconciliation discrepancies and suspicious security patterns (OBS-007, FR-SEC-184).

## 10. Risks & notes
- Cardinality: never label metrics with user/org/design IDs; use exemplars/traces for drill-down.
- Monitoring stack is optional on small servers — app must run without it (exporter failures non-fatal).

## 11. Handoff
- I48 includes the monitoring profile in prod compose (optional) and documents retention; I49 uses dashboards during load tests.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
