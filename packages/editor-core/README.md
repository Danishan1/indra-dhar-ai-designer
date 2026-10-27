# @ai-designer/editor-core

Framework-free editor engine (I15, ADR-050). Immutable functions over plain objects; the web app keeps
the values in a Zustand store (`apps/web/src/features/editor/store.ts`). See
`docs/architecture/editor.md`.

| Module             | Exports                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `command-stack.ts` | `createCommandStack`, `recordOperation`, `completeUndo`, `completeRedo`, `revertSequence`, `clearHistory`…      |
| `selection.ts`     | `select` (replace / add / toggle), `selectMany`, `clearSelection`, `pruneSelection`                             |
| `viewport.ts`      | `zoomTo` (anchored), `zoomBy`, `panBy`, `fitToBounds`, `toScreen`, `toWorld`, `zoomLabel`                       |
| `tools.ts`         | `setTool`, `holdTool` / `releaseTool` (temporary tools, e.g. Space → pan)                                       |
| `pending-ops.ts`   | `enqueue`, `takeBatch`, `ackBatch`, `markAttemptFailed`, `dropBatch`, `returnToQueue`, `replay`, `retryDelayMs` |
| `save-state.ts`    | `saveReducer` (saved / saving / unsaved / save_failed / conflict / offline), `SAVE_STATUS_LABELS`               |

History entries hold **server operation ids**; undo/redo are `revert_operation` requests, never local
snapshots. Selection, viewport and tools are view state and never part of the design.
