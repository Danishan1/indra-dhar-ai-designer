---
description: Continue building the AI Designer platform — start or resume the next iteration from docs/plan
---

Follow the start protocol in `docs/plan/08-session-playbook.md` §1 exactly:

1. Run `git pull` (or `git status` if offline) and inspect any uncommitted changes before doing anything else.
2. Read `CLAUDE.md` and `docs/plan/PROGRESS.md`.
3. Select the iteration: the `in_progress` one if any (resume from its latest session-log entry), otherwise the lowest-numbered `todo` iteration whose dependencies are all `done`. $ARGUMENTS (if an iteration ID was given, target that one after checking its dependencies).
4. Read the iteration file in `docs/plan/iterations/` completely, then the spec sections it references in `docs/init/`, and any ADRs it lists in `docs/plan/05-decisions.md`.
5. Resolve open decisions: ask me briefly with a recommended default, or — if I am not available — apply the documented default and flag it in PROGRESS.md.
6. Make sure the environment is green (`pnpm install`, `pnpm infra:up` if applicable, `pnpm verify`).
7. Mark the iteration `in_progress` in PROGRESS.md, add a short plan to the session log, commit (`docs(plan): start I<NN>`).
8. Implement the checklist with small, green commits following `docs/plan/02-conventions.md`.
9. Before stopping, perform the handoff protocol (§3): update PROGRESS.md session log with the exact next step, commit, push. If the iteration is complete, run the finish protocol (§4) instead.
