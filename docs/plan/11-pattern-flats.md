# Garment flats drawn from the patterns (ADR-065) — plan

**Status:** agreed with the owner on 2026-11-09 (Option 1); to be built from the next session.
**Read this before starting.** Build in the order of §9 and tick items off here as they ship.

**Start phrase:** when the owner says **"Start pattern flats"** (or "continue pattern flats"), pick
the first `todo` session in §9 and build it.

## 1. Goal

Draw the finished garment — front and back technical flats — **directly from the pattern pieces,
without an AI model**. Every line is a real measurement of the pieces, so the drawing is exact and
it updates live: move a pocket, lengthen a sleeve, flare a skirt in the editor and the flat changes
at once. It costs nothing to run.

It replaces AI guesses where accuracy matters: the line sketch look, the tech pack flats, and the
guide given to the AI for the "on a model" photo. The patterns stay the single source of truth
(non-negotiable rule 1); the flat is a derived drawing like the pattern sheet.

## 2. What it produces

- **Front and back flat of each garment** — a set (shirt + shorts) gives one flat per garment,
  plus an optional "outfit" view with the garments one above the other.
- Conventional technical-flat style: garment laid flat and symmetrical, black lines on white, no
  colour, no person. Line weights: outline 1.5 pt, inner seams 0.75 pt, topstitching dashed
  0.5 pt, fold/pleat lines thin dashed.
- **True scale** (mm). Optional **dimension overlay**: chest/waist/hip width, length, sleeve
  length, hem width as callouts — used in the tech pack.
- Output: SVG (primary), PNG and PDF via the existing renderers.

## 3. Where it appears

| Place               | Today                                            | With flats                                                                                                                                                        |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern editor      | —                                                | **Flat view**: toggle next to the canvas (replaces or sits beside the sketch reference), front/back switch, updates live on every change; garment switch for sets |
| Looks → Line sketch | AI image per view and garment (paid, inaccurate) | The exact flat, instant and free; saved with the look (SVG asset) so history and "use these patterns" keep working                                                |
| Looks → On a model  | AI from the pattern sheet + text                 | Same, plus the exact flat as the guide image (AI is presentation only)                                                                                            |
| Tech pack           | AI front/back/side images                        | **Flats page** with dimension callouts; AI images optional extras                                                                                                 |
| Exports             | Pattern DXF / print                              | + flat SVG/PNG                                                                                                                                                    |

## 4. How it works

A pure function in `packages/pattern-model/src/flat/` (framework-free, runs in the browser and the
worker, memoised, target < 50 ms):

```
garmentFlat(state, { garmentKey, view: 'front' | 'back', dimensions? }) → FlatDrawing (paths + marks) → flatSvg()
```

Stages:

1. **Group by garment** — `designGarments` / `piecesOfGarment` (already built).
2. **Prepare pieces** — use the seam line (allowances never drawn); **unfold** pieces cut on the fold
   (mirror across `foldLine`); make left/right copies of mirrored pairs; close darts for the
   silhouette and keep the dart as a stitch line (intake from `edges[].intakeMm`).
3. **Assemble** — an _assembly recipe_ per template says where a piece goes and which of its edges
   joins which edge of another piece. A small solver places a root piece (the front or back body)
   and attaches the others with a rigid move so the matching edge end points meet:
   - body: front ↔ back at `shoulder` and `side` (only the front shows in the front view),
     yoke ↔ body at `seam`, bodice ↔ skirt at `waist`;
   - sleeves: `cap` ↔ `armhole`, drawn hanging at a standard angle (§10), cuff / band at the
     sleeve hem;
   - collar / stand / neckband ↔ `neck`; hood ↔ `neck`;
   - waistband ↔ `waist` of skirt or trousers; trousers: left and right front legs meet at the
     centre front (`crotch`), back legs at the centre back;
   - plackets, facings (hidden, shown only as topstitching), extensions, lapels (from the `fold`
     roll-line marking).
4. **Details from the pieces' markings** (exact positions, mapped into the flat): buttons and
   buttonholes, zips, darts, pleats, gathers (fold lines in proportion to the gather ratio), fold
   lines, placement marks → patch, welt, cargo and kangaroo pockets drawn where they are sewn,
   belt loops evenly spaced, topstitching 6 mm inside the seams that have it.
