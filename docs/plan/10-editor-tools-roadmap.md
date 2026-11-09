# Pattern editor tools — roadmap (ADR-063)

The list of tools the pattern editor should offer and the order to build them in, agreed with the
owner on 2026-11-09. **Read this before adding any pattern editor tool**: put the new tool in its
phase, follow the order, and tick it off here when it ships (with the ADR or commit that built it).

What exists today (ADR-059, ADR-062) is listed under "Done" so the gaps are clear. Tools live in
`apps/web/src/features/patterns/cad/tools.ts` (category, key, hint) and geometry in
`packages/pattern-model/src/cad/`.

## Two ideas behind the list

1. **Pencil tools that change a shape.** Draw a line or shape, then choose what it does: cut the
   piece along it, add the shape to the piece, remove an area, or keep it as a marking (pocket
   position, style line).
2. **Linked editing, so one change reaches the matching pieces.** Pieces already know how they
   relate: front and back share the side seam and inseam; left and right are one piece cut twice
   (always identical). Two modes:
   - **Same change** — widen the front leg by 2 cm and the back gets the same change.
   - **Keep seams matched** — reshape the front side seam and the back side seam follows, so the
     two still sew together.

   A **Linked** switch in the category bar decides whether a change applies to one piece or to its
   group (front + back of the trousers, or every piece of one garment).

## Done (ADR-059, ADR-062)

Select / pan · edit points and handles · add / delete point · corner ↔ smooth, curve ↔ straight ·
scale the whole piece · lengthen / widen at lines (even spread) · size by measurement (redraft) ·
rotate / flip · measure · seam length and allowance · notches · grainline · pack on fabric / tidy ·
print 1:1 · DXF · look preview (ADR-064, not a tool: a button that renders the garment from the
patterns).

## Phase 1 — Pencil and shape editing

| Tool              | What it does                                                            | Status |
| ----------------- | ----------------------------------------------------------------------- | ------ |
| Pencil (freehand) | Draw by hand; the stroke is smoothed into an editable curve             | todo   |
| Line / curve pen  | Precise straight lines and curves, snapping to points and seams         | todo   |
| Cut along line    | Split a piece in two (a yoke from a bodice, a panel from a leg)         | todo   |
| Add shape         | Join a drawn shape to the piece (extension, flare, pocket bag)          | todo   |
| Remove shape      | Cut an area away (neckline, cut-out, curved hem)                        | todo   |
| Join pieces       | Merge two pieces along a seam (a yoke back into the bodice)             | todo   |
| Trim / extend     | Shorten or extend a line to meet another                                | todo   |
| Parallel line     | A line at a set distance from a seam (facings, topstitching, hem lines) | todo   |

## Phase 2 — Linked editing

| Tool                   | What it does                                                                             | Status |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------ |
| Linked switch + groups | Apply a change to one piece or the whole group                                           | todo   |
| Seam pairs             | The editor knows which seams sew together (side, inseam, shoulder, armhole ↔ sleeve cap) | todo   |
| Walk seams             | Lay one seam along its partner to check lengths and notches                              | todo   |
| Blend across a seam    | Smooth one curve across two pieces (front + back armhole, neckline)                      | todo   |
| True a corner          | Fix where two seams meet so they sew flat                                                | todo   |

## Phase 3 — Garment construction

| Tool                     | What it does                                                     | Status                  |
| ------------------------ | ---------------------------------------------------------------- | ----------------------- |
| Dart: add / move / close | Move a dart (shoulder → side) or close it into a seam            | todo                    |
| Pleats and tucks         | Knife, box or inverted pleats from a line                        | todo                    |
| Add fullness             | Spread at one end only, for flare or gathers                     | todo (even spread done) |
| Facing                   | Make a facing piece from a neckline or armhole edge              | todo                    |
| Extension                | Button stand, grown-on placket, wrap overlap                     | todo                    |
| Unfold / fold            | Open a piece cut on the fold into a full piece, and fold it back | todo                    |
| Ease                     | Add or remove ease along a seam (sleeve cap, back shoulder)      | todo                    |

## Phase 4 — Markings

Buttons and buttonholes (with spacing) · drill holes · pocket and label placement · text notes on
pieces · gather and stitch marks.

## Phase 5 — Sizes

Grading (bigger or smaller per size) and an all-sizes view drawn on top of each other. The engine
already redrafts by size, so this mostly covers pieces edited by hand.

## Why this order

Pencil tools are the most visible gap. Linked editing comes next because every later tool depends
on it — without it darts and facings would have to be made twice. Construction and markings build
on both.
