# Instructions for Claude

## Coding standards

**Before any change to `app/` or `workers/`, read `docs/CODING-STANDARDS.md`.** It is the single source of truth for TypeScript, components, routes, loader/action shape, logging, env access, tests, imports, and comments. Don't repeat or re-derive those rules here — fix them in the standards doc instead.

## Environment variables — two-layer gate

Any new env var **must** be added to the appropriate layer; both must agree, or CI will block the deploy or the Worker will 503 on first request.

- **Layer 1 — `[secrets].required` in `wrangler.toml`** (deploy-time gate). Native Cloudflare feature: `wrangler versions upload` fails if any listed secret isn't configured on the prod Worker, so a missing secret keeps prod on the previous version instead of going live broken.
- **Layer 2 — `validateEnv()` in `app/lib/env.server.ts`** (runtime gate at fetch entry). Memoized per isolate. Catches what Cloudflare can't: missing non-secret `[vars]`, format/length checks, placeholder strings.

Where to add a new var:

| Kind                                                       | Action                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Secret (set via `wrangler secret put` / dashboard)         | Append to `[secrets].required` in `wrangler.toml` **and** to `.dev.vars.example`.                                 |
| Non-secret, prod-required (e.g. a public URL)              | Add to `wrangler.toml` `[vars]` for prod **and** to `REQUIRED_ALWAYS` (or `REQUIRED_PROD_ONLY`) in `validateEnv`. |
| Has format constraint (length, no placeholders, URL shape) | Add the check inside `validateEnv` alongside the existing ones.                                                   |
| Optional / has fallback path in code                       | Don't add to either layer — document the fallback at the call site.                                               |

Always run `npm run cf-typegen` after editing `wrangler.toml` so `worker-configuration.d.ts` stays in sync.

## Reference docs

- Table-tennis terminology: `docs/GLOSSARY.md`
- Tech-stack & architecture decisions: `docs/DECISIONS.md`
- UI/UX design: `docs/STYLE-GUIDE.md` + `docs/LAYOUT.md`
- SEO: `docs/SEO.md` — reference when designing any user-facing surface
- **Auth & RBAC patterns**: `docs/AUTH.md`
- **RLS policy patterns**: `docs/RLS.md`
- **Discord moderation workflow**: `docs/DISCORD.md`
- **E2E test requirements**: `docs/E2E.md`
- **Production observability**: `docs/OBSERVABILITY.md`
- **Plane API + wrapper**: `docs/PLANE.md`

## Work tracking — Plane

All planned work lives in Plane (workspace `tt-reviews`, project `TT Reviews`). See `docs/PLANE.md` for the API and the `./scripts/plane.sh` wrapper.

- **To check the board or pick up work**, invoke `/plane`. The skill at `.claude/skills/plane/SKILL.md` has the full workflow; the key rule is: move items to **In Progress** when you start, **Blocked** if you stall, **Completed** when the change is merged. Never leave finished work sitting in In Progress.
- Detailed plans that feed Plane items live in `archive/` (`SECURITY.md`, `QUALITY.md`, `DISCORD-HARDENING.md`, `REFACTORS.md`). Each Plane card links back to its section — read the plan before starting.
- New plans go in `archive/` as they're written (not `todo/` — that directory no longer exists).

## Interactions with my device

- Replace all references to `localhost` with `tt-reviews.local` (points at 127.0.0.1 in `/etc/hosts`). `localhost` has hit silent ipv6 failures with Supabase.

## Asking about tasks

Default posture: do as much as you can autonomously. User intervention is only needed for things that are genuinely unsafe, or that are product/feature judgement calls that aren't yours to make.

### Non-destructive (no permission needed)

- File operations: `ls`, `read`, `grep`, `find`, `cat`, `rg`.
- Git: `add`, `push`, `status`, `diff`, `log`.
- npm: `install`, `run build/test/lint/test:discord/test:e2e/dev`.
- Starting the dev server (`npm run dev`) — including letting Playwright's `webServer` config spawn it for e2e. Use `run_in_background` for long-running processes.
- Database reads: `SELECT` queries (via `docker exec` on the Supabase container).
- Updating markdown files (`*.md`) anywhere.
- `wrangler tail` and friends (see `docs/OBSERVABILITY.md`).

### Destructive (ask first)

- Code file edits, writes, deletes.
- Git commits.
- Database writes (`INSERT`/`UPDATE`/`DELETE`).
- System configuration changes.

### User-only

- `supabase db reset` — do NOT request unless the user types it in CAPITAL LETTERS (wipes local DB and re-runs seed).
- Other `supabase` CLI commands: you can run non-destructive ones yourself. `supabase migrations up` (apply pending migrations to the local DB) is fine. Anything that modifies cloud resources or clears data — ask first.

Production DB migrations auto-apply via the GitHub Actions deploy workflow on push to `main`.

## GitHub Actions

When editing `.github/workflows/`, use the latest major of any third-party action rather than whatever version is already pinned. Check with `gh api repos/<owner>/<action>/releases --jq '.[0].tag_name'` and read the release notes for breaking changes before bumping. Stale majors accumulate Node-runtime deprecation warnings and eventually break.

### Checking CI status

`gh run watch --exit-status <id>` is unreliable as a green/red signal — it propagates the latest non-zero step exit code, so a `continue-on-error: true` step that exited non-zero will make `watch` return 1 even when the run conclusion is `success`. Use `gh run view <id> --json status,conclusion` instead — `conclusion` is authoritative.

## `/ultrareview` — opt-in second opinion

For changes to `app/lib/submissions/**`, `app/lib/moderation.server.ts`, auth, or RLS migrations, ask me to run `/ultrareview` before pushing. Cheap second opinion on the risky paths.

## Commit message style

Prefix-colon pattern used throughout the history: `Fix:`, `Test:`, `Docs:`, `CI:`, `Build:`, `Lint:`. One-line title, short body explaining why. Ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
