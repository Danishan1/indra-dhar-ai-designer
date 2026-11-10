# AI studio — reconstruction, library reuse, patterns, models, tech packs (ADR-056, ADR-057)

The demo track that takes a garment from images to a tech pack. The structured garment model stays
the source of truth; AI output is never `confirmed`, and nothing missing is invented.

```
images ──► design.analysis (worker) ──► review (web) ──► design (API) ──► editor ──► commit
                │  decomposition  ▲                       │ fabrics + new parts         │
                │  library match ─┘ (skip AI detail)      ▼ saved to the library        ▼
                └► crops (assets)                    artifacts (matchSignature)   techpack.generate (worker)
                                                                                     └► document + PDF
```

## Pattern-first studio (ADR-058) — the current core flow

Sketch → **Component 1** (AI reads) → pattern engine → **Component 2** (pattern editor) →
**Component 3** (tech pack from the patterns).

| Step      | What                                                                                                                                           | Where                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Start     | user chooses _From a sketch_ (photo / pattern pieces: coming soon), uploads 1–4 views, optional garment, audience, size                        | `web/features/studio/new-analysis.tsx`; analysis `mode: 'sketch'`                  |
| Read      | one vision call: family, audience, style options from fixed lists, proportions, details not drafted                                            | `design-ai/src/sketch.ts` (`readSketch`, `specFromReading`), task `sketch_reading` |
| Review    | options marked _sketch_, live pattern preview with dimensions and fit checks, then _Create patterns_                                           | `web/features/studio/sketch-review.tsx`                                            |
| Draft     | `draftPattern(spec)` → parts + pieces (edges, markings, grain, fold, notches)                                                                  | `pattern-model/src/blocks/*`                                                       |
| State     | `patternSpec` + `patternPieces`; parts as components (`part:<key>` tags)                                                                       | `patternDesignState`, `draftToState`                                               |
| Edit      | measurements / style → `set_pattern_draft`; width/height, key points, SA, cut → `replace_pattern_pieces`                                       | `web/features/editor/patterns/pattern-workspace.tsx`, `web/features/patterns/*`    |
| Check     | seams that are sewn together, recomputed from the current pieces                                                                               | `seamChecks`                                                                       |
| Tech pack | pattern specification, body/finished measurements, fit checks, BOM from piece areas, piece pages; images from the pattern description + sketch | `design-ai/src/techpack-pattern.ts`, worker `techPackHandler`                      |

### Pattern CAD editor (ADR-059)

| Piece                                                                                                                                      | Where                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Bézier path model, fitting, flattening, node ops, lengthen/widen (`spreadPiece`), exact seam length (`setEdgeLength`), rotate/mirror/scale | `pattern-model/src/cad/path.ts`, `fit.ts`, `bezier.ts` |
| DXF + tiled 1:1 print                                                                                                                      | `pattern-model/src/cad/export.ts`                      |
| Canvas: rulers, grid, zoom/1:1, snapping, tools, overlays                                                                                  | `web/features/patterns/cad/pattern-cad.tsx`            |
| Toolbar, calibration, inspector (transform, points, seam lengths, numeric lengthen/widen)                                                  | `web/features/editor/patterns/pattern-workspace.tsx`   |

Tools (ADR-062) are defined in `web/features/patterns/cad/tools.ts` (category, key, hint); the
chrome (category bar, tool rail, options strip, arrange/view/fit options) is in
`web/features/editor/patterns/cad-chrome.tsx`, shared editor context and the multi-piece commit
(`useEditPieces`, one undo group) in `pattern-ui.tsx`, the right panel tabs in
`pattern-right-panel.tsx`. Engine helpers: `scalePieceFrom`, `spreadAtLines` (`cad/path.ts`),
`packCanvas` (`cut.ts`), `measurementLevers` / `suggestLevers` / `solveLever` (`blocks/levers.ts`).

