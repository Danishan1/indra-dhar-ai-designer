# Editor workspace, editor-core and autosave (I15)

The design editor lives at **`/projects/{projectId}/designs/{designId}`** (route group `(editor)`:
full viewport, no app sidebar, `RouteGuard` + `OrganizationProvider`). Decisions: ADR-015 (Zustand),
ADR-050 (save pipeline & undo). Spec: SPEC-007 §5, §12, §13, §18, §20.

## Pieces

| Piece                                                                  | What it does                                                                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/editor-core`                                                 | Pure engine: `CommandStack`, `Selection`, `Viewport`, `ToolState`, `PendingQueue`, `saveReducer`. Immutable functions, no React/DOM.           |
| `GET …/designs/:designId/editor-state`                                 | One request to open: design, project (+ `editable`), working copy, head/approved revisions, `capabilities`, `readOnlyReason`, `userId`.        |
| `features/editor/store.ts`                                             | Zustand store per open design: server state, optimistic display, queue, history, save state, selection, viewport, tool, conflict.              |
| `features/editor/store-context.tsx`                                    | `EditorStoreProvider`, `useEditor(selector)`, `useEditorStore()`.                                                                              |
| `features/editor/editor-workspace.tsx`                                 | Shared layout: regions `header`, `toolbar`, `hierarchy`, `viewport`, `properties`, `operations`, `status` (resizable, collapsible, persisted). |
| `features/editor/editor-page.tsx`                                      | Loads editor-state, creates the store, fills the regions (header with version badges + save chip, undo/redo, hierarchy list, history…).        |
| `components/save-status.tsx`, `conflict-dialog.tsx`, `debug-panel.tsx` | Save chip (icon + text, Retry / Resolve), 409 dialog, dev-only `set_property` panel.                                                           |
| `hooks/use-editor-shortcuts.ts`, `use-unsaved-guard.ts`                | Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y, Ctrl/Cmd+S, Esc, V, H; `beforeunload` + online/offline.                                                  |

## Making a change (the only way to edit)

```ts
const apply = useEditor((s) => s.apply);
apply(
  { type: 'set_property', componentId, key: 'dimension.sleeve_length', value: 640, unit: 'mm' },
  {
    label: 'Set sleeve length',
    groupId: dragId, // optional: changes with the same group id are ONE undo step (a drag, a typing burst)
  },
);
```

1. The operation is parsed (`singleClientOperationSchema`), ids are generated (`normalizeOperation`) and it
   is applied locally with `applyOperation` — the display updates immediately. A change that is invalid
   locally is refused with a toast and never sent; a change that changes nothing is ignored.
2. It is queued; after 500 ms without further changes everything queued is sent as **one** request
   (`batch` when several) with `expectedVersion` and an idempotency key owned by that batch.
3. On acknowledgement the server's `patch` is applied to the last server state (the server is
   authoritative), the display is recomputed (server state + still-pending changes), and the change is
   recorded in the command stack under the returned operation id.

Save chip: `Saving…` → `Saved` (only after the server answered and nothing is pending) /
`Unsaved changes` / `Save failed` (+ Retry) / `Conflict` (+ Resolve) / `Offline`.

| Failure                        | Behaviour                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Network error, 5xx             | Kept; retried with the **same key** after 1, 2, 4, 8, 15 s; then waits for Retry / Ctrl+S / reconnect.    |
| 409 `CONCURRENT_MODIFICATION`  | Conflict dialog: **Reload server version** · **Re-apply my changes** · Cancel. Nothing is sent meanwhile. |
| Other 4xx (422 findings, 403…) | That batch is dropped with an explanation; later changes continue.                                        |
| Offline (`navigator.onLine`)   | Kept in memory; sent when the browser is back online.                                                     |

## Undo / redo

Undo submits `revert_operation` for the step's server operations (newest first); redo reverts those
reverts. The step then remembers the newest server ids, so undo → redo → undo always reverts the latest
server operation. Pending changes are saved first (Ctrl+Z right after typing works). A change the server
cannot invert clears history with a notice; a refused undo (`CONFLICT changed_since`, someone changed
the same parts) clears history too. Undo never touches committed revisions — going further back means
restoring a revision.

## Canvas (I16)

`features/editor/canvas/`: `SceneProvider` renders `display` with one memoizing renderer per open
design (`@ai-designer/garment-render`), artifact render info is fetched from
`GET …/artifacts/render-info` (`artifact-render-info.ts`). `GarmentCanvas` draws the scene (React SVG,
`scene-svg.tsx`) with `viewport` from the store; wheel/pinch zoom around the pointer, Space/middle
mouse/Pan tool to pan, `=`/`-` zoom, Shift+1 fit, Shift+0 100 %. Clicks select by `data-component-id`
(`hit-test.ts`; Shift adds, Ctrl/Cmd toggles, background clears). `ViewTabs` (Front/Back/Split, layers)
and `CapabilityBadge` (G2 + components drawn with defaults) sit on the canvas. The canvas fits the
garment automatically until the person zooms or pans. Dev gallery: `/dev/garment-gallery`.

## Hierarchy and properties (I17)

- `hierarchy/` — `HierarchyPanel` is an ARIA tree (`role="tree"`, `treeitem` with `aria-level`, `aria-selected`,
  `aria-expanded`); arrows/Home/End move, Enter/Space select (Shift adds, Ctrl/Cmd toggles), F2 renames. Row
  actions: show/hide and lock/unlock (`set_component_visibility` / `set_component_lock` — editor flags excluded
  from semantic diffs and hashes), rename, add a child (only types the catalog allows; repeatability respected),
  remove (cascade confirmed). `use-hierarchy.ts` builds the ordered tree (catalog type order, left before right).
- `properties/` — `PropertiesPanel` shows the design summary when nothing is selected, else the selected
  component(s): only properties allowed for the type (intersection for mixed selections), grouped by
  definition group, advanced ones under "More". `controls.tsx` maps definitions to controls (enum select, number
  with unit, colour picker + code, checkbox, text, composition rows, references read-only until I18).
  `value-input.ts` formats/validates before anything is sent; lengths are shown in mm/cm/in (preference
  `aid.units.length`) and sent with their unit (the server stores mm).
- Status badge (icon + text) opens a provenance popover: source, confidence, confirmed by/at, evidence count, and
  the review actions Confirm / Needs review / Not applicable / Clear (`set_property_status`, `reset_property`).
- Dependency rules from `garment-model` (`evaluatePropertyRules`) disable properties with a reason; values still
  set there are listed as conflicts with a Clear action.
- Refusals (local or server) are stored per `componentId|key` in the store (`refusals`) and shown under the field.
- Multi-select: the scope is shown and must be confirmed ("Edit all N"); a change is applied to each target with a
  shared group id (one undo step). Locked components disable editing.
- The canvas shows "Updating drawing…" while the deferred scene lags behind the latest change.

## Artifacts (I18)

- Left panel tabs **Parts** (hierarchy) / **Library** (`library/library-panel.tsx`): search, category and owner
  filters, "Only what fits <selection>" (`compatibleWith`), load more. Cards show a fit badge (Fits / Needs review /
  Doesn't fit + reason) from `artifacts/attach.ts` (`artifactFit`), Attach/Replace and Details (detail drawer).
- Cards are draggable; dropping on a component in the drawing attaches it (the canvas shows whether it fits while
  hovering). `useAttachArtifact` refuses incompatible targets before sending, picks `replace_artifact` for a second
  artifact of the same component category (`planAttach`) and selects the target.
- Properties → **Artifacts** section per binding: name, pinned revision id, chips (unavailable — reference kept,
  deactivated, approximate — needs review), "Update to Rn", detach, placement (region, offset mm, scale, rotation;
  coordinate space shown).
- Render info (`useArtifactInfos()` from `SceneProvider`) covers bindings, relationship sources and fabric refs.
- `attach_artifact`, `replace_artifact` and `update_placement` (region checks) need artifact definitions the
  browser does not have, so they are sent at once and shown when the server answers.
- Hierarchy menu "Save as artifact…" → `POST …/artifacts/from-component` (saved working copy; private by default).

## Revisions (I19)

- Header: working copy / latest / approved badges, "Restored from Rn" while a restore is not committed, **Commit…**.
- Right panel tabs **Properties** / **History** (`revisions/history-panel.tsx`): the working copy (autosaved, not a
  revision) on top, then revisions newest first (author, time, summary, lineage "After Rn · restored from Rm",
  Latest / Approved / base markers, validation counts) with View, Compare and Restore. Paged (20).
- Commit dialog (`commit-dialog.tsx`): saves pending changes, lists the changes since the latest revision
  (`GET …/compare?from=<head>&to=working`), optional description, validation snapshot, one idempotency key per
  dialog; `NO_CHANGES` offers "Commit anyway" only for metadata-only changes. Afterwards the store reloads.
- `store.inspect` (`viewRevision`, `compare`, `closeInspect`): while set, the workspace `takeover` slot shows
  `RevisionInspector` instead of the panels and `apply`/undo/redo do nothing. View = one revision read-only with an
  "Integrity verified" badge (the server re-hashes every snapshot read). Compare = A (revision) / B (revision or
  working copy) pickers, side by side or overlay with an opacity slider, one shared camera (`PanZoomArea`), changed
  components highlighted by stable id, grouped diff list (appearance-only and non-design changes separate). Esc
  closes it.
- Restore dialog explains that history is kept and that uncommitted changes are replaced; afterwards the store
  reloads and the next commit records "restored from".
- Panel tabs share `components/panel-tabs.tsx` (`createTabStore`, `PanelTabs`, `PanelTabContent`).

## Validation (I20)

`ValidationProvider` (inside `SceneProvider`) keeps the working copy's design-structure validation current;
see `docs/architecture/validation.md` for the panel, inline findings, tree icons and canvas badges. The store's
`findings` (warnings returned with the last saved change) are no longer shown on their own.

## Rules for later iterations

- **Never** put selection, viewport or tool state into the design (SPEC-007 §20); they live in the store.
- Subscribe narrowly: `useEditor((s) => s.display.components)` — never return a fresh object/array from
  a selector without `useShallow` (React would re-render forever).
- Capabilities in `meta.capabilities` are cosmetic; the API still authorizes each operation.
