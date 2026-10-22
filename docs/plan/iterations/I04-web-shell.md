# I04 — Web app shell & design system

| Field                           | Value                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase                           | 0 — Foundation & platform primitives                                                                                                                                                                                                                                |
| Subsystems                      | SS-04 (frontend foundation), cross-cutting UI                                                                                                                                                                                                                       |
| Depends on                      | I01, I03                                                                                                                                                                                                                                                            |
| Estimated sessions              | 1–2                                                                                                                                                                                                                                                                 |
| Spec references                 | `docs/init/01-overview.md` §2.1–2.2 (FR-001 professional desktop-like app); `docs/init/07-editor.md` §5 (workspace regions), §18 (keyboard & accessibility); `docs/init/11-tech-stack.md` §3.1; `docs/plan/01-architecture.md` §6; `docs/plan/02-conventions.md` §6 |
| Open decisions to resolve first | none                                                                                                                                                                                                                                                                |

## 1. Goal

Establish the frontend foundation so every feature iteration only adds feature code: Tailwind + shadcn/ui design system with a professional dark/light theme, the authenticated-app shell (sidebar, top bar, org slot, content area), the full-viewport editor layout skeleton, a typed API client built on `packages/contracts`, TanStack Query setup, error/toast handling bound to the error envelope, and a Playwright smoke test. Milestone **M1** completes here.

## 2. Scope

### In scope

- Tailwind CSS, shadcn/ui init (owned components in `components/ui`), Lucide icons, CSS variable theme tokens; dark default for editor, user-selectable theme (light/dark/system) persisted in `localStorage` (non-sensitive preference only).
- Layouts: `(public)` (auth pages placeholder), `(app)` shell with collapsible sidebar (Projects, Library, Billing, Settings, Admin placeholders), top bar (org switcher placeholder, user menu placeholder, global search placeholder), `(editor)` full-viewport layout with resizable panel regions (header, toolbar, left hierarchy, center viewport, right properties, bottom operations/status) using a resizable-panels component — all empty placeholders.
- API client: `lib/api/client.ts` (fetch wrapper, `credentials: 'include'`, request id header, parses error envelope into `ApiError` with `code`), zod-validated responses from `packages/contracts`.
- TanStack Query provider with sensible defaults; query-key factory convention including `organizationId`.
- Global UI primitives: `<ErrorState>`, `<EmptyState>`, `<LoadingState>`, toast notifications mapping error codes to friendly messages, `<ValueStatusBadge>` placeholder (vocab from contracts; used from I11 on), keyboard shortcut registry skeleton that ignores events from inputs (FR-EDT-127).
- A system status page in the app shell calling `/v1/health/ready` (proves web↔api).
- Playwright setup (`tests/e2e`) with one smoke test.

### Out of scope (deferred to)

- Auth pages and session handling (→ I05)
- Org switcher behavior (→ I06)
- Editor functionality (→ I15+)

## 3. Deliverables