Keys (canvas focused): V select · H pan · A points · P add point · X delete point · C convert ·
S scale · L lengthen · W widen · F size by measurement · R rotate · M measure · E seam · N notch ·
G grain · 0 fit · 1 true size · +/− zoom · arrows nudge (Shift ×10, Alt ×0.1) · Enter apply ·
Esc cancel, Esc again → select. Undo/redo stay global (Ctrl+Z / Ctrl+Shift+Z).

Size charts are approximations to start from — every measurement is editable. Pieces edited by
hand are kept when sizes or style change (banner: _Redraft them_). Seam lines are the outline;
the seam allowance is drawn outside.

### Other starts: photo and fabric → line sketch (ADR-066)

| Piece                                                                                                                                                                                                                                                                                                                                      | Where                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Modes `photo` and `fabric` on `design_analyses` (no migration — `mode` is text); preflight 3 calls (photo: image_generation + image_analysis) / 1 call (fabric); fabric step 2 `POST /analyses/:id/fabric-choice {suggestion, size?}` (4 calls) re-queues the same analysis                                                                | `apps/api/src/modules/analysis`                                                                              |
| Worker: photo → `image_line_sketch` → stored asset → `readSketch([sketch, photo…], labels)`; fabric step 1 `suggestFromFabric` (task `fabric_suggest`) → `result.mode = fabric_suggestions`; step 2 `image_fabric_design` (design in the fabric) → `image_line_sketch` → `readSketch`; `result.generated = {sketchAssetId, designAssetId}` | `apps/worker/src/jobs/ai-studio.ts`                                                                          |
| Prompts, fabric reading + suggestion schemas, fake responder                                                                                                                                                                                                                                                                               | `packages/design-ai/src/starts.ts`, `fake-responders.ts`                                                     |
| Start page modes, fabric suggestions page, review shows the generated images; design sources: line sketch (sketch), design (reference), uploads (reference / fabric)                                                                                                                                                                       | `web/features/studio/new-analysis.tsx`, `fabric-suggestions.tsx`, `sketch-review.tsx`, `analysis.service.ts` |

### Reading a sketch: classify, then a checklist per garment (ADR-061)

1. **Classify** (`sketch_classify`, `design-ai/src/sketch.ts`): who (male/female, adult/child, age),
   body sections drawn, and each separate garment with its type (`SKETCH_GARMENT_TYPES`). A shirt
   above shorts is two garments — a co-ord set — never a dress.
2. **Checklist** (`sketch_details`): for each garment the questions of its family (`checklist()`),
   allowed values only, with visual cues; guesses go in `unsure`.
3. `specFromSketch` → one `patternSpec`: the first garment is `family`/`style`, the others are
   `garments[]` (same wearer and measurements). Type presets (jeans, chinos, joggers, frock,
   blazer…) fill what the checklist does not say.

The engine (`pattern-model/src/blocks`): `draft-pattern.ts` (families + set assembly), `bottoms.ts`
(waistbands, belt loops, back/cargo/patch pockets), `trousers.ts` (slant/scoop cuts, pleats,
elastic, turn-ups), `jacket.ts` (hood, facings, ribs, kangaroo, linings, plackets), `extras.ts`
(tiers, pleated skirts, ruffles, wrap, frock yoke). Sets: prefixed part keys/templates and
`set_garment` components; checks, sewing order and the tech pack run per garment. The review page
and the editor's Style tab show one section per garment (add/remove garments of a set).

### One flow, one drawing (ADR-060)

| Piece                                                                                                                                                                                                        | Where                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Cutting line with allowance per seam (`allowances`, hem allowance, none on the fold): `cutOutline`, `segmentAllowances`, `edgeAllowance`, `edgeOnFold`, `edgeMidFrame`; initial canvas layout `layoutCanvas` | `pattern-model/src/cut.ts`                                          |
| Cutting layout per fabric (`buildMarkers`, `markerSvg`)                                                                                                                                                      | `pattern-model/src/marker.ts`                                       |
| Sewing order from the pattern parts (`sewingOrder`)                                                                                                                                                          | `pattern-model/src/sewing-order.ts`                                 |
| Piece drawing shared by the review page and the editor (cut line, fold, grain, notches, seam labels)                                                                                                         | `web/features/patterns/cad/piece-vector.tsx`, `pattern-preview.tsx` |
| Sketch guesses (`unsureOptions` → review "check")                                                                                                                                                            | `design-ai/src/sketch.ts`, `web/features/studio/sketch-review.tsx`  |
| Commit-and-generate tech pack, step indicator                                                                                                                                                                | `web/features/editor/studio/techpack-button.tsx`, `editor-page.tsx` |

