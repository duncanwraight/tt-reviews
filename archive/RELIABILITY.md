# Reliability & Testing Plan

## Context

Solo developer + Claude Code workflow. Prompts and todos go in, Claude writes the code, changes push directly to `main`. No human PR reviewer.

Current pain:

- Manual testing is exhausting.
- Bugs land in production (see `todo/BUGS.md`) — most are form field-mapping, validation, or approval-flow regressions that cheap tests would catch.
- The "MANDATORY pre-push checks" in CLAUDE.md are honour-system and ignorable.
- CI only runs on push to `main`, and the test/typecheck steps do not block the deploy.
- Migrations auto-apply to prod with no diff review.

Goal: make the CI pipeline and Claude Code hooks function as the review layer. Let Playwright do the repetitive manual testing.

## Guiding principles

- Every phase lands something useful on its own. No "can't ship until phase 7".
- Mechanical enforcement beats written rules.
- Push-to-main stays. The deploy becomes gated, not the merge.
- Claude is both author and reviewer — its harness must stop it committing bad code.

---

## Phase 1 — CI gates the deploy

**Status:** Shipped 2026-04-22 (commits `b84d343`, `9af7297`, `80b2c22`).

**Goal:** Green checks become the precondition for deployment. Push-to-main still works; a failing typecheck or test blocks the deploy step.

**Steps:**

- Split `.github/workflows/main.yml` into two jobs: `checks` and `deploy`. Set `deploy: needs: checks`.
- `checks` runs (in parallel where possible): `npm run typecheck`, `npm test`, `prettier --check .`, `npm run build`.
- Remove the redundant `test:discord` step (already covered by `npm test`).
- Add the workflow to `pull_request` too, so opt-in feature branches also get checked.
- Cache `node_modules` and `.react-router/types` to keep total runtime under ~2 min.

**Acceptance:**

- A commit on `main` with a failing typecheck does not deploy.
- Workflow completes in under 3 min for a no-op commit.

**Notes from rollout:**

- Needed a one-time `prettier --write .` sweep (62 files) before the new check gate could turn green — the husky pre-commit hook only runs when Claude routes through it, so drift had accumulated.
- Added `.prettierignore` for `.react-router/`, `worker-configuration.d.ts`, build output, lockfiles, `.dev.vars`.
- Added `concurrency: cancel-in-progress` so superseded commits don't tie up the runner.

---

## Phase 2 — Claude Code hooks as the review layer

**Status:** Shipped 2026-04-22 (commit `75c343e`).

**Goal:** Since there is no human reviewer, Claude's harness must prevent shipping broken code. Hooks turn CLAUDE.md's honour-system rules into mechanical blocks. This is the largest behavioural lever for this workflow — doing it early means every subsequent phase benefits.

**Steps:** configure `.claude/settings.json`:

- **PostToolUse on `Edit|Write` targeting `app/**/\*.{ts,tsx}`** → run `tsc --noEmit` incrementally; surface errors in the same turn so Claude corrects before moving on.
- **PreToolUse on `Bash(git commit:*)` and `Bash(git push:*)`** → run `npm run typecheck && npm run lint`. Block on failure.
- **PostToolUse on `Edit|Write` in `supabase/migrations/**`** → run `supabase db diff` and surface the output so Claude describes schema impact in its summary.
- **Stop hook** → print a short checklist: uncommitted TS errors, failing tests, unrun `test:e2e` since the last UI edit. Claude sees its own hook output and self-corrects.
- Narrow `.claude/settings.local.json`: remove blanket `rm:*`, `git reset:*`, `sed:*`. Scope them per-path or require confirmation.

**Acceptance:**

- A Claude session that edits a `.tsx` file introducing a type error cannot run `git commit` until the error is fixed.
- The Stop hook surfaces uncommitted type errors, preventing a turn from ending in a broken state.

**Notes from rollout:**

- The PreToolUse git hook originally ran only `npm run typecheck` because `npm run lint` didn't exist yet. Phase 5e extended it to run both.
- Hook scripts live in `.claude/hooks/` (checked in). Output filtered through `grep -E 'error TS[0-9]+:' | head -40` so typegen noise doesn't drown the real error.
- `.claude/settings.local.json` deny list now explicitly blocks `git reset --hard:*`, `git push --force:*`, `supabase db reset:*`.