5. **Draw** — layer order body → yoke → pockets → plackets → collar → sleeves → cuffs; mirror the
   right half to the left when the garment is symmetrical; render to SVG.

Templates in use today (assembly recipes needed for each): bodice_front/back, front/back (tops),
yoke, side_front, skirt_front/back, trouser_front/back, sleeve, cuff, sleeve_band, sleeve_placket,
sleeve_underlap, collar, neckband, button_placket, front_facing, facing_back, waistband,
fly_facing, fly_shield, belt_loops, patch_pocket, front_patch_pocket, back_pocket, welt, welt_bag,
cargo_pocket, cargo_flap, kangaroo_pocket, pocket_bag(_front), hood, hood_lining, strap,
bib_pocket, ties, drawstring, armhole_binding, plus set prefixes (`shorts.waistband`) and
`lining_*`.

## 5. Accuracy rules (what "exact" means, and how we test it)

- Flat width at chest / waist / hip = the finished measurement ÷ 2 (front view), within 2 mm.
- Flat length = centre back / front length; sleeve length = sleeve piece length; hem width = hem
  edges joined.
- Every detail sits where its marking puts it (pocket 2 cm lower in the pattern → 2 cm lower in the
  flat).
- Tests: the 18-garment matrix (ADR-061) — every garment produces front and back flats with no
  unplaced pieces; numeric checks above; SVG snapshots; edit-propagation tests (move a pocket
  marking, lengthen a sleeve, flare a skirt → the flat follows).

## 6. Hand-edited and unknown pieces

- Edited pieces keep their template and edge names, so they assemble the same way — their changed
  shape shows directly.
- A piece the recipes cannot place (no template, no named edges — e.g. drawn with the future
  pencil tools) is **listed under the flat as "not placed"**, never guessed. Placing such pieces
  needs to know which seam joins which: the **seam pairs** tool (roadmap Phase 2) provides that.

## 7. Integration details

- Editor: `features/patterns/flat/flat-view.tsx`, reads the editor's display state, no server call.
- Looks: style `sketch` no longer calls the AI — the API (or worker, no AI) stores the flat SVG/PNG
  as the view assets; preflight counts 0 AI calls; existing AI sketch looks stay readable.
- Tech pack: `buildTechPack` gets `views` from `garmentFlat` for pattern-first designs.
- Model look: the front flat is passed as the first reference image with "follow this drawing
  exactly"; the pattern sheet stays as the second.

## 8. Honest limits

A flat is a conventional 2D representation, not a simulation: sleeves are shown at a standard
angle, gathers and pleats as lines, ease and fabric thickness are not visible, and the garment is
shown flat rather than on a body. True drape and fit on a body is Option 2 (3D virtual sewing),
a separate later decision.

## 9. Build order

| Session | Scope                                                                                                                                                                                                                                            | Status |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1       | Engine core: piece preparation (unfold, pairs, darts), recipe registry + edge-align solver, front/back of tops without sleeves, dresses (bodice + skirt), skirts; markings: buttons, zips, darts, pleats, gathers, fold lines; SVG; matrix tests | todo   |
| 2       | Sleeves (angle, cuffs, bands, plackets), collars / stands / neckbands, hoods, front plackets and lapels, pockets on tops, topstitching                                                                                                           | todo   |
| 3       | Trousers and shorts (waistband, fly, belt loops, front/back/cargo pockets), jumpsuits, dungarees, jackets, sets (one flat per garment + outfit view)                                                                                             | todo   |
| 4       | Integration: editor Flat view (live), Looks line sketch = exact flat (no AI), tech pack flats page with dimensions, flat as guide for the model look                                                                                             | todo   |
| 5       | Polish: dimension callouts, SVG/PNG export, "not placed" list, accuracy report in the Checks tab                                                                                                                                                 | todo   |

## 10. Decisions taken with defaults (change if the owner prefers)

- Sleeves hang at **about 30° from the side** in the front/back flat (common flat convention).
- Symmetrical garments are drawn from the right half and mirrored; asymmetric ones (wrap fronts)
  from both halves.
- Views: **front and back only** (standard for flats); side views stay AI-only.
- The line sketch look kind becomes the exact flat (no AI cost); existing AI sketches remain in the
  history.
