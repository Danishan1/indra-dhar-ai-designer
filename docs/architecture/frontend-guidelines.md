# Frontend guidelines (apps/web)

Built in I04. Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS 4 + shadcn-style owned
components (Radix primitives via `radix-ui`) + TanStack Query 5. **Before writing routing, data
fetching or config code, read the matching guide in `apps/web/node_modules/next/dist/docs/`**
(`apps/web/AGENTS.md`): this Next.js version differs from older training data.

## Folders

| Path                      | What goes there                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app/(app)/…`         | Pages inside the app shell (sidebar + top bar). Session guard added in I05.                          |
| `src/app/(editor)/…`      | Full-viewport workspace routes (no app chrome).                                                      |
| `src/app/(public)/…`      | Sign-in/up, invitations (I05/I06).                                                                   |
| `src/app/api/…`           | Route handlers that belong to the web app only (e.g. `client-logs`). Business APIs live in apps/api. |
| `src/features/<feature>/` | Feature UI + `api.ts` (typed calls) + hooks. Pages stay thin: they import a feature component.       |
| `src/components/ui/`      | shadcn-style primitives — **owned source**: edit them, don't wrap them.                              |
| `src/components/shell/`   | App frame: sidebar, top bar, page header, command palette, placeholders.                             |
| `src/components/states/`  | `LoadingState`, `EmptyState`, `ErrorState`.                                                          |
| `src/lib/`                | API client, query setup, theme, shortcuts, local preferences, utils.                                 |

## Adding a feature (checklist)

1. Contracts first: request/response zod schemas in `packages/contracts` (shared with the API).
2. `features/<feature>/api.ts`: `apiRequest('/v1/…', { schema, method, body, idempotencyKey })`.
3. Query keys from `lib/query/keys.ts` — tenant data **always** under `queryKeys.org(organizationId)`.
4. Components use `useQuery`/`useMutation`; loading → `<LoadingState>`, failure → `<ErrorState error>`;
   mutation errors toast automatically (`meta: { silent: true }` to opt out).
5. A page in the right route group renders the feature component; add a nav item in
   `components/shell/nav-items.ts` if it is top-level.
6. Tests: Vitest unit tests next to the code (`// @vitest-environment jsdom` for DOM tests) and a
   Playwright spec in `tests/e2e/specs` for the user journey.

## Authentication

- `useSession()` → `{ status, user }` from `GET /v1/me`; `(app)` and `(editor)` layouts are wrapped in `RouteGuard`; `src/proxy.ts` redirects requests without a session cookie to `/sign-in?returnTo=…`.
- Any 401 from a query/mutation marks the session signed-out (query client); after sign-in/out call `resetUserData(queryClient, user)` — never `queryClient.clear()`.
- Redirect targets go through `safeReturnTo()` (same-origin paths only). Details: `docs/architecture/identity.md`.
- Auth forms use React Hook Form + `zodResolver` with the contract schemas and `meta: { silent: true }` mutations (inline errors instead of toasts).

## Organizations

- `(app)` layout wraps the shell in `OrganizationProvider`: `useOrganization()` → `{ organizations, active, setActive, can }`. A user without an active membership is sent to `/onboarding?returnTo=…` (route group `(setup)`).
- The active org id is a local preference (`aid.activeOrg`) re-validated against `GET /v1/orgs`; it is never trusted by the API — org-scoped calls put it in the path (`/v1/orgs/${active.id}/…`).
- Org-scoped query keys start with `queryKeys.org(orgId)`; switching org removes other orgs' cached queries.
- `can('members.invite')` / `usePermission()` / `<Can permission=…>` (`features/authorization/can.tsx`) come from `GET /v1/me/permissions` and only hide UI; the API enforces (`docs/architecture/authorization.md`).

## Form controls

- Never use the native `<select>`: its open list is drawn by the browser/OS and ignores the theme.
  Use `SimpleSelect` (or the `Select*` parts) from `components/ui/select.tsx` (Radix Select); it
  works inside `FormField` and with React Hook Form via `<Controller>`.

## API access

- The browser calls the API **same-origin** at `/v1/*`; `next.config.ts` rewrites it to `API_BASE_URL`
  (default `http://localhost:4000`). Same-origin keeps the session cookie first-party in I05 — never
  call `http://localhost:4000` directly from the browser.
- `apiRequest` sends `credentials: 'include'` and an `X-Request-Id`, validates responses with zod, and
  throws `ApiError { code, status, requestId, details }` built from the error envelope.
- `friendlyMessage(code)` maps codes to user wording; `toastApiError(err)` shows it with the request
  id as a copyable "reference" for support. Never show raw server messages for 5xx.
- Retry policy: no retries on 4xx; up to 2 on network/5xx (`lib/query/provider.tsx`).

## Design tokens (`src/app/globals.css`)

- Theme = `data-theme="dark|light"` on `<html>`, applied before first paint by an inline script;
  preference (`light|dark|system`, default **dark**) stored in `localStorage` key `aid.theme`.
- Semantic colors: `background`, `panel`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `border`, `input`, `ring`, `sidebar`, `viewport`. Use the Tailwind names
  (`bg-panel`, `text-muted-foreground`), never raw colors.
- Status colors: `status-confirmed|inferred|proposed|missing|needs-review|not-applicable`, `status-ok|down`.
  **Never color alone** (FR-EDT-129): pair with an icon and text — use `<ValueStatusBadge status>` for
  value statuses.
- Density: body 14px, controls `h-8` (sm `h-7`), 13px control text, 11px panel titles/badges.
- Focus: `:focus-visible` outline (2px `ring`) everywhere; don't remove it.

## Keyboard & accessibility

- Register shortcuts with `useShortcut({ id, combo: 'mod+k', description, handler })`; they are
  ignored while typing in inputs/textareas/contenteditable unless `allowInInputs` (FR-EDT-127).
  `mod` = Ctrl (Windows/Linux) or ⌘ (macOS). Show combos with `formatCombo()`.
- Current shortcuts: `mod+k` search, `mod+b` sidebar, `alt+1/2/3` editor hierarchy/properties/operations.
- Every icon-only button has an `aria-label` (+ tooltip). Landmarks: sidebar `aside`, `main#main`,
  "Skip to content" link. Editor regions are `section[data-region][aria-label]`.

## Local preferences

`lib/local-preferences.ts` is the only place that touches `localStorage`: theme, sidebar state,
editor panel sizes (`aid.editor.layout.*`). **Never** tokens, user data or business data
(SPEC-009 FR-SEC-052). Read preferences after mount (or render client-only) to avoid hydration
mismatches.

## Editor layout

`features/editor/editor-workspace.tsx` (I04 skeleton) defines the six regions of SPEC-007 §5:
`header`, `toolbar`, `hierarchy`, `viewport`, `properties`, `operations`, built with
`react-resizable-panels` v4 (`Group`/`Panel`/`Separator`, `useDefaultLayout` for persistence,
`usePanelRef` for collapse). Collapsing panels is UI state only — it never changes design data
(FR-EDT-008). `/editor/demo` shows it in development; I15 replaces the placeholders.

## E2E

`tests/e2e` (Playwright). `pnpm e2e` starts API + web if they are not running (infra must be up).
First time on a machine: `pnpm e2e:install` (downloads Chromium). To use an existing Chromium set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