- `apps/web/src/app/(public)/…`, `apps/web/src/app/(app)/layout.tsx`, `apps/web/src/app/(editor)/layout.tsx`
- `apps/web/src/components/ui/*` (shadcn: button, input, dialog, dropdown-menu, tooltip, tabs, toast/sonner, table, badge, skeleton, resizable, scroll-area, separator, sheet, command)
- `apps/web/src/components/shell/{sidebar,topbar,page-header}.tsx`
- `apps/web/src/lib/{api/client.ts,api/errors.ts,query/provider.tsx,query/keys.ts,shortcuts.ts,theme.tsx}`
- `apps/web/src/features/system/status-page.tsx`
- `tests/e2e/playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- `docs/architecture/frontend-guidelines.md` (short: folder conventions, how to add a feature, design tokens)

## 4. Data model changes

None.

## 5. API / contracts

Consumes `GET /v1/health/ready`. No new endpoints. Next.js config proxies `/v1/*` to the API in dev (same-origin cookies for I05) — document this.

## 6. UI

- App shell with placeholder navigation; status page; editor layout skeleton route `/editor/demo` (dev only) showing the panel regions with labels.
- Visual direction: dense, neutral, "design-software" feel (SRS FR-001): compact spacing, 13–14px base text in editor, subtle borders, focus rings always visible.

## 7. Implementation tasks (ordered checklist)

1. [x] Install Tailwind + shadcn/ui; define tokens (background, panel, border, accent, status colors for confirmed/inferred/proposed/missing/needs_review — each with icon/shape so not color-only, FR-EDT-129).
2. [x] Theme provider (dark/light/system).
3. [x] App shell layout + sidebar + top bar with placeholders.
4. [x] Editor layout with resizable, collapsible panels; panel sizes persisted per user locally (FR-EDT-002/003).
5. [x] API client + `ApiError` + error-code → message map; dev rewrite/proxy to API.
6. [x] Query provider, key factory, default retry policy (no retry on 4xx).
7. [x] Shortcut registry ignoring inputs/contenteditable.
8. [x] Status page using the client.
9. [x] Playwright config (starts web+api via `webServer` or expects `pnpm dev`), smoke test.
10. [x] Frontend guidelines doc; update `PROGRESS.md`; tag `m1-walking-skeleton` when M1 exit criteria pass.

## 8. Tests

- Unit (Vitest + Testing Library): API client parses error envelope; shortcut registry ignores input targets; theme toggle.
- E2E: app shell loads; status page shows "ok" for all dependencies; editor skeleton renders 6 regions; keyboard focus visible on sidebar items.

## 9. Acceptance criteria

- [x] AC1 — App shell and editor skeleton render with a professional, desktop-software look (SRS FR-001; SPEC-007 FR-EDT-001).
- [x] AC2 — Editor panels are resizable/collapsible and opening/closing them changes no data (FR-EDT-002, FR-EDT-008).
- [x] AC3 — Web calls API through the typed client; error envelope is surfaced as a friendly toast with request id available for support.
- [x] AC4 — Status indicators do not rely on color alone (FR-EDT-129).
- [x] AC5 — Playwright smoke passes locally. **M1 exit** criteria in `04-roadmap.md` satisfied.

## 10. Risks & notes

- **Next.js 16 note (found in I02):** `next dev` writes `apps/web/AGENTS.md` saying this Next.js version has breaking changes vs. training data — read the relevant guides in `apps/web/node_modules/next/dist/docs/` before writing routing/data-fetching code, and keep `AGENTS.md` committed.

- Do not store tokens or any sensitive data in `localStorage` (SPEC-009 FR-SEC-052); UI preferences only.
- Keep shadcn components as owned source — customize, don't wrap excessively.
- Same-origin dev proxy now avoids CORS/cookie pain in I05.

## 11. Handoff

- I05 adds `(public)` auth pages and session-aware layout guard.
- I15 fills the editor layout.
- Record any design-token decisions in the frontend guidelines doc.

## 12. Completion record

- Completed on: 2026-10-22
- Sessions used: 1
- Deviations from plan:
  - ADR-040: shadcn components written by hand (registry blocked in cloud sessions) — same structure, owned in `components/ui` (button, input, badge, skeleton, separator, kbd, tooltip, dialog, sheet, dropdown-menu, tabs, scroll-area, table, sonner, command, resizable).
  - Theme uses `data-theme` on `<html>` + inline pre-paint script (Next 16 "preventing flash" guide) instead of a theme library; default **dark** everywhere.
  - Editor demo route is `/editor/demo` (route group `(editor)`), rendered client-only because panel sizes come from local storage; 404 in production.
  - Added `value-status.ts` to contracts (`ValueStatuses`, labels) for `<ValueStatusBadge>`.
  - Added a dev-only "Trigger test error" diagnostic on `/system` to exercise envelope → toast (AC3).
  - Playwright lives in workspace package `tests/e2e` (`pnpm e2e`, `pnpm e2e:install`); its `webServer` starts API + web or reuses running ones.
  - ESLint import order: `@/…` alias now grouped as internal (packages/config). Logger path lookups marked `turbopackIgnore` so `next build` no longer traces the whole repo.
- Verification:
  - `pnpm verify` green; web unit tests 27 (API client envelope/network/contract/idempotency, shortcut registry incl. inputs/contenteditable, theme persistence, value-status badge per status, retry policy).
  - `pnpm e2e` 10/10: shell + navigation, visible keyboard focus, status page all "Operational" via web→API proxy, command palette (Ctrl/⌘+K), placeholders, API error toast with reference, 6 editor regions, collapse/expand with no non-GET requests, panel size persisted across reload, status legend icon+text.
  - `next build` clean (no warnings). Screenshots reviewed in dark and light.
  - **M1 exit:** `pnpm dev` started web + api + worker; `GET /v1/health/ready` via the web origin → all ok; `POST /v1/_dev/echo-idempotent` via the web origin → `JOB-000002` succeeded through outbox → BullMQ → worker. Tagged `m1-walking-skeleton`.
- Follow-ups: I05 adds the session guard to `(app)` and real sign-in pages; I06 the org switcher; I15 fills the editor regions.
