# Claude Code slash commands

These are the project's custom Claude Code commands. They live here because the planning session could not write into `.claude/` remotely.

**Install once per clone** (I01 does this as its first task; do it manually if needed):

```bash
# macOS / Linux / Git Bash
mkdir -p .claude/commands && cp docs/plan/claude-commands/*-*.md .claude/commands/
```
```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force .claude\commands | Out-Null
Copy-Item docs\plan\claude-commands\*-*.md .claude\commands\
```

Then in Claude Code: `/next-iteration`, `/finish-iteration`, `/handoff`.
Without Claude Code (e.g. Cowork or another account), just say: **"Read CLAUDE.md and continue with the next iteration."** — the commands are only shortcuts for the protocol in `docs/plan/08-session-playbook.md`.

Keep `.claude/commands/` and this folder in sync if you edit a command (this folder is the source).
