# Projects (I10)

A **project** is one garment style being designed and developed; designs (I12), sources, tech packs and exports hang off it. Decisions: ADR-045.

## Lifecycle

States: `ACTIVE`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`, `DELETED` (terminal, logical). The only transition table is `LIFECYCLE_TRANSITIONS` in `packages/contracts/src/projects/lifecycle.ts`; the API and the web UI both use it (`canTransition`, `allowedActions`, `isEditable`).

| Action   | From               | To        | Permission        |
| -------- | ------------------ | --------- | ----------------- |
| hold     | ACTIVE             | ON_HOLD   | `project.edit`    |
| resume   | ON_HOLD            | ACTIVE    | `project.edit`    |
| complete | ACTIVE, ON_HOLD    | COMPLETED | `project.edit`    |
| reopen   | COMPLETED (reason) | ACTIVE    | `project.archive` |
| archive  | any visible state  | ARCHIVED  | `project.archive` |
| restore  | ARCHIVED           | ACTIVE    | `project.archive` |
| delete   | any visible state  | DELETED   | `project.delete`  |

Metadata is editable only while `ACTIVE` or `ON_HOLD`. "Completed" means the work is finished, not that designs are approved. Each transition is a single transaction: status-guarded `updateMany`, audit event `project.<action>`, outbox event `projects.project_*`. Invalid transitions return `INVALID_STATE_TRANSITION`. Archived projects stay readable and searchable via the Status filter.

## Plugging other modules in

`ProjectLifecycleRegistry` (global, exported by `ProjectsModule`):

- `registerDependents(key, fn)` — returns counts of things that depend on a project (designs, revisions…). The delete dialog shows them; `DELETE` without `?acknowledgeDependents=true` returns 409 `has_dependents` when any count is non-zero.
- `registerCompletionCheck(key, fn)` — returns blockers; `complete` returns 422 `VALIDATION_BLOCKED` while any exist.

Both registries are empty until I12/I28.

## Visibility and grants

`visibility` is `organization` (default; role permissions apply) or `restricted` (grant or `project.manage_access` required; see `authorization.md`). Grants are for `project.view` or `project.view`+`project.edit`, only for active members, replacing any earlier grant of that user; revoke with `DELETE …/projects/:id/grants?userId=`.

## API

Routes under `/v1/orgs/:orgId/projects`: list/create, `:projectId` get/patch/delete, `PUT :projectId/visibility`, `POST :projectId/{hold,resume,complete,reopen,archive,restore,duplicate}`, `GET :projectId/dependents`, `GET|POST|DELETE :projectId/grants`. Mutations accept `Idempotency-Key`. PATCH needs `expectedVersion` (409 on conflict; a no-op does not bump it).

## Web

`apps/web/src/features/projects/`: dashboard (search, status/category/season/brand filters, sort, grid/list remembered per browser), create dialog, overview with Details and Access tabs, lifecycle confirmation dialogs.