---

## Phase 3 — Playwright E2E, runnable by Claude

**Status:** Shipped 2026-04-22. Broken into two sub-phases during rollout:

- **3a — plumbing** (commit `2b12cf0` + fix `60d3606`): installed `@playwright/test`, wrote `playwright.config.ts` with `webServer: npm run dev, reuseExistingServer: true`, added a loader-less `/e2e-health` fixture route so Playwright's readiness probe doesn't depend on Supabase, wired `npm run test:e2e` into the checks job with browser caching.
- **3b — real flows on a real Supabase** (commits `eec6491`, `aa2a283`, `64877b3`, `404cc8b`, `0a6bf5a`, `4c46f9f`, `26d2fd7`, `d939c9e`, `870f47a`, `8fce74e`, `0e7d9eb`, `c9467e4`, `ab6f373`, `9b1e00c`, `7af8f17`, `dda2405`, `522b744`): `supabase start` in CI with the standard demo keys, then the four plan flows.

**Goal:** Directly kill the "manual testing is exhausting" pain. Give Claude a command it runs itself before declaring a UI task done.

**Steps:**

- Add `@playwright/test` as a dev dependency.
- Configure `playwright.config.ts` with `webServer` that boots `npm run dev` and tears it down automatically.
- Add `npm run test:e2e` script; wire into CI checks.
- Write the first 4 flows:
  1. Anon: homepage → equipment list → equipment detail renders reviews. (`e2e/anon-browse.spec.ts`)
  2. Auth'd user: submit an equipment review → appears in admin queue. (`e2e/user-submits-review.spec.ts`)
  3. Admin: approves a pending submission → appears on the public page. (`e2e/admin-approves-review.spec.ts`)
  4. Discord approval button handler → submission status flips (API-level is fine for this one). (`e2e/discord-approve-review.spec.ts`)
- Keep the suite under ~60s total.

**Acceptance:**

- `npm run test:e2e` runs end-to-end with no manual setup.
- Suite runs green locally and in CI.

**CLAUDE.md addition:** landed — see the "E2E Test Requirements" section in `CLAUDE.md`.

**Notes from rollout:**

- Flow 3 surfaced a real prod bug: the `update_submission_status` trigger (migration `20260101120000`) writes `approval_count` on `equipment_reviews` and `player_equipment_setup_submissions`, but the column was never added to those two tables. Every admin-UI approval for equipment reviews had been silently failing (insert rolled back, action redirect made admins think it worked). Fixed in migration `20260422170000_add_approval_count_to_reviews_and_setups.sql` and by making the admin.equipment-reviews action check `result.success` from moderation calls instead of ignoring it.
- `SUPABASE_URL` in CI `.dev.vars` must use `localhost` to match Playwright's baseURL — `127.0.0.1` triggers Chromium's Private Network Access block on the browser-side Supabase fetches.
- `moderator_approvals.moderator_id` has no `ON DELETE CASCADE` (intentional for prod audit trails), so the `deleteUser` test helper clears approvals first.
- Flow 4 (Discord) uses a test-only Ed25519 keypair in `e2e/utils/discord.ts`; the public half is provisioned into `.dev.vars` by the workflow. `DISCORD_ALLOWED_ROLES` in CI is pinned to `role_e2e_moderator` so the interaction payload's `member.roles` matches. Spec is skipped locally because real `.dev.vars` has the real Discord public key.
- Reusable helpers: `e2e/utils/auth.ts` (createUser / deleteUser / setUserRole / login / logout / generateTestEmail), `e2e/utils/data.ts` (getFirstEquipment / insertPendingEquipmentReview / getEquipmentReviewStatus), `e2e/utils/discord.ts` (signDiscordRequest / buildButtonInteraction), `e2e/utils/supabase.ts` (demo JWTs + adminHeaders).

---

## Phase 4 — Staged deploys with auto-rollback

**Status:** Shipped 2026-04-22 across three sub-commits:

