# Instructions for Claude

## Reference docs

- Table-tennis terminology: `docs/GLOSSARY.md`
- Application requirements: `docs/reqs/` (all `.md` files)
- Tech-stack & architecture decisions: `docs/DECISIONS.md`
- **Coding standards**: `docs/CODING-STANDARDS.md` — follow for all code
- UI/UX design: `docs/STYLE-GUIDE.md` + `docs/LAYOUT.md`
- SEO: `docs/SEO.md` — reference when designing any user-facing surface
- **Auth & RBAC patterns**: `docs/AUTH.md`
- **RLS policy patterns**: `docs/RLS.md`
- **E2E test requirements**: `docs/E2E.md`
- **Production observability**: `docs/OBSERVABILITY.md`
- Reliability / CI plan: `todo/RELIABILITY.md`

## TODOs

- Bugs → `todo/BUGS.md`, features → `todo/FEATURES.md`. Read both at the start of every conversation.
- Archived plans: `docs/archive/`.

## Interactions with my device

- Replace all references to `localhost` with `tt-reviews.local` (points at 127.0.0.1 in `/etc/hosts`). `localhost` has hit silent ipv6 failures with Supabase.

## Asking about tasks

### Non-destructive (no permission needed)

- File operations: `ls`, `read`, `grep`, `find`, `cat`, `rg`.
- Git: `add`, `push`, `status`, `diff`, `log`.
- npm: `install`, `run build/test/lint/test:discord/test:e2e`.
- Database reads: `SELECT` queries (via `docker exec` on the Supabase container).
- Updating markdown files (`*.md`) anywhere.
- `wrangler tail` and friends (see `docs/OBSERVABILITY.md`).

### Destructive (ask first)

- Code file edits, writes, deletes.
- Git commits.
- Database writes (`INSERT`/`UPDATE`/`DELETE`).
- System configuration changes.

### User-only

- Running the dev server (`npm run dev`) — ask me.
- Any `supabase` CLI command — I'll run them locally.
- `supabase db reset` — do NOT request unless the user types it in CAPITAL LETTERS.

Production DB migrations auto-apply via the GitHub Actions deploy workflow on push to `main`.

## Frontend components

- Break large JSX into small, focused components.
- Shared UI in `app/components/ui/`; feature-specific in `app/components/<feature>/`.
- Composition over monoliths. Single responsibility per component.
- Explicit TypeScript prop interfaces.
- Use layout components (`PageLayout`, `PageSection`) for structure; avoid inline JSX blocks.

## Routing (React Router v7, file-based)

- `app/routes.ts` uses `flatRoutes()` from `@react-router/fs-routes` — no manual registration.
- Nested routes via dot notation: `equipment.tsx` (layout with `<Outlet />`), `equipment._index.tsx`, `equipment.$slug.tsx`, `equipment.submit.tsx`.
- `$foo` is a dynamic segment. `_index.tsx` is the index route of a layout.
- Child routes render inside the layout's `<Outlet />` — don't duplicate Navigation/Footer/PageLayout in children.
- Specificity wins automatically (`/equipment/submit` before `/equipment/:slug`).
- When renaming/deleting a route file, delete stale generated types under `.react-router/types/app/routes/+types/`.

## TypeScript rules

(Hooks enforce typecheck + lint on git commit/push — you will be blocked if these fail; the rules below are about style, not enforcement.)

- Define explicit types for function params, return types, and component props.
- Prefer `unknown` over `any` and narrow. If `any` is truly unavoidable, an `eslint-disable-next-line @typescript-eslint/no-explicit-any` is required (enforced by lint).
- Type guards, not optional chaining, for runtime type checks: `if ("success" in actionData && actionData.success)`.
- Env cast: `context.cloudflare.env as unknown as Record<string, string>`.
- When you add a new field type / enum value / interface, update every consumer — `FieldType` union in `app/lib/submissions/registry.ts`, the relevant `types.ts` / `moderation.server.ts` / `database.server.ts` unions.

Logger usage: `import { Logger, createLogContext } from "~/lib/logger.server"`, then `Logger.info("...", { requestId, customField })`.

## E2E test requirement

Any new feature or any change touching UI / routes / forms / submissions / admin queues / moderation / Discord interactions **must** ship with a Playwright spec. Run `npm run test:e2e` before declaring done. See `docs/E2E.md` for helpers and patterns. No exceptions — the test is part of the feature.

## GitHub Actions

When editing `.github/workflows/`, use the latest major of any third-party action rather than whatever version is already pinned. Check with `gh api repos/<owner>/<action>/releases --jq '.[0].tag_name'` and read the release notes for breaking changes before bumping. Stale majors accumulate Node-runtime deprecation warnings and eventually break.

## `/ultrareview` — opt-in second opinion

For changes to `app/lib/submissions/**`, `app/lib/moderation.server.ts`, auth, or RLS migrations, ask me to run `/ultrareview` before pushing. Cheap second opinion on the risky paths.

## Commit message style

Prefix-colon pattern used throughout the history: `Fix:`, `Test:`, `Docs:`, `CI:`, `Build:`, `Lint:`. One-line title, short body explaining why. Ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
