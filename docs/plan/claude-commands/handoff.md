---
description: Save progress before switching machine/account or ending a session
---

Perform the handoff protocol from `docs/plan/08-session-playbook.md` §3:

1. Make sure the code compiles and tests that were green are still green; if mid-change, commit a coherent state (or stash-free WIP commit clearly labelled `wip(I<NN>): …`).
2. Update `docs/plan/PROGRESS.md`: iteration status, a session-log entry (done, exact next step, open questions, gotchas, commands needed to resume such as new migrations or env vars), ticked checklist.
3. If new env vars were introduced, make sure `.env.example` has them.
4. Commit `docs(plan): handoff I<NN> session <k>` and push.
5. Reply with the one-line instruction I should give the next session.
