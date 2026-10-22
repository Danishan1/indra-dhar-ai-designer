# I<NN> — <Iteration title>

| Field                           | Value                                                          |
| ------------------------------- | -------------------------------------------------------------- |
| Phase                           | <n> — <phase name>                                             |
| Subsystems                      | SS-xx <name>, …                                                |
| Depends on                      | I.., I.. (must be `done` in PROGRESS.md)                       |
| Estimated sessions              | <1–3>                                                          |
| Spec references                 | `docs/init/<file>.md` §… (read these sections before starting) |
| Open decisions to resolve first | ADR-0xx (or "none")                                            |

## 1. Goal

One short paragraph: what exists at the end of this iteration that did not exist before, and why it matters for the product.

## 2. Scope

### In scope

- …

### Out of scope (deferred to)

- … (→ I..)

## 3. Deliverables

Concrete files/modules/screens that must exist at the end.

- `path/to/thing` — purpose

## 4. Data model changes

Prisma models / migrations / JSON schemas added or changed (refer to `03-domain-model.md` names). "None" if none.

## 5. API / contracts

Endpoints, events, package exports added. Include permission keys for each endpoint.

| Method & path | Permission | Purpose |
| ------------- | ---------- | ------- |

Events emitted / consumed: …

## 6. UI

Screens/components added (or "None").

## 7. Implementation tasks (ordered checklist)

1. [ ] …
2. [ ] …

## 8. Tests

- Unit: …
- Integration: …
- E2E: …

## 9. Acceptance criteria

Numbered, verifiable. Reference the spec AC/FR IDs they satisfy.

- [ ] AC1 — … (satisfies FR-…)

## 10. Risks & notes

Pitfalls, spec subtleties, things not to do.

## 11. Handoff

What the next iteration needs from this one; what to record in PROGRESS.md.

## 12. Completion record

_Filled in by the session that finishes the iteration._

- Completed on:
- Sessions used:
- Deviations from plan:
- Follow-ups added to backlog:
