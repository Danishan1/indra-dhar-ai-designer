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

## Rules for later iterations

- **Never** put selection, viewport or tool state into the design (SPEC-007 §20); they live in the store.
- Subscribe narrowly: `useEditor((s) => s.display.components)` — never return a fresh object/array from
  a selector without `useShallow` (React would re-render forever).
- I16 renders `display` in the viewport region and drives `viewport`/`selection`/`tool` through the store
  actions; I17 replaces the hierarchy list and the debug panel with real panels that call `apply`.
- Capabilities in `meta.capabilities` are cosmetic; the API still authorizes each operation.