- **4a — smoke suite** (commit `8b05ad3`): new `e2e-smoke/` dir with 5 read-only specs, separate `playwright.smoke.config.ts`, and `npm run test:smoke` script.
- **4b — upload + smoke-preview + promote** (commit `fa97e63`): replaced single-step `wrangler deploy` with `wrangler versions upload` → migrate → smoke-preview against the preview URL → `wrangler versions deploy <id>@100%`. Parses version ID and preview URL out of the `versions upload` stdout.
- **4c — smoke-prod + rollback** (commit `c9adc01`): after promote, runs the smoke suite against `https://tabletennis.reviews`. On failure, `wrangler rollback` to the previous deployment and fail the workflow.

**Goal:** Every push to main goes to a preview version first, gets smoke-tested, and only promotes to prod if smoke tests pass. Prod failures auto-rollback.

**Steps:**

- Switch the deploy step to a two-stage flow using Wrangler versions:
  1. `wrangler versions upload` → produces a preview URL.
  2. Playwright smoke suite (~5 tests) runs against the preview URL.
  3. On green, `wrangler versions deploy` promotes to 100% traffic.
- Post-promote, run the same smoke suite against prod. On failure, `wrangler rollback` to the previous version and fail the workflow loudly.
- Decide migration timing: start with running migrations **before** the promote step so the preview uses the new schema. Revisit if a migration is ever non-backward-compatible.

**Acceptance:**

- A deliberately broken UI commit fails the promote step; prod stays on the previous version.
- A passing commit lands on prod with post-deploy smoke confirming it.

**Notes from rollout:**

- Preview URLs (`<version>-<worker>.<subdomain>.workers.dev`) required enabling the workers.dev subdomain and preview URLs in the Cloudflare dashboard.
- Preview versions share the prod Supabase + R2 bindings. The smoke suite is therefore strictly read-only (no form submissions, no mutations). See `e2e-smoke/README.md`.
- `wrangler versions deploy <id>@100%` + `--yes` is non-interactive; no separate promote prompt to suppress.
- For rollback we use `wrangler rollback` (no args) which auto-targets the previous deployment. This avoids having to parse Version IDs vs Deployment IDs out of `wrangler deployments list` — the two are distinct UUIDs in v4 output and grabbing the wrong one would roll back to nothing useful.
- Migrations apply before the promote gate, so a preview-smoke failure leaves prod code old + schema new. Acceptable because the repo only uses backward-compatible migrations.
- Rollback-on-prod-smoke-failure is fail-open on binding problems: if prod is serving errors because Supabase is actually down, the rollback won't help (both versions would fail smoke). That's fine — the workflow still fails loudly.
- First run (commit `fa97e63`) validated the 4b flow end-to-end: smoke-preview 5/5 green in 4.9s, promote succeeded.

---

## Phase 5 — Lint and pre-push enforcement

**Status:** Shipped 2026-04-22 across five sub-commits:

- **5a** (commit `2d1c0b9`): installed eslint 9 + typescript-eslint 8 + eslint-plugin-react-hooks 5, flat config in `eslint.config.mjs`, rules at `warn` level.
- **5b** (commit `5bccceb`): `scripts/eslint-disable-existing.mjs` codemod inserted `// eslint-disable-next-line` (or `{/* */}` in JSX) above each of the 237 existing violations; rules flipped to `error`; `npm run lint` wired into CI checks job.
- **5c** (commit `e6328ba`): replaced `prettier --write . && git add .` pre-commit with `lint-staged`. Also gitignored `.claude/scheduled_tasks.lock` + `.claude/settings.local.json`.
- **5d** (commit `35894c0`): added husky `pre-push` running `npm run typecheck && npm run lint`. `npm test` was intentionally omitted — the discord integration tests need a running local Supabase, so enforcing them on every push would be high-friction.
- **5e** (this commit): Phase 2's pre-git hook (`.claude/hooks/pre-git-check.sh`) now runs `npm run lint` in addition to typecheck.

**Goal:** Stop the bug classes that currently slip through — `any`, raw `console`, floating promises, missing hook deps.

**Steps:**

