# Artifact registry (I13)

Reusable sleeves, collars, cuffs, pockets, plackets, necklines, fabrics, lace, trims, embroidery, buttons and artwork. Decisions: ADR-048 (and ADR-008 for the built-in categories). Pure rules live in `packages/garment-model/src/artifacts/`.

## Model

- **Artifact** — stable identity (`LAC-0012`), category, name, tags, scope, lifecycle (`active`, `deprecated`, `deactivated`, `deleted`), pointer to the current revision.
- **Artifact revision** — immutable (`LAC-0012-R002`, trigger-protected), parent link, `definition`, `properties` (`visual` vs `physical`), optional `previewAssetId`, derived `geometryCapability` (G0 image only · G1 annotated image · G2 editable 2D) and `validationStatus` (unvalidated · design asset · production-validated).
- `definition` (`ArtifactDefinition`): `compatibleTargetTypes`, `allowedPlacementRegions` (null = anywhere), `preferredPlacementRegions`, `repeatable`, `placementModes`, `shapeParams` (`ParametricShapeParams` for the 2D renderer, I16), `previewSvg` (built-ins only), `geometryRefs`, `model3dRef` (I36).

Designs pin **revision ids** in component bindings, so a new artifact revision never changes a design (ART-005). Replacing a pinned revision is an explicit design edit (I18).

## Scopes

| Scope               | Who sees it                  | Who changes it                                            |
| ------------------- | ---------------------------- | --------------------------------------------------------- |
| platform (built-in) | every organization           | nobody via the API (code + startup sync)                  |
| organization        | members with `artifact.view` | `artifact.edit`; delete needs `artifact.delete`           |
| user (private)      | only the owner               | the owner (`artifact.edit`); `artifact.publish` shares it |

Creating directly in the organization library needs `artifact.publish`. Copying (`duplicate`) works from any visible artifact into your private or (with publish) the organization library and records `derivedFromArtifactRevisionId`.

## Rules

1. Read/use paths include platform rows explicitly (`visibleArtifacts`); write paths never do (`writableArtifacts`) — the PDP enforces the same (ADR-048).
2. Revisions are validated with `validateArtifactRevision`; derived fields are computed server-side.
3. Built-ins never carry manufacturing facts: physical properties stay `missing`.
4. Deactivated artifacts disappear from browsing but every revision stays resolvable by id.
5. Deletion is logical and only when no committed design revision or draft in the organization uses any revision.
6. Compatibility: `checkCompatibility(definition, capability, { componentType, region, existingUses })` → `{ compatible, findings }`; also `POST …/artifacts/compatibility-check`.

## Built-in library

`apps/api/src/modules/artifacts/platform-library/library.ts` (+ `svg.ts` previews). Keys are permanent. Editing an entry creates a new revision at the next API start; removing one marks it deprecated. Unit tests validate every entry.

## API (`/v1/orgs/:orgId/…`)

`GET/POST artifacts` · `POST artifacts/compatibility-check` · `GET/PATCH/DELETE artifacts/:artifactId` · `POST artifacts/:artifactId/{revisions,deactivate,reactivate,publish,duplicate}` · `GET artifacts/:artifactId/where-used` · `GET artifact-revisions/:artifactRevisionId` (+ `/preview`) ·
`GET artifacts/render-info?ids=` (pins, current revision, lifecycle, regions — what the editor draws and shows) ·
`POST artifacts/from-component` (I18: save a design component as an artifact; `artifact.create`, organization scope
needs `artifact.publish`; preview cut from the flat).

## Web

`apps/web/src/features/library/` — Library page (categories, search, owner and compatibility filters, deactivated toggle), detail drawer (visual vs physical properties, revisions, where used, actions), create / new-revision dialog with preview upload.

## Using artifacts in designs (I18, ADR-053)

- Operations `attach_artifact` / `replace_artifact` / `detach_artifact` / `update_placement` (design-operations). They
  need `design.edit`; attach/replace also `artifact.use` — which grants nothing on the artifact itself.
- A binding pins an **exact revision**. New revisions are shown as "Update to Rn" and applied only by an explicit
  `replace_artifact` (ART-005). Unavailable or deactivated artifacts keep their pin and show a warning.
- Component artifacts propose their visual values on the component (status `proposed`, source `artifact_revision`);
  confirmed values stay. Fabrics also set `material.fabric_ref`. Values are per component (two sleeves can share an
  artifact and differ).
- Trims/lace/artwork get a relationship with a placement in `component_local` space (region, offset mm, scale,
  rotation); without boundary geometry it is approximate and needs review.
- In the editor: left panel **Library** tab (`features/editor/library/`), properties **Artifacts** section
  (`properties/artifacts-section.tsx`), hierarchy "Save as artifact…" (`hierarchy/save-artifact-dialog.tsx`).
