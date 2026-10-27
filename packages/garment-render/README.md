# @ai-designer/garment-render

Parametric 2D renderer (I16, ADR-024/051): **canonical garment state → deterministic, component-aware
technical flats** (front and back). Pure TypeScript — no DOM, no network — so the browser canvas and
the worker (server-side export, I35) use the same code. No AI is involved.

```ts
import { createRenderer, sceneToSvg } from '@ai-designer/garment-render';

const renderer = createRenderer(); // memoizes geometry per component; keep one per open design
const scene = renderer.render(state, { artifact, fabric }); // resolvers are optional
const svg = sceneToSvg(scene, { view: 'split' }); // byte-identical for the same scene
```

## Conventions

- **Coordinates:** `design_2d`, **millimetres**, origin at the **centre-front neck point**, x to the
  viewer's right, y **down**. The high point shoulder (HPS) is at `y = -frontNeckDepth`; front and back
  views share the HPS line so they align side by side.
- **Sides:** in the front view the wearer's left is on the viewer's right; in the back view the
  wearer's right is. Geometry is computed for the viewer-right half and mirrored with `sideSign`.
- **Every element** carries its canonical `componentId` (and `relationshipId` for trims/artwork) — the
  canvas selects on that, never on pixels.
- **Defaults are flagged:** a property without a value is drawn with the template default and listed in
  `scene.components[id].placeholders` + a `PLACEHOLDER_GEOMETRY` warning. Nothing is written back.
- **Back view:** each template declares the views it defines; nothing is mirrored by guesswork
  (`BACK_VIEW_NOT_AVAILABLE`). Unknown categories render nothing (`UNSUPPORTED_CATEGORY`, capability G0).
- **Unsupported component types** (hood, waistband, …) are listed (`supported: false`,
  `UNSUPPORTED_COMPONENT`), not invented. Lining/facing/seam groups are inside the garment: not drawn.
- **Determinism:** numbers rounded to 0.01 mm, stable element ids `componentId:view:part`, pattern ids
  derived from content.
- **Strokes** are screen pixels (`vector-effect: non-scaling-stroke`); line roles per FR-RV-028:
  silhouette, seam, stitch (dashed), fold, hidden, detail, trim, approximate, artwork, guide.

## Templates (ADR-008 categories)

| Template      | Views      | Notable defaults (mm)                                                                           |
| ------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `woven_shirt` | front/back | chest 560, shoulder 460, body 780, sleeve 620, cuff 65, collar 40, placket 32, 7 buttons, hem 8 |
| `knit_tshirt` | front/back | chest 520, shoulder 440, body 700, sleeve 200, neck 180, rib 18, hem 22                         |

## Property → geometry mapping

| Component                   | Property                     | Effect                                                                                |
| --------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| garment_body                | `dimension.chest_width`      | Body width at the underarm                                                            |
|                             | `dimension.shoulder_width`   | Shoulder points                                                                       |
|                             | `dimension.body_length`      | HPS to hem at centre                                                                  |
|                             | `appearance.silhouette`      | Hem width: slim 0.93 · regular 1 · relaxed 1.05 · oversized 1.1 · boxy 1.02 × chest   |
| any (inherited by children) | `appearance.color`           | Fill                                                                                  |
|                             | `appearance.pattern`         | Stripe / check fill (print, jacquard: solid)                                          |
|                             | `material.fabric_ref`        | Texture fill via the `fabric` resolver (screen only, FR-RV-085)                       |
| sleeve                      | `construction.sleeve_type`   | set-in, raglan (seam to the neck), drop shoulder, dolman, sleeveless (armhole finish) |
|                             | `dimension.sleeve_length`    | Length and hang angle (55° short → 20° long)                                          |
| cuff                        | `construction.cuff_type`     | 1–2 buttons, French fold, rib lines, stitching                                        |
|                             | `dimension.cuff_width`       | Cuff depth                                                                            |
| collar                      | `construction.collar_type`   | spread, point, button-down, camp leaves; mandarin/band stand; none                    |
|                             | `dimension.collar_height`    | Stand and leaf size                                                                   |
| neckline                    | `construction.neckline_type` | crew, V, scoop, henley (placket + buttons), boat                                      |
|                             | `dimension.neckline_width`   | Neck opening width                                                                    |
| placket                     | `construction.placket_type`  | standard, concealed, covered, half, none                                              |
|                             | `construction.closure_type`  | buttons, snaps, zip                                                                   |
|                             | `construction.button_count`  | Visible buttons/snaps                                                                 |
|                             | `dimension.placket_width`    | Width                                                                                 |
| pocket                      | `construction.pocket_type`   | patch, patch with flap, welt, inseam (hidden line), none                              |
|                             | `placement.pocket_position`  | left/right/centre chest, lower left/right                                             |
| hem (body or sleeve)        | `construction.hem_type`      | shirt-tail curve or straight; topstitch lines (coverstitch: two)                      |
|                             | `dimension.hem_depth`        | Band and stitch position                                                              |
| yoke                        | —                            | Back view band with seam                                                              |

`VISUAL_PROPERTIES` exports the same table for the properties panel (I17).

## Trims and artwork

Relationships `decorative_trim_applied_to` (lace, trim) follow a **boundary** of the target component
(`hem_edge`, `cuff_edge`, `sleeve_opening`, `neck_edge`, `collar_edge`, `pocket_opening`, …) chosen by
`placement.region`; the motif repeats `round(length / widthMm)` times. Without a boundary the trim is a
labelled **approximate** box (FR-RV-078/079). Embroidery/artwork are dashed placeholders at the named
region anchor (`left_chest`, …). Artifact names/shape parameters come from the `artifact` resolver
(`GET /v1/orgs/:orgId/artifacts/render-info` in the web app).

## Files

`types.ts` (scene model) · `registry.ts` (templates) · `frame.ts` (shared measurements) ·
`components/*` (geometry per type) · `fills.ts` · `styles.ts` · `trims.ts` · `scene.ts` (builder +
memoization) · `layout.ts` (split view) · `svg-string.ts` (sanitized export) · `mapping.ts` ·
`gallery.ts` (golden/gallery variants; `src/__snapshots__/*.svg` are the golden files).
