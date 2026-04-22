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

- `npm run lint` doesn't exist yet (Phase 5) — the PreToolUse git hook currently runs `npm run typecheck` only. Add `&& npm run lint` once Phase 5 lands.
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

**Risks:**

- Wrangler versions behaviour with bound R2/Supabase needs verification — preview may share bindings with prod.
- Smoke tests hitting shared Supabase from the preview stage could mutate prod data. Use read-only paths and seeded fixtures.

---

## Phase 5 — Lint and pre-push enforcement

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

---

## Phase 6 — Component and RLS tests

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

---

## Phase 7 — Production gates, observability, CLAUDE.md overhaul

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

---

## Ongoing (not a phase)

Split `app/lib/discord.server.ts` (2135 lines) and `app/lib/database.server.ts` (1330 lines) by feature as they're touched:

- `discord/notifications.ts`, `discord/commands.ts`, `discord/moderation.ts`
- `database/equipment.ts`, `database/players.ts`, `database/reviews.ts`

Smaller modules are easier to test in isolation. Opportunistic, not gated.

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
