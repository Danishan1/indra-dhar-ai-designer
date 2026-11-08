# 8. Limits today, and where to change things

Use this page to decide _what kind_ of change an idea needs. Most improvements are one of six
"levers"; each lever lives in one place.

## The levers

| Lever                                  | Change it when…                                                        | Where                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **A. What the AI is asked**            | the AI misreads something it _could_ see; a question or cue is missing | `design-ai/src/sketch.ts`: `SKETCH_CLASSIFY_SYSTEM`, `classifyPrompt`, `SKETCH_DETAILS_SYSTEM`, `checklist()`, cues |
| **B. How answers become a spec**       | the answers are right but the resulting options are wrong              | `sketch.ts`: `presetFor`, `familyOf`, `fixStyle`, `specFromSketch` (audience, size, proportions)                    |
| **C. The vocabulary (options)**        | a design feature has no option at all                                  | `garment-model/src/schema/pattern-spec.ts` (+ checklist, web `options.ts`, tech pack labels)                        |
| **D. How pieces are drafted**          | an option exists but the pieces are the wrong shape or missing         | `pattern-model/src/blocks/*` (bodice, sleeve, collar, skirt, trousers, bottoms, jacket, extras)                     |
| **E. Measurements and fit**            | sizes, ease or lengths are off for a market or audience                | `blocks/sizes.ts` (charts), `blocks/resolve.ts` (ease, lengths)                                                     |
| **F. What the tech pack says / shows** | content, order, wording, images or yardage need to change              | `design-ai/src/techpack*.ts`, `prompts.ts`, `pattern-model/src/marker.ts`, `sewing-order.ts`                        |

A new feature usually touches **C → A → B → D** (add the option, ask for it, map it, draft it) and then
the editor form and the tech pack. Example: _raglan sleeves_ = new `sleeveType` option (C), a cue in
the upper checklist (A), nothing in B, a raglan block that reshapes bodice armholes and the sleeve (D).

## Known limits (honest list)

**Component 1 — reading**

- The AI can only answer with the options that exist; anything else becomes "details: add by hand".
- Lengths are read as options (knee, midi…) or rough ratios; the drawing is not measured precisely.
- One outfit per analysis; no back-view reasoning beyond the "unsure" guesses.
- Accuracy depends on the model; tests use the fake provider, so real-model quality is only checked
  by trying real sketches (keep adding them to `samples/sketches/` with notes).
- Photos of real garments and existing paper patterns as starting points are not built yet.

**Pattern engine**

- Size charts are approximate European charts, one base size; no grading to a size range.
- Blocks are standard flat-pattern drafts: good starting patterns, not fitted production patterns
  (status stays _provisional_ until a pattern maker confirms).
- Not drafted yet: raglan / kimono / dolman sleeves, princess seams, godets, set-in waistband
  facings for faced waists, jeans back yoke, coat-length jackets with two-piece sleeves, lapel roll
  shaping, linings with ease details, stretch reductions for knits beyond simple ease.
- Some details are simplified: pocket bags are standard shapes; the slant pocket bag is not traced
  from the leg; lining pieces are copies with notes; turn-ups are an allowance, not a shaped hem.

**Editor**

- Hand-edited pieces are kept on redraft but not re-fitted automatically; seam checks show what no
  longer matches.
- No grading, no seam truing tools (walking seams), no notch editing by hand.

**Tech pack**

- The cutting layout is a planning estimate (rectangle packing, no nesting, no nap/one-way rules).
- AI images follow the text description and the sketch; they can still differ from the patterns.
- Construction notes from the AI are drafts to review.

## How to give me a strategy

The most useful input names the **garment**, what was **expected**, what **came out**, and ideally
which lever you think is wrong. For example: _"Kids' shorts: sketch shows an elastic back with a
flat front and a button — it chose fully elastic (lever B: `fixStyle` turned fitted into elastic
because no closure was read)."_ Sample sketches with a short note in `samples/sketches/` let me check
the change against real cases.
