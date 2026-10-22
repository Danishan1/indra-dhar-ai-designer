# logs/

Local log files written by the running apps. **Everything in this folder except this README is
git-ignored** — logs stay on the machine that produced them.

| Folder    | Files                                                  | Contents                                                                    |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `api/`    | `api.<date>.<n>.log`, `api-error.<date>.<n>.log`       | NestJS API: requests (with `requestId`), app events; `-error` = errors only |
| `worker/` | `worker.<date>.<n>.log`, `worker-error.<date>.<n>.log` | Background jobs (BullMQ)                                                    |
| `web/`    | `server.<date>.<n>.log`, `server-error.<date>.<n>.log` | Next.js server: request/render errors (`instrumentation.ts`)                |
| `web/`    | `client.<date>.<n>.log`, `client-error.<date>.<n>.log` | Errors reported by browsers (`/api/client-logs`)                            |

Files are JSON lines (one log entry per line), rotate daily and at `LOG_FILE_MAX_SIZE` (default 10m),
and the newest `LOG_FILE_RETENTION` files (default 14) per stream are kept. Secrets (passwords, tokens,
API keys, auth headers, cookies) are redacted before writing.

## Viewing

```bash
pnpm logs                     # last 50 entries from every service, pretty-printed, merged by time
pnpm logs api                 # one service: api | worker | web
pnpm logs web --errors        # only the error files
pnpm logs -f                  # follow (live tail); Ctrl+C to stop
pnpm logs api -n 200          # more history
pnpm logs --raw               # raw JSON lines (pipe into other tools)
pnpm logs --clear             # delete all local log files
```

## Settings (`.env`)

`LOG_TO_FILE` (default `true` in development, `false` otherwise) · `LOG_DIR` (default this folder) ·
`LOG_LEVEL` · `LOG_PRETTY` (console only) · `LOG_FILE_MAX_SIZE` · `LOG_FILE_RETENTION` ·
`CLIENT_LOGS_ENABLED` (browser error reporting endpoint; default development only).
