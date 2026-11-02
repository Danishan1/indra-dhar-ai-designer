# AI studio — analyzer, component library reuse, patterns, tech packs (ADR-056)

The demo track that takes a garment from images to a tech pack. The structured garment model stays
the source of truth; AI output is never `confirmed`, and nothing missing is invented.

```
images ──► design.analysis (worker) ──► review (web) ──► design (API) ──► editor ──► commit
                │  decomposition  ▲                       │ fabrics + new parts         │
                │  library match ─┘ (skip AI detail)      ▼ saved to the library        ▼
                └► crops (assets)                    artifacts (matchSignature)   techpack.generate (worker)
                                                                                     └► document + PDF
```

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

## Configuration

`.env` (see `.env.example`): `AI_PROVIDER` (`gemini` | `openai` | `fake`), `GEMINI_API_KEY`,
`GEMINI_TEXT_MODEL`, `GEMINI_IMAGE_MODEL`, `OPENAI_API_KEY`, `OPENAI_TEXT_MODEL`,
`OPENAI_IMAGE_MODEL`, `AI_DAILY_REQUEST_LIMIT`, `AI_TIMEOUT_MS`, `PDF_CHROMIUM_PATH` (optional;
default is Playwright's browser from `pnpm e2e:install`). Model names change — set them here.

## Tests

No real AI calls: `FakeProvider` + `fakeResponders` (garment chosen from hint/notes/file names).
Unit: `packages/ai`, `packages/design-ai`, `packages/pattern-model`. Integration:
`apps/api/test/integration/ai-studio`. E2E: `tests/e2e/specs/ai-studio.spec.ts` runs the whole
flow through the real worker, including library reuse on a second analysis.
