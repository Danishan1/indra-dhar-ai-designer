# I26 — Design initiation from sketch / photo / fabric

| Field | Value |
|---|---|
| Phase | 4 — AI execution & metering foundation |
| Subsystems | SS-02 Project Lifecycle, SS-03, SS-07/08/09, SS-11, SS-04 |
| Depends on | I25 |
| Estimated sessions | 2–3 |
| Spec references | `docs/init/01-overview.md` §3.3 (FR-030…034), §7 Stage 2; `docs/init/03-artifact-schema.md` §9 (statuses/provenance), §24 (photo interpretation workflow), AC-06; `docs/init/06-project-lifecycle.md` FR-PRJ-003…005, §9.1; `docs/init/04-ai-prompt.md` §8.1 (`image_interpretation`, `multimodal_reasoning`), §15.3 (structured outputs), §22.2 (untrusted inputs); `docs/init/10-visualization.md` FR-RV-043, FR-RV-050, FR-RV-068; `docs/init/09-specification.md` FR-SEC-176…177, FR-SEC-205…206 |
| Open decisions to resolve first | none (uses model chosen in ADR-009 for interpretation) |

## 1. Goal
A user starts a new design from what they have — a **sketch, reference garment photo, or fabric image** — instead of a blank template. The platform stores the sources, runs an **interpretation job** that proposes a garment type, component structure, visible properties and possible artifact matches, all marked `inferred`/`proposed`/`needs_review`, and walks the user through a **review & confirm wizard** before producing the initial working copy and revision. Uncertain facts (fabric composition, exact measurements) are never presented as confirmed.

## 2. Scope
### In scope
- "New design" wizard entry points: Blank template (exists from I12) · From sketch · From garment photo · From fabric (choose template + apply fabric) · Combination (photo + fabric).
- Upload via assets service (I09) with validation, scanning hook, thumbnails; source asset records immutable (§24 step 2).
- Interpretation task `garment_interpretation` (I23) returning structured JSON validated against an `InterpretationResult` zod schema: `garmentTypeCandidates[{type, confidence}]`, `components[{type, side, properties{key:{value, confidence}}}]`, `visibleDetails`, `colorObservations`, `artifactMatchHints`, `unsupported/hidden notes`.
- Mapping `InterpretationResult` → proposed `GarmentDesignState` using templates from I11/I16: every AI value has status `inferred` or `proposed`, `sourceType=ai_job`, `sourceRefs=[assetId, jobId]`; physical facts (composition, GSM, measurements) forced to `missing` or `needs_review` regardless of model output (PROP-007, FR-033, GEO-002 — no physical dimensions from pixels without calibration).
- Artifact match suggestions: search registry for compatible artifacts by hints; presented as optional suggestions, never auto-bound.
- Fabric flow: fabric image → derived texture asset (seamless crop/tiling via Sharp, labelled approximate) + proposed color/pattern properties; composition remains `missing`.
- Review & confirm wizard: step 1 garment type, step 2 components (accept/remove/add), step 3 properties table with status badges and bulk "confirm visible appearance" for low-risk appearance fields only (manufacturing-critical fields require individual confirmation), step 4 summary of unresolved/missing items → create design.
- Creation: `CreateDesign` with initial working copy built through operations (provenance kept) and optional initial commit "Initial interpretation (R1)" (FR-PRJ-003/004).
- Source panel in editor shows the originating assets with "reference only (F0/G0)" labels (FR-RV-023, AST-010).
- Re-run interpretation on the same asset is a new job (no silent overwrite).
- Metering via preflight (interpretation category) before job creation.

### Out of scope (deferred to)
- Raster-to-vector geometry reconstruction (→ backlog; must be separate validated pipeline FR-RV-043)
- Measurement extraction from documents (→ I44)