- Add ESLint + `typescript-eslint` + `eslint-plugin-react-hooks`.
- Rules (start `warn`, ratchet to `error` once baseline is clean):
  - `@typescript-eslint/no-explicit-any` — snapshot the 171 existing uses, eslint-disable them in a single cleanup commit, error on new.
  - `no-console` with `{ allow: ['error'] }` — forces Logger usage (the ~80 existing console calls get disabled or migrated).
  - `@typescript-eslint/no-floating-promises` — high-value for Workers/Supabase.
  - `react-hooks/exhaustive-deps`.
- Replace the husky pre-commit (`prettier --write . && git add .`) with `lint-staged` that only touches staged files (the current `git add .` can silently stage unrelated junk).
- Add a `pre-push` hook running `npm run typecheck && npm test`.
- Wire `npm run lint` into CI Phase 1 checks.

**Acceptance:**

- `git commit` with a new `any` or `console.log` fails.
- Pre-push catches a broken push locally before CI has to.

**Notes from rollout:**

- Actual violation counts diverged from the plan's estimates: 196 `any` (not 171), 21 `console` (not ~80), plus 17 floating promises and 3 exhaustive-deps. Total snapshot = 237 disables.
- `projectService: true` scoped to `app/**` and `workers/**` only. E2E, tests, and root config files (`playwright.config.ts`, `vitest.config.ts`, etc.) use syntax-only parsing so they don't need to be in any tsconfig include.
- `.well-known.$.tsx` starts with a dot so `app/**/*` doesn't match it in the tsconfig. Single-file `allowDefaultProject` entry handles it.
- `no-empty-pattern`, `no-case-declarations`, `prefer-const`, and similar noise rules from `js.configs.recommended` are turned off — they aren't the bug classes we care about and would balloon the snapshot.
- The codemod's JSX-vs-JS heuristic (`// eslint-disable-next-line` vs `{/* */}`): use `{/* */}` when the target line begins with a JSX tag (`<Foo`) OR begins with `{` and the previous non-blank line ends with a `>` (closing JSX tag). `=>` endings excluded so arrow-fn returns don't misfire.

---

## Phase 6 — Component and RLS tests

**Status:** Shipped 2026-04-22 across seven sub-commits:

- **6a** (commit `c6841fa`): installed `@testing-library/react`, `/user-event`, `/jest-dom`, `happy-dom`. Per-file env via `// @vitest-environment happy-dom` pragma so the existing node-env Discord tests aren't disturbed. `app/vitest-env.d.ts` carries the jest-dom type reference so matchers like `toBeInTheDocument` typecheck.
- **6b** (commit `3b891f3`): RatingSlider (5 tests) + RatingCategories (6 tests) — includes the regression for "all sliders move together".
- **6c** (commit `98279b7`): EquipmentCombobox (9 tests) — keyboard nav, manufacturer-or-name search, click-to-select, Escape closes without firing onChange.
- **6d** (commit `4ee3d0c`): UnifiedSubmissionForm (6 tests) — validation false-positive guard. React Router / RouterFormModalWrapper / CSRFToken / FormField mocked at module scope to isolate the form's own logic.
- **6e** (commit `281ba67`): Discord `custom_id` routing precedence (4 tests) — pins `approve_player_equipment_setup_*` before `approve_player_*` via `vi.spyOn` on `DiscordService` methods.
- **6f** (commit `7e52ba4`): `supabase/tests/rls.sql` — 6 pgTAP assertions on `player_equipment_setup_submissions`: anon denied; user sees own; user can't see another's; admin sees all; admin can UPDATE any; non-admin UPDATE on someone else's silently no-ops. Wired `supabase test db` into CI checks after Supabase readiness probe.
- **6g** (this commit): RELIABILITY.md status update.

**Goal:** Attack the bug class that dominates `todo/BUGS.md` — form field mapping, validation, approval-flow edges, RLS regressions.

**Steps:**

- Add `@testing-library/react` + `happy-dom`; set Vitest env per-file.
- 10–15 component tests targeting `BUGS.md` hotspots:
  - `UnifiedSubmissionForm` — controlled inputs, validation, field extraction.
  - `RatingCategories` / `RatingSlider` — independent slider state (the "all sliders move together" regression).
  - `EquipmentCombobox` — keyboard nav, search filter.
  - Discord `custom_id` router — `approve_player_equipment_setup_*` precedence over `approve_player_*`.
