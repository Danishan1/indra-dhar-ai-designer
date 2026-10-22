# I25 — AI generation in the editor: candidates & apply

| Field | Value |
|---|---|
| Phase | 4 — AI execution & metering foundation |
| Subsystems | SS-04 Editor, SS-06 Router, SS-07/08/09 AI pipeline, SS-10, SS-11, SS-12, SS-13/14 |
| Depends on | I20, I23, I24 |
| Estimated sessions | 3 |
| Spec references | `docs/init/07-editor.md` §11 (AI interaction FR-EDT-060…078), §14 (compare), §22 (errors), AC-EDT-005/006; `docs/init/04-ai-prompt.md` §15 (normalization RES-001…010), §16 (validation levels & application modes APP-001…010), §17 (stale/conflict CON-001…007), §25.2/25.5 (workflows B, E), AC-08…11, AC-16; `docs/init/06-project-lifecycle.md` §8.5 (FR-PRJ-042…048), §9.4; `docs/init/05-ai-usage-metering.md` §21.2 (display rules); `docs/init/10-visualization.md` §15 (FR-RV-109…123) |
| Open decisions to resolve first | none (auto-apply = never, per 05-decisions §3) |

## 1. Goal
Users explicitly request AI visuals of their **structured design** from the editor — generate concept, variations, restyle with a reference/fabric, colorway exploration — see the estimated credit cost and remaining allowance **before** submitting, watch progress, review **candidates in isolation**, compare them with the current design, and **apply** chosen results as derived representations (never as confirmed geometry or production facts). Stale results never overwrite newer work; applying is undoable. This completes the AI-assisted design loop for M4.

## 2. Scope
### In scope
- Generate panel / actions: "Generate concept", "Generate variations (n)", "Restyle with reference" (pick source asset/fabric artifact), "Explore colorways"; scope selector (full design vs selected component — component scope uses component-focused prompts, still image-level) with explicit scope display (FR-EDT-061); understandable options (style direction preset, variation count, quality tier) (FR-EDT-062).
- Plan + preflight UX: call `operations/plan` then `operations/preflight` → show strategy, model tier (not raw provider unless policy permits), estimated credits (labelled "estimate"), remaining allowance, approximation/preservation disclaimers (FR-EDT-064, FR-EDT-071, §21.2); confirm button creates operation + job (idempotent).
- Submission states: submitting vs accepted (FR-EDT-065); progress via SSE (queued/running/awaiting_review/failed/cancelled/outcome_unknown) in operations panel (FR-EDT-066); cancel action.
- Executor completion (worker): normalize outputs (RES-001…010) → store assets via assets service (provenance: job/attempt/operation/source revision) → validation levels 1–2 (file integrity, task conformance; level 3 design-consistency checks via I20 engine where structured changes exist) → create `Candidate` rows (`available`) → job `awaiting_review` → usage settlement (I24).
- Candidate gallery ("Generated" tab of library panel): thumbnails with source revision/working-copy version, model tier, time, validation status, "stale" badge if working copy advanced (FR-EDT-077, FR-PRJ-043).
- Compare before apply: side-by-side/overlay of candidate vs current flat/representation (FR-EDT-068).
- Apply modes (APP-001…010):
  - `attach_representation`: candidate becomes a `Representation` (fidelity F0, `is_authoritative_design_state=false`) linked to the working copy version → shown as "AI preview" view in viewport; included in next commit's representations.
  - `candidate_only` / `reject_result`: keep or reject; rejected candidates retained for history.
  - Structured-change application only for tasks that return validated structured data (e.g. colorway exploration returning color values) → produce operations through I14 with `proposed` status values requiring confirmation (FR-EDT-069, PROP-007).
- Stale protection: job retains base version; on apply, if working copy version ≠ base → show stale dialog (compare, apply as representation to current with explicit acknowledgement, or discard); never silent overwrite (CON-001…004, FR-EDT-075, AC-EDT-006).
- Undo of apply: apply is an operation (`attach_representation` op type added to design-operations) with inverse (FR-EDT-083).
- Operation history panel shows AI operations with inputs (assets, artifact revisions), outputs, statuses, application decisions (FR-EDT-076).
- Retry for eligible failures with new idempotency group; blocked for `outcome_unknown` until reconciled (FR-EDT-074).
- Error UX per SPEC-007 §22 table (generation failure, unknown outcome, stale candidate, permission, quota).

### Out of scope (deferred to)
- Design initiation from uploads (→ I26); masks/targeted edits (→ I27)
- BYOK selection (→ I33); server-side rendered previews (→ I35)