The tech pack of a pattern-first design adds a **Cutting layout** page per fabric (marker length,
% used — a planning estimate, not a production marker), takes the fabric yardage from it, lists
per-seam allowances, and uses the deterministic sewing order when the AI drafts no notes (the AI
gets it as context either way).

### Look preview (ADR-064)

| Piece                                                                                                                                                                                                                                                                                                                                                                                                     | Where                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `design_looks` (one row per look: revision, style, note, status/stage, `views[]` = `{view, assetId, note}`), routes, `style` model (front/back/left/right) or sketch (front/back, one entry per garment of a set via `designGarments`); the drawings are stored as the initial `views` entries `{view, garment, garmentName, assetId, note}`; preflight = one image call per drawing (`image_generation`) | `apps/api/src/modules/looks` — `POST/GET /designs/:designId/looks`, `GET /looks/:lookId` |
| Job `look.generate`: verify the revision, pattern sheet PNG (`patternSheetSvg`) — **patterns only, never the sketch or reference photos** —, one `image_look_view` per drawing; a sketch uses the pattern sheet of that garment only (`piecesOfGarment`); the first drawing of the same garment is fed back for the others, store each view as it is ready                                                | `apps/worker/src/jobs/look.ts`                                                           |
| Prompt: pieces with size/cut, edited pieces, description from the spec, view; model = real person from the audience, sketch = technical flat of one garment, no person/dummy/hanger                                                                                                                                                                                                                       | `packages/design-ai/src/look.ts` (`lookPrompt`, `lookPieceList`)                         |
| Preview look button (kind first — on a model / line sketch —, then its views and the image count; commits uncommitted patterns first), Looks tab (views, zoom, current/restored, compare, restore)                                                                                                                                                                                                        | `web/features/editor/looks/`                                                             |

A look is tied to an immutable revision, so restoring that revision brings its patterns back.
Pattern edits are semantic (`semanticView` and `diffDesignStates` include `patternSpec` and
`patternPieces`, minus canvas placement), otherwise pattern-only edits could not be committed.

## Reconstruct, don't crop (ADR-057)

The analyzer rebuilds the garment as **editable vector artifacts**. Each component has `shapes`
(`garment-model/src/schema/shape.ts`): a closed path normalized to a box in garment-frame
millimetres (origin top-centre of the body, x right, y down — the technical-flat frame), one per
view, with curve handles, layer, style, inner details and `source` + `confidence`
(`observed` = traced by the model on the image · `template` = technical-flat geometry ·
`inferred` = AI guess / mirrored back · `user`). `links` say which measurement a box side drives.

| Step                                                                   | Where                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Model traces an outline per component, normalized to its region        | `prompts.ts` (decomposition)                           |
| Outline → mm (scale: estimated body length ÷ body height on the image) | `reconstruct.ts` `observedShapes`                      |
| Missing outlines → technical-flat panels (shirts/T-shirts) or a box    | `reconstruct.ts` `reconstructShapes`                   |
| Image placement for the overlay comparison                             | `sources[].placement`                                  |
| Edit (move/resize/rotate/points/curves/layers, export/import)          | `web/features/editor/studio/reconstruction-canvas.tsx` |
| Shape → measurement → pattern (one undo step)                          | `web/features/editor/studio/shape-sync.ts`             |
| Pattern editing (points, SA, cut, grain, fold)                         | `web/features/editor/studio/pattern-editor.tsx`        |

