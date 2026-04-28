# Instructions for Claude

## Coding standards

**Before any change to `app/` or `workers/`, read `docs/CODING-STANDARDS.md`.** It is the single source of truth for TypeScript, components, routes, loader/action shape, logging, env access, tests, imports, and comments. Don't repeat or re-derive those rules here — fix them in the standards doc instead.

## Data model — manufacturer vs review data

Two distinct kinds of equipment data live in this app; don't conflate them when scoping work.

- **Manufacturer data** (`equipment.specifications` JSONB): values as the manufacturer publishes them — weight, thickness, hardness, plus marketing-style speed/spin/control ratings. Not necessarily reliable, and scales aren't comparable across brands — DHS "speed 12" and Butterfly "speed 12" don't mean the same thing. Typed schema is locked in `archive/EQUIPMENT-SPECS.md`.
- **Review data** (`equipment_reviews.category_ratings`, `equipment_reviews.overall_rating`): community-moderated "out of 10" ratings from players who've actually used the equipment. The trustworthy comparable signal.

Public equipment submissions capture manufacturer data only — if a user wants to share their playing experience, they go through the review flow separately. Editing existing manufacturer data is admin-only (tracked in TT-74); there is no public edit form for equipment today.

## Environment variables — runtime gate + smoke fallback

Any new env var the app actually requires **must** be registered with `validateEnv` in `app/lib/env.server.ts`. Otherwise it'll be silently undefined at runtime and surface as a 500 in whichever loader/action reads it.

- **`validateEnv()`** runs once per Worker isolate at the top of `fetch`. On failure it 503s every request and logs the offending var names. That gives "fail-fast on first request after deploy" instead of "lazy 500 on first form submit," and CI's preview-smoke step (`main.yml:355`, runs after `wrangler versions upload` and before promote) hits enough routes that a 503 there blocks the promote — so a misconfigured Worker can't replace a healthy one in prod.
- We don't use Cloudflare's native `[secrets].required` deploy gate. It works, but defining it filters `.dev.vars` to only the listed keys, which drops `ENVIRONMENT=development` from the e2e CI dev server and breaks login over plain HTTP. The deploy-time gate is tracked separately on the board for revisit.

Where to add a new var:

| Kind                                                       | Action                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Secret (set via `wrangler secret put` / dashboard)         | Append to `REQUIRED_PROD_ONLY` in `validateEnv` **and** to `.dev.vars.example`. Set the prod secret before merging. |
| Non-secret, prod-required (e.g. a public URL)              | Add to `wrangler.toml` `[vars]` for prod **and** to `REQUIRED_ALWAYS` (or `REQUIRED_PROD_ONLY`) in `validateEnv`.   |
| Has format constraint (length, no placeholders, URL shape) | Add the check inside `validateEnv` alongside the existing ones.                                                     |
| Optional / has fallback path in code                       | Don't add to `validateEnv` — document the fallback at the call site.                                                |

Don't infer dev/prod from `env.ENVIRONMENT` in new code; pass `import.meta.env.DEV` from the Worker entry. The runtime var lies under `react-router dev` because top-level `[vars]` wins over `.dev.vars`.

Always run `npm run cf-typegen` after editing `wrangler.toml` so `worker-configuration.d.ts` stays in sync.

## Reference docs

- Table-tennis terminology: `docs/GLOSSARY.md`
- Tech-stack & architecture decisions: `docs/DECISIONS.md`
- UI/UX design: `docs/STYLE-GUIDE.md` + `docs/LAYOUT.md`
- SEO: `docs/SEO.md` — reference when designing any user-facing surface
- **Auth & RBAC patterns**: `docs/AUTH.md`
- **RLS policy patterns**: `docs/RLS.md`
- **Discord integration + moderation workflow**: `docs/DISCORD.md` — note the bot-token-only rule; we never use webhook URLs
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

**Use `./scripts/ci-wait.sh`.** It polls a single run id (or the latest run on the current branch if none given), prints the conclusion, dumps `gh run view --log-failed` on red, and exits 0 / 1 based on the authoritative conclusion. One stable command form means a single `Bash(./scripts/ci-wait.sh:*)` allowlist entry covers every invocation — Claude Code shouldn't have to ask permission per id.

```sh
./scripts/ci-wait.sh                     # latest run on the current branch
./scripts/ci-wait.sh 25072290590         # specific run id
./scripts/ci-wait.sh --branch main       # latest run on main
CI_WAIT_INTERVAL=15 ./scripts/ci-wait.sh # tighter poll for short jobs
```

Run with `run_in_background: true` — the harness fires one notification on completion, no need to sleep or poll from the conversation. Don't chain `sleep 270 && gh run view ...` from the conversation — the harness blocks long leading sleeps; the wrapper does the waiting inside its own process.

For `gh pr checks`, deploy status, or any other "one terminal event" wait, the same backgrounded-script-with-internal-loop shape applies. For multi-event streams (each step result as it lands) reach for the Monitor tool instead.

## `/ultrareview` — opt-in second opinion

For changes to `app/lib/submissions/**`, `app/lib/moderation.server.ts`, auth, or RLS migrations, ask me to run `/ultrareview` before pushing. Cheap second opinion on the risky paths.

## Commit message style

Prefix-colon pattern used throughout the history: `Fix:`, `Test:`, `Docs:`, `CI:`, `Build:`, `Lint:`. One-line title, short body explaining why. Ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
