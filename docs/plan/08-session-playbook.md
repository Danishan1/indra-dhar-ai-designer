# 08 — Session Playbook (how every Claude session works)

The whole platform is built by Claude across many sessions, machines and possibly accounts. This protocol makes each session self-sufficient: **the repository is the memory.** Nothing important may live only in a chat.

---

## 1. Starting a session

The human only needs to say one of:

| Human says                                                                 | Claude does                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Read CLAUDE.md and continue with the next iteration.` / `/next-iteration` | Full start protocol below, then works on the current/next iteration                          |
| `Continue I17.`                                                            | Same, but targets I17 explicitly (must still check dependencies)                             |
| `Finish the iteration.` / `/finish-iteration`                              | Runs the finish protocol (§4) on the in-progress iteration                                   |
| `Status?`                                                                  | Summarizes `PROGRESS.md` (current iteration, done/remaining, blockers) without changing code |

### Start protocol (do in order)

1. `git pull` (or confirm with the human that the working copy is up to date). If there are uncommitted changes from a previous session, inspect them before doing anything else.
2. Read `CLAUDE.md`, then `docs/plan/PROGRESS.md`.
3. Identify the target iteration:
   - If an iteration is `in_progress` → continue it (read its **Session log / handoff notes** in PROGRESS.md).
   - Else → the lowest-numbered `todo` iteration whose dependencies are all `done`.
4. Read the iteration file `docs/plan/iterations/I<NN>-*.md` completely.
5. Read the spec sections listed in its header (from `docs/init/`). Use `00-spec-digest.md` for orientation, but **the original spec text wins** if they differ.
6. Check `05-decisions.md` for decisions listed under "Open decisions to resolve first". If one is Open:
   - If the human is present → ask concisely, offering the recommended default.
   - If not → apply the recommended default, mark it `Accepted (default applied by Claude, <date>)`, and flag it in PROGRESS.md for owner review.
7. Verify the environment: `pnpm install`, `pnpm infra:up` (from I02 on), `pnpm verify` should be green before you start. If it is red, fixing it is the first task.
8. Mark the iteration `in_progress` in PROGRESS.md (with date + machine/account label if known) and commit `docs(plan): start I<NN>`.
9. Write a short plan (tasks from section 7 of the iteration file, adapted to the current code) in the PROGRESS.md session log before coding.

## 2. During the session

- Work through the iteration checklist in order. Keep the scope: if you discover necessary work outside scope, add it to the right later iteration file's "Risks & notes" or to `09-backlog.md` rather than doing it now — unless it blocks the current iteration.
- Commit at every meaningful green step (`feat(I<NN>): …`). Small commits make multi-machine handoffs safe.
- Run the relevant tests continuously; never leave the main branch red at the end of a session.
- Follow `02-conventions.md`. Any deviation from the plan, architecture or a spec → record it (PROGRESS.md "Deviations" + ADR if architectural).
- If you must stop mid-iteration (context limit, time), do the **handoff protocol (§3)** first.

## 3. Handoff protocol (end of every session, finished or not)

Before the session ends, update `docs/plan/PROGRESS.md`:

1. Iteration status (`in_progress` / `done` / `blocked`).
2. **Session log entry**: date, what was done (bullets), what is next (exact next step), open questions, gotchas discovered, commands to run to resume (e.g. "run `pnpm prisma migrate dev` — new migration added").
3. Tick completed checklist items (copy the iteration's task list into the session log and tick).
4. Commit and push: `docs(plan): handoff I<NN> session <k>`.

A new session on another machine must be able to continue using **only** the repository content.

## 4. Finish protocol (iteration complete)

1. Verify every acceptance criterion; run `pnpm verify`, `pnpm test:integration`, and relevant E2E. Record results.
2. Walk the Definition of Done (`02-conventions.md` §10).
3. Fill the iteration file's **Completion record** (§12).
4. Update `PROGRESS.md`: status `done`, completion date, summary, deviations, follow-ups; set the **Next iteration** pointer.
5. Update `05-decisions.md` (decisions taken) and `09-backlog.md` (deferred items) if applicable.
6. If the iteration completes a milestone → run the milestone demo scenario from `04-roadmap.md`, then tag (`git tag m3-editor-alpha`).
7. Commit + push. Report to the human in 3–6 lines: what was built, how to try it, anything they must decide.

## 5. Working on multiple machines / accounts

- **Always push before switching machines**, always pull when starting.
- Local-only state that does _not_ travel with git: Docker volumes (DB data, objects), `.env` files, `node_modules`. Recreate with: copy `.env.example` → `.env`, `pnpm install`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:seed` (scripts created in I02/I03). Seeds must make any machine usable for development within minutes.
- Two machines in parallel: only on independent iterations (no dependency path between them), on separate branches, both listed as `in_progress` in PROGRESS.md with branch names. Merge one at a time; the second rebases.
- Different Claude accounts/products (Claude Code CLI, Cowork, Claude.ai with repo access) all follow this same playbook; `CLAUDE.md` is auto-loaded by Claude Code, other products should be told "Read CLAUDE.md first".