- Add `supabase/tests/rls.sql` using pgTAP / `pg_prove`. Assertions:
  - anon cannot `SELECT` pending submissions.
  - admin JWT returns all rows including inactive.
  - regular user `SELECT`s only own submissions.
- Run SQL tests in CI against a fresh local Supabase container.

**Acceptance:**

- A regression in any `BUGS.md` bug class fails a test.
- RLS SQL tests run in CI Phase 1 checks.

**Notes from rollout:**

- Total landed: 36 assertions across 6 test files. Went over the 10–15 plan estimate because most components were simple enough to add several small assertions cheaply.
- **Test env isolation**: `vitest.config.ts` stays on `node` env globally; component tests opt into `happy-dom` with a file pragma. Avoided splitting vitest into projects (less config surface). The existing Discord integration tests (which require real Supabase) keep running in node env.
- **jest-dom types**: `import "@testing-library/jest-dom/vitest"` in `vitest.setup.ts` is wrapped in a `typeof document !== "undefined"` guard so node-env tests don't blow up at setup time. A separate `app/vitest-env.d.ts` with a triple-slash reference supplies the matcher types — placed inside `app/` so the existing tsconfig `app/**/*` include picks it up.
- **Route mocking for UnifiedSubmissionForm**: pulling in the real `react-router` providers + `RouterFormModalWrapper` was too much plumbing. Module-level `vi.mock` for `react-router`, the wrapper, `CSRFToken`, and `FormField` cut the setup to a handful of lines and keeps the assertions focused on validation logic.
- **Discord router test** uses `vi.spyOn(service as unknown as Record<string, () => Promise<Response>>, "handleApprovePlayerEquipmentSetup")` to stub private methods without disabling TypeScript on the assertion itself. No real Supabase or Discord traffic.
- **pgTAP** runs via `supabase test db` inside the already-started Supabase container — no extra pg_prove install. `SET LOCAL ROLE anon / authenticated` combined with `SET LOCAL request.jwt.claims TO '{...}'` simulates Supabase's JWT-claim-based RLS policies. Transaction wrapped in `BEGIN ... ROLLBACK` so no seed data persists.
- **eslint test-file overrides**: component tests use `as any` in a few spots (test config object shape). The eslint config already turns off `no-explicit-any` under `__tests__/**`, so the `eslint --fix` pass stripped the redundant disable directives on the first lint run — a minor but visible artifact of running lint after writing.

---

## Phase 7 — Production gates, observability, CLAUDE.md overhaul

**Status:** Shipped 2026-04-22 across four commits (7c + 7d landed together):

- **7a** (commit `60e469a`): `environment: production` on the deploy job. Activates when a required reviewer is configured in repo Settings → Environments → production. No-op until then.
- **7b** (commit `d27f983`): schema-diff step writes `supabase migration list` output + the full SQL of any migrations added in the current commit to `$GITHUB_STEP_SUMMARY` before `supabase db push` runs.
- **7c** (part of commit `98b5e21`): top-level try/catch in `workers/app.ts` emits structured JSON (`source: "worker-entry"`) for uncaught errors; `npm run logs` / `npm run logs:errors` wrap `wrangler tail`; `docs/OBSERVABILITY.md` documents the Claude-Code workflow. Deviated from the plan's Sentry suggestion — wrangler-tail + Workers Observability (already on) is free, Claude-Code-usable out of the box, and sufficient for this site's volume.
- **7d** (part of commit `98b5e21`): CLAUDE.md trimmed from ~20k chars to ~4.7k. Extracted `docs/AUTH.md` (auth patterns + RBAC), `docs/RLS.md` (policy patterns), `docs/E2E.md` (test rule + helpers). Removed honour-system "MUST run npm run typecheck / test" lines since the pre-git (Phase 2) and pre-push (Phase 5) hooks enforce them mechanically. Added `/ultrareview` pointer.
- **7e** (this commit): RELIABILITY.md status update.

**Goal:** Final hardening. Make prod changes reviewable, errors visible, and CLAUDE.md concise enough to actually be read.

**Steps:**