## 3. Deliverables
- `apps/web/src/features/projects/new-design/{NewDesignWizard.tsx, SourceUploadStep.tsx, InterpretationProgress.tsx, ReviewGarmentType.tsx, ReviewComponents.tsx, ReviewProperties.tsx, SummaryStep.tsx}`
- `packages/ai-contracts/src/interpretation.ts` (schema) ; `packages/garment-model/src/from-interpretation.ts` (pure mapper with forced statuses)
- Worker executor `ai-interpretation.ts`; prompt template `garment_interpretation@1`
- Fabric texture derivation in worker (`asset-derivations/fabric-texture.ts`)
- E2E with fake adapter returning fixture interpretations (incl. adversarial text-in-image fixture)

## 4. Data model changes
None new; `Job.kind = ai_interpretation`; `Design.metadata.initiation = { method, sourceAssetIds, interpretationJobId }`.

## 5. API / contracts
| Method & path | Permission | Purpose |
|---|---|---|
| `POST /v1/projects/{projectId}/interpretations` (assetIds, hints) | `design.generate` + `project.edit` | Preflight + create interpretation job |
| `GET /v1/interpretations/{jobId}` | `project.view` | Result proposal (mapped state + raw normalized result summary) |
| `POST /v1/projects/{projectId}/designs/from-interpretation` | `design.create` | Create design from reviewed proposal (idempotent) |

## 6. UI
Multi-step wizard with progress, side-by-side source image vs proposed flat (I16 renderer), status badges, confirm controls, explanation banner: "AI suggestions — please confirm. Fabric composition and measurements cannot be determined from images."

## 7. Implementation tasks (ordered checklist)
1. [ ] Define `InterpretationResult` schema + output schema in template.
2. [ ] Pure mapper with forced-status rules + exhaustive tests.
3. [ ] Interpretation executor (compile → adapter → normalize → schema validate → store result JSON asset).
4. [ ] Fabric texture derivation.
5. [ ] API endpoints with preflight integration.
6. [ ] Wizard UI steps; artifact suggestions.
7. [ ] Create-from-interpretation using operations for provenance; optional initial commit.
8. [ ] Security fixtures: instructions embedded in uploaded image text are ignored; oversized/invalid files rejected.
9. [ ] Update PROGRESS.md.

## 8. Tests
- Unit: mapper never outputs `confirmed`; physical facts always `missing/needs_review`; unknown component types mapped to `custom` with review flag.
- Integration: malformed interpretation JSON → job failed with `OUTPUT_VALIDATION_FAILED`, no design created; tenant isolation on interpretations.
- E2E: upload photo → proposal → confirm 3 properties → design created → provenance popover shows "AI job + photo" for unconfirmed, "user confirmation" for confirmed.

## 9. Acceptance criteria
- [ ] AC1 — Users can start a design from sketch, reference photo or fabric image. (FR-030, FR-PRJ-003)
- [ ] AC2 — The system proposes an initial structured garment definition from inputs. (FR-031)
- [ ] AC3 — Values are labelled confirmed/inferred/missing/needs review; nothing AI-derived is auto-confirmed. (FR-032, FR-034, PROP-005, SPEC-003 AC-06)
- [ ] AC4 — Exact composition and measurements are never presented as verified facts. (FR-033, PROP-007, GEO-002, AC-TP-005 spirit)
- [ ] AC5 — Source assets are immutable and referenced as provenance for interpreted values. (FR-PRJ-004, §24 steps 2/4)
- [ ] AC6 — Reference images are labelled as visual references (F0/G0), not editable geometry. (AST-010, VIS-007, FR-RV-050)
- [ ] AC7 — Uploaded content cannot inject instructions that alter policy. (FR-SEC-205/206, SEC-AI-006)
- [ ] AC8 — Interpretation usage is preflighted and metered. (PRE-001, USG-001)

## 10. Risks & notes
- Interpretation quality varies; the wizard must make editing proposals fast (bulk accept of appearance fields) without bypassing confirmation of production-critical ones.
- Keep raw model output only as stored JSON asset under retention policy; the canonical state contains only mapped values.

## 11. Handoff
- I27 reuses source images as edit targets; I44 reuses extraction/attribution patterns for spec documents.

## 12. Completion record
- Completed on: 
- Sessions used: 
- Deviations from plan: 
- Follow-ups added to backlog: 