## 3. Deliverables
- `apps/web/src/features/editor/ai/{GeneratePanel.tsx, PreflightSummary.tsx, JobProgressList.tsx, CandidateGallery.tsx, CandidateCompare.tsx, StaleResultDialog.tsx, useJobEvents.ts, CreditWidget.tsx}`
- `apps/worker/src/executors/ai-generation.ts` (complete: compile → adapter → normalize → store → validate → candidates → settle)
- `apps/api/src/modules/jobs/candidates.{service,controller}.ts`; `designs` Representation persistence
- `design-operations`: `attach_representation`, `detach_representation`, `apply_ai_structured_changes`
- Playwright E2E using fake adapter scripted scenarios

## 4. Data model changes
`Candidate` (I21 schema) populated; `Representation` rows (I12 model) with `generation_method='ai'`, `job_id`, `fidelity`; `DesignOperation.job_id` set.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/designs/{id}/operations/plan` | `design.generate` | Strategy + estimate |
| `POST /v1/designs/{id}/operations/preflight` | `design.generate` | Reservation |
| `POST /v1/designs/{id}/operations` (AI types, `reservationId`) | `design.generate` | Create op + job |
| `GET /v1/designs/{id}/candidates` | `design.view` | Candidate list |
| `GET /v1/candidates/{id}` | `design.view` | Candidate + provenance (FR-RV-123) |
| `POST /v1/candidates/{id}/apply` (`mode`, `expectedVersion`) | `design.edit` | Apply (idempotent) |
| `POST /v1/candidates/{id}/reject` | `design.edit` | Reject |

Events: `CandidateResultAvailable`, `CandidateApplied`, `ai.job.awaiting_review`.

## 6. UI
Generate panel (toolbar button + right drawer), preflight summary card, progress list with cancel, candidate gallery, compare view, stale dialog, credit widget in header/status bar.

## 7. Implementation tasks (ordered checklist)
1. [ ] Complete `ai_generation` executor with fake adapter; persist candidates and representations; settlement.
2. [ ] Candidate APIs + apply/reject with version checks and idempotency.
3. [ ] New operation types + inverses.
4. [ ] Generate panel + plan/preflight UX + confirmation.
5. [ ] SSE hook and progress list; cancel.
6. [ ] Candidate gallery, compare, stale dialog.
7. [ ] AI preview view mode in viewport (labelled "AI-generated preview — not geometry", F0/G0).
8. [ ] Error states for all fake-adapter scenarios.
9. [ ] Playwright suite; manual live smoke with real adapter (optional, local only).
10. [ ] Update PROGRESS.md; tag milestone if I26/I27 done later (M4 after I27).

## 8. Tests
- Integration: candidate never modifies working copy until apply (SPEC-004 AC-10); malformed provider output rejected/quarantined (AC-09); stale apply returns 409 with stale info (AC-11); duplicate apply idempotent; usage settled once.
- E2E (fake adapter): generate → progress → candidates → compare → apply → undo → re-apply; timeout scenario shows "outcome unknown — no automatic retry"; quota exceeded shows reason and no job created.

## 9. Acceptance criteria
- [ ] AC1 — Generation only starts from an explicit user action after showing scope and estimated cost/allowance. (FR-EDT-060, 061, 064; FR-044; PRE-009)
- [ ] AC2 — Submission vs accepted vs running states are distinguishable; progress visible without blocking the editor. (FR-EDT-065, 066; NFR-EDT-004)
- [ ] AC3 — Outputs are stored as assets with job/operation/source-revision provenance. (RES-003, RES-007, FR-EDT-077, AC-RV-009)
- [ ] AC4 — Candidates are isolated; nothing applies without user action. (FR-EDT-067, APP-002, AC-EDT-005)
- [ ] AC5 — Applying attaches a representation without treating it as structured geometry or confirmed production data. (APP-003, FR-RV-112…114, RES-006)
- [ ] AC6 — Stale results never silently overwrite newer work. (CON-003, FR-PRJ-044, AC-EDT-006, SPEC-006 AC-007)
- [ ] AC7 — Applying is undoable without re-running the job. (FR-EDT-083)
- [ ] AC8 — Failed jobs leave the prior working state intact; retries respect idempotency; unknown outcomes block blind retry. (FR-EDT-073, 074; ERR-009)
- [ ] AC9 — Preservation limitations are disclosed. (FR-EDT-071, CON-005, SPEC-004 AC-16)
- [ ] AC10 — Completed generation is traceable end-to-end: operation → compilation → attempt → output → validation → revision/representation → usage. (SPEC-004 AC-18, NFR-040)

## 10. Risks & notes
- UX copy must never say "your design was updated" when only a preview representation was attached.
- Keep provider/model names hidden by default (show quality tier); admins may enable display.
- Images can be large: use thumbnails (I09) in gallery, full-res only on compare.

## 11. Handoff
- I26 reuses candidate review components for interpretation proposals; I27 adds masks and targeted edits on top of the same flow.
- I28 review will reference representations attached to a revision.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