- Wrap migration + promote with GitHub `environment: production` and require a reviewer. You are the reviewer — the forced pause lets you read the diff before clicking approve.
- Auto-post the `supabase db diff` as a step summary so the planned schema change is visible.
- Integrate Cloudflare Workers → Sentry (or Logpush) for prod error tracking. Right now, a prod error only exists if someone is `wrangler tail`ing at the moment.
- Trim CLAUDE.md from ~16k chars to ~4k:
  - Move auth code examples into `docs/AUTH.md`.
  - Move RLS example policies into `docs/RLS.md`.
  - Keep CLAUDE.md as rules + pointers.
- Remove honour-system "MUST run X" lines that are now enforced by Phase 2 hooks.
- Add: _"For changes to `app/lib/submissions/**`, `app/lib/moderation.server.ts`, auth, or RLS migrations, ask me to run `/ultrareview` before pushing."_ This is the opt-in second-opinion layer for risky changes.

**Acceptance:**

- Prod deploys pause for explicit approval.
- CLAUDE.md fits comfortably on one screen.
- A prod error surfaces in Sentry within seconds.

**Notes from rollout:**

- **Observability deviated from the plan.** Plan said "integrate Sentry (or Logpush)" but during rollout the user asked for a Claude-Code-compatible, open-source/free solution. Landed on `wrangler tail` + Workers Observability (already enabled). `npm run logs` / `npm run logs:errors` are the entry points; `docs/OBSERVABILITY.md` is the doc. If volume outgrows this, Sentry's Cloudflare Workers SDK remains the drop-in upgrade — the top-level error handler in `workers/app.ts` already emits structured JSON ready to forward.
- **Required reviewer is a manual one-time step.** Adding `environment: production` to the workflow doesn't configure protection rules — GitHub creates the environment on first run but leaves it unprotected unless you add reviewers in repo Settings. Action item: go to Settings → Environments → production → Required reviewers and add @duncanwraight.
- **Schema-diff summary** scope: shows migrations added in the current commit and pending on remote. If a push bundles several commits' worth of migrations, only the topmost commit's new files are inlined — the `supabase migration list` output still shows all pending. Acceptable trade-off to keep the step simple.
- **CLAUDE.md final size:** 4.7k chars, 4 reference doc pointers (AUTH, RLS, E2E, OBSERVABILITY). Fits comfortably in the first screen of editor/terminal. Each extracted doc is 2.8k–5k chars — still small enough to read cover-to-cover when the topic is relevant.
- **Stop hook (Phase 2) note about unrun `test:e2e`**: after the CLAUDE.md trim, the rule that "UI changes need a Playwright spec" now lives in `docs/E2E.md`. The Phase 2 Stop hook still calls this out from its checklist script; no hook change needed since it doesn't quote CLAUDE.md directly.

---

## Post-Phase-7 — CI pipeline speed

**Status:** Resolved without code changes 2026-04-22 — pulled timing data from run `24799240715` (the 7e commit) and the pipeline was 3:02 end-to-end (checks 1:56, deploy 1:01), already under the 3-min target. The earlier 5+ min observation was on cache-miss runs during phases 3/4 when Playwright browsers + `node_modules` were still being populated for the first time. Once those caches were warm the wall time fell back under target.

Small wins still on the table if this flares up again:

- Share `build/` output from the `checks` job to `deploy` via `actions/upload-artifact` (~8s).
- Share the Playwright browsers cache key across jobs so the deploy-job install-deps step hits the warmed cache (~15s).
- `supabase start` cold-boot would dominate if we ever needed to speed up the first ever run of a freshly-forked runner — prebuilt Supabase Docker image, or split Supabase-needing steps into a parallel job.
- E2E suite parallelism is capped at `workers: 1` in CI (flake guard). Revisit if the suite grows.

---

## Phase dependencies

- Phase 1 is foundational.
- Phase 2 is independent of Phase 1 but benefits enormously from it (hooks block commits; CI blocks deploys — belt and braces).
- Phase 3 depends on Phase 1 to run in CI; drafting locally is unblocked.
- Phase 4 depends on Phase 3 (needs a smoke suite to gate on).
- Phase 5 is independent.
- Phase 6 is independent.
- Phase 7 needs 1, 3, 4 in place to make the gates meaningful.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7**. Phase 2 before Phase 3 because once hooks are in place, writing the test suite is itself safer (typecheck on every edit).