### Remote sessions (Claude Cowork / cloud workspace linked to the owner's computer)

- The linked computer's shell cannot delete files (breaks `pnpm install` and git) and is Linux while the owner's machine is Windows (native `node_modules` binaries would not match). Therefore: **clone/keep the repo in the cloud workspace, install, build and test there, then copy only source files (never `node_modules`, `.next`, `dist`, `.turbo`, `.env`) into the linked folder** with the file-commit tool (`.claude/` cannot be written remotely — keep `docs/plan/claude-commands/` as the source).
- If the linked folder has newer changes (e.g. the owner edited or pulled), stage them into the cloud workspace first.
- Git history lives in whichever clone pushes; when the owner sets up a remote, prefer cloning from it in the cloud workspace at session start.
- Docker runs in the cloud workspace (`dockerd &`) but **Docker Hub, ghcr.io and binaries.prisma.sh are blocked** there. Use `bash infra/scripts/cloud-sandbox-infra.sh` (local PostgreSQL 16 + redis-server + moto S3 on the compose ports; needs `pip install "moto[server]" --break-system-packages`), then `cp .env.example .env`.
- Prisma in the sandbox: export `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true` so `prisma generate` skips the blocked engine download (generation itself uses WASM). Create/apply migrations with `pnpm db:migrate:fallback diff <i##_name>` / `pnpm db:migrate:fallback deploy` (Prisma's WASM schema engine; same SQL as `prisma migrate dev`). Integration tests don't need the engine.
- Keep a `device-synced` git tag in the cloud clone to know which files changed since the last sync to the owner's folder.

## 6. Asking the human

Ask only when blocked on a product/business decision that is truly the owner's (pricing, provider choice, categories, legal policies) or when an action is destructive/irreversible. Otherwise choose the documented default and record it. Keep questions short with a recommended option.

## 7. Quality gates Claude applies to its own work

- Re-read the acceptance criteria before claiming done; show evidence (test names/output).
- For security-sensitive code (auth, authz, secrets, billing, tenant isolation) add negative tests (unauthorized, cross-tenant, replay, duplicate delivery).
- For immutable records, add a test that an update attempt fails.
- For anything AI-related, test with the fake adapter's failure scripts (timeout → `outcome_unknown`, rate-limit, malformed output).
- Never mark AI-inferred values `confirmed`; grep for it in review.

## 8. Prompt templates the human can use

```text
Read CLAUDE.md and continue with the next iteration.
```

```text
Continue the current iteration. Today I only have ~1 hour: finish a coherent sub-part, then hand off.
```

```text
Finish the iteration: verify all acceptance criteria, update the completion record and PROGRESS.md, commit and push.
```

```text
We are switching to another machine now. Do the handoff protocol, commit and push.
```

```text
Run the M3 milestone demo scenario and tell me how to try it myself.
```

```text
Decision: use <X> for ADR-0NN. Record it in 05-decisions.md and adjust the affected iteration files.
```
