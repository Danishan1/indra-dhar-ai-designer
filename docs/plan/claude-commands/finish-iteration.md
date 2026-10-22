---
description: Verify and close the in-progress iteration (acceptance criteria, DoD, docs, commit, push)
---

Run the finish protocol from `docs/plan/08-session-playbook.md` §4 for the iteration marked `in_progress` in `docs/plan/PROGRESS.md`:

1. Check every acceptance criterion in the iteration file; run `pnpm verify`, `pnpm test:integration` (if backend touched) and relevant `pnpm e2e` specs. Show the evidence.
2. Walk the Definition of Done in `docs/plan/02-conventions.md` §10 and fix gaps.
3. Fill the iteration file's "Completion record".
4. Update PROGRESS.md: status `done`, dates, sessions used, deviations, next-iteration pointer, milestone status if reached.
5. Update `docs/plan/05-decisions.md` and `docs/plan/09-backlog.md` if anything was decided or deferred.
6. If a milestone was reached, run its demo scenario from `docs/plan/04-roadmap.md` and create the git tag.
7. Commit and push. Then tell me in a few lines what was built, how to try it, and what I need to decide next.