Pattern pieces keep `componentId` (artifact → pieces, several per component). Rule-based
(`parametric`) pieces are redrafted when linked measurements change; traced/extracted pieces are
scaled with the shape and marked `needs_review` — an arbitrary 2D shape is never presented as a
manufacturing pattern.

## Models: discovery, capabilities, routing (ADR-057)

- `packages/ai/src/models.ts`: `discoverGeminiModels` (`GET v1beta/models`, key in
  `x-goog-api-key`, `supportedGenerationMethods`), `discoverOpenAiModels` (`GET /v1/models`),
  per-model capabilities, `OPERATION_REQUIREMENTS`, `classifyHttpError`, `modelChain`.
- `catalog.ts` `planChain`: preference (Settings) → `.env` model if listed → ranked compatible
  models (recent successes/failures from `ai_usage_records`) → other providers when allowed.
- `router.ts` `routedProvider`: busy → retry with backoff; unknown/unsupported model or invalid
  output → next compatible model; bad key / permission / quota → skip that provider; refusal →
  stop. History is stored with the analysis/tech pack (`processing`) and every call is a usage row.
- Keys: Settings → **AI models** (`credentials.manage`, Credential admin role + MFA); encrypted with
  `@ai-designer/secrets` (shared with the worker); `.env` keys are the server fallback.
- Routes: `GET/PUT orgs/:orgId/ai/settings`, `PUT ai/providers/key`, `POST ai/providers/key/remove`,
  `POST ai/providers/refresh`, `POST ai/models/test` (listed + capable + live JSON probe; image
  models are checked from the listing only).

## Packages

