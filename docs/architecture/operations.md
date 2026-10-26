# Design operations (I14)

Every change to a design's working copy is a **design operation**: typed, validated, applied atomically and recorded with provenance. Decisions: ADR-049. Operation types and the pure engine: `packages/design-operations/README.md`.

## Flow (`POST /v1/orgs/:orgId/designs/:designId/operations`)

1. Parse the envelope (`operation`, `preservationConstraints`, `sourceRefs`, `executionPolicy`) — 400 on schema errors; internal types are not accepted.
2. Select the strategy (deterministic first; AI-only types → 422 `UNSUPPORTED_CAPABILITY`).
3. Transaction: lock the working copy (`SELECT … FOR UPDATE`), check `expectedVersion` (409 `CONCURRENT_MODIFICATION` with `currentVersion`), check the project allows changes.
4. Resolve the artifact revisions the operation names (only ones visible to the caller).
5. `applyOperation` (pure) → blocking findings → 422 `VALIDATION_BLOCKED` (audited, nothing stored); no change → 409 `NO_CHANGES`.
6. `WorkingCopyService.writeOperationState` (version + 1, uncommitted-changes flag, `designs.working_copy_updated`), insert `DesignOperation` (`OPR-…`, base/result versions, targets, normalized request, constraints, strategy + rationale, findings, inverse, result hashes), outbox `operations.design_operation_completed`.
7. Response: the operation, the new working-copy version and a **patch** of changed entities (apply with `applyEntityPatch`).

`POST …/operations/validate` runs the same steps and rolls back (dry run for previews). `GET …/operations` lists history; `GET /v1/orgs/:orgId/operations/:operationId` shows one.

## Undo / redo

Submit `{ type: 'revert_operation', operationId }`. The server applies the inverse stored with that operation if the entities it changed are still as it left them; otherwise 409 (`changed_since`) — undo later changes first. Reverting a revert is redo. The original is marked `reverted`.

## Rules

- Nothing else changes `working_copies.state` (commit/restore write revision states; tests assert the single writer).
- The client never sends provenance: confirmations are stamped with the caller.
- Imports and system tools use `OperationsService.applyInternal` (`replace_state`, `restore_entities`) — also recorded.
- On commit, pending operations get `result_revision_id` and the revision lists them in `operation_ids`.
- Dev demo: `pnpm --filter @ai-designer/api ops:demo -- <designId>`.