| Package                  | What it holds                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai`            | Provider-independent interface (`AiProvider`: `generateStructured`, `generateImage`), adapters `GeminiProvider`, `OpenAiProvider`, `FakeProvider`; `readAiEnv`, `providerStatuses`, `createProvider`. Keys only here (server).                                                    |
| `packages/design-ai`     | Pure logic: analysis schemas (lenient zod), prompts, `matchComponent` / `libraryEntryFromArtifact`, `analyzeDesign`, `buildDesignState`, `buildTechPack`, `techPackHtml`, fake responders.                                                                                        |
| `packages/pattern-model` | Parametric provisional pattern drafts per component type (`draftComponentPieces`, `outdatedPieces`), outlines from normalized AI/extracted points, SVG sheets (seam line, seam allowance, grainline, notches, fold).                                                              |
| `garment-model`          | `patternPieces` and `sources` on the design state, `sourceRegion` on components, new categories (dress, skirt, trousers, jacket, hoodie) and component types (collar_stand, skirt_panel, leg_panel). Artifact definitions may carry `matchSignature`, `patternPieces`, `details`. |
| `design-operations`      | `replace_pattern_pieces` (one component's pieces; undoable). `remove_component` drops the removed parts' pieces.                                                                                                                                                                  |

## API (apps/api)

| Module      | Owns               | Routes                                                                                                                                                           |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai`        | `ai_usage_records` | `GET orgs/:orgId/ai/status` (providers, models, today's usage — no secrets). `AiUsageService.preflight` = configured provider + daily cap.                       |
| `analysis`  | `design_analyses`  | `POST projects/:projectId/analyses` (`design.generate`), `GET analyses/:analysisId`, `POST analyses/:analysisId/design` (`design.create`).                       |
| `techpacks` | `tech_packs`       | `POST designs/:designId/techpacks` (`design.generate`; revision defaults to the head, verified), `GET designs/:designId/techpacks`, `GET techpacks/:techPackId`. |

Creating the design from an analysis happens in the API (user-reviewed): fabric artifacts (preview =
the uploaded swatch), the design via `DesignsService.createFromState` (R001 committed), then one
library artifact per new component signature (`definition.matchSignature`, provisional pattern
pieces, details; preview = crop). Scope is organization with `artifact.publish`, otherwise private.

## Worker (apps/worker/src/jobs/ai-studio.ts)

- `design.analysis`: loads inputs (sharp, ≤1600 px), loads reusable library entries (built-in,
  organization, the requester's private ones), runs `analyzeDesign` with a metered provider (every
  call → `ai_usage_records`), crops component regions → `generated_image` assets, stores the result.
- `techpack.generate`: loads + verifies the revision snapshot, resolves artifact names, makes the
  reference image (flat PNG for shirts/T-shirts, else the uploaded sketch/reference), AI text and
  images, collects crops, `buildTechPack`, prints the PDF (`renderPdf`, playwright-core Chromium,
  scripts disabled, offline) → `export` asset.
- Failures set the row `failed` with `{ message, kind }`; the job itself completes (no retry loop).
- The worker writes these three tables directly (documented exception, ADR-056 h).

## Web

- `/projects/:p/ai/new` — upload + roles (guessed from file names), hint, audience, notes, provider.
- `/projects/:p/analyses/:id` — polling progress, then review: components (crop, attributes, AI
  estimates, match badge Exact/Compatible/Similar/New, AI/library/leave out, fabric), fabrics,
  pattern pieces read from uploads, missing information → **Create design and open editor**.
- Editor: Garment / Patterns / Reference switch (`editor/studio/studio-viewport.tsx`), **Visual &
  pattern** properties section with Redraft, **Tech pack** header button (latest committed revision).
- `/techpacks/:id` — progress, then the document (same HTML as the PDF in a script-less iframe) and
  **Download PDF**.

## Tech pack v2 (ADR-057)

Inputs: the committed revision (final shapes, measurements, pattern pieces, fabrics) **and** the
original uploads (`references`). Document: original reference · garment front/back from the final
geometry (+ technical flats for shirts) · AI images (references: final drawing first, original
second; presets model/pose/background/view) · components with their shape drawing · BOM ·
measurements · pattern sheet + one dimensioned page per piece (100 mm scale bar) · construction ·
missing information · AI processing record. PDF: Chromium (Playwright's, else installed
Chrome/Edge/Chromium, or `PDF_CHROMIUM_PATH`), page-numbered footer, `pdfStatus`/`pdfError`,
`POST techpacks/:id/pdf` to print again, plus a browser **Print / Save as PDF** fallback.

## Busy providers (503 / 429)

Layered, so a demand spike does not fail a job: (1) the Gemini adapter retries each call with
backoff; (2) then tries the fallback models (`GEMINI_FALLBACK_*_MODELS`); (3) `resilientProvider`
waits `AI_BUSY_WAIT_MS × round` for `AI_BUSY_RETRIES` rounds, showing "Gemini is busy — trying again
in 20 s" as the job stage; (4) then switches once to `AI_FALLBACK_PROVIDER` if its key is set.
Every attempt is metered. A failed analysis offers **Try again with the same images** (optionally
with another provider) — no re-upload.

## Configuration

`.env` (see `.env.example`): `AI_PROVIDER` (`gemini` | `openai` | `fake`), `GEMINI_API_KEY`,
`GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`,
`OPENAI_IMAGE_MODEL`, `GEMINI_FALLBACK_TEXT_MODELS`, `GEMINI_FALLBACK_IMAGE_MODELS`, `AI_BUSY_RETRIES`, `AI_BUSY_WAIT_MS`, `AI_FALLBACK_PROVIDER`, `AI_DAILY_REQUEST_LIMIT`, `AI_TIMEOUT_MS`, `PDF_CHROMIUM_PATH` (optional;
default is Playwright's browser from `pnpm e2e:install`). Model names change — set them here.

## Tests

No real AI calls: `FakeProvider` + `fakeResponders` (garment chosen from hint/notes/file names).
Unit: `packages/ai`, `packages/design-ai`, `packages/pattern-model`. Integration:
`apps/api/test/integration/ai-studio`. E2E: `tests/e2e/specs/ai-studio.spec.ts` runs the whole
flow through the real worker, including library reuse on a second analysis.
