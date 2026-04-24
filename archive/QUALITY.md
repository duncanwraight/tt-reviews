# Code Quality & Reuse Plan

## Context

Follow-up to RELIABILITY.md. The reliability push hardened CI, hooks, and tests — now tackle the duplication, drift, and monster files that slow future work. Ground truth from a 2026-04-23 sweep:

- Admin queue routes (5 files, ~3.2 kLOC) repeat the same loader and action boilerplate.
- ~32 stray `console.*` calls predate the ESLint snapshot and weren't migrated to `Logger`.
- `docs/CODING-STANDARDS.md` is referenced by CLAUDE.md but doesn't exist.
- `SubmissionType` union in `app/lib/types.ts` disagrees with strings used in admin route queries.
- Two monster files (`app/lib/submissions/registry.ts` 791 LOC, `app/lib/discord/moderation.ts` 742 LOC) are refactor candidates — moderation.ts's own header comment acknowledges the duplication.
- `app/routes-disabled/` contains a dead file.

Goal: fewer lines, fewer places to keep in sync, enforced by CI so drift doesn't return.

## Guiding principles

- Mechanical enforcement over rules. If the only check is "remember to do X", it'll regress.
- Delete aggressively. Unused exports, dead files, and redundant comments are all tech debt.
- Every extraction needs a real second caller. Don't abstract ahead of demand.
- Keep phases small and independently shippable.

---

## Phase 1 — Create CODING-STANDARDS.md

**Status:** Completed. `docs/CODING-STANDARDS.md` exists and is referenced from `CLAUDE.md`.

**Goal:** CLAUDE.md points at a file that doesn't exist. Either create it or remove the reference. Creating it is the right call — it's the single doc that will shape every future code change.

**Steps:**

- Write `docs/CODING-STANDARDS.md` synthesising the patterns already enforced by:
  - `eslint.config.mjs` (no `any`, no `console`, `exhaustive-deps`, `no-floating-promises`)
  - `docs/DECISIONS.md` (tech stack choices + rationale)
  - CLAUDE.md's "TypeScript rules" and "Frontend components" sections
  - Actual codebase patterns: Logger usage, type-guards-not-optional-chaining, env casts, error-handling shape
- Keep under ~3k chars. Aim for rules + one-line examples, not essays.
- Cover: naming (files, exports, components), error handling (action response shape), types (union registration, prop interfaces), logging (`Logger.info(msg, { context })`), component structure (break large JSX), imports (`~/lib/...` aliases).
- Link it from `CLAUDE.md` (already referenced on line 8).

**Acceptance:**

- File exists at `docs/CODING-STANDARDS.md` with ~3k chars of concrete, example-driven rules.
- CLAUDE.md reference resolves.

---

## Phase 2 — Logger migration + ratchet ESLint `no-console`

**Status:** Completed (TT-8, 2026-04-24).

**Goal:** ~32 remaining `console.*` calls in `app/` that predate the ESLint snapshot. Migrate them, then ratchet the rule so this class can't regress.

**Steps:**

- Inventory: `rg '^\s*console\.(log|warn|error|info|debug)' app/ workers/`. Expect hits in:
  - `$.tsx:L20-27` (dual `console.warn` + `console.info` for one 404 — collapse to one `Logger.warn`)
  - `admin.player-submissions.tsx`, `admin.equipment-submissions.tsx`, `admin.video-submissions.tsx`, `admin.player-edits.tsx`, `admin.player-equipment-setups.tsx`, `admin.equipment-reviews.tsx`
  - `admin.categories.tsx`, `admin.content.tsx`, `admin.import.tsx`
  - `api.discord.notify.tsx:L28`
  - `submissions.$type.submit.tsx` (6+ instances)
  - `entry.server.tsx`
- Per file: replace `console.error(msg, err)` with `Logger.error(msg, { err, requestId })`. Use `createLogContext(request)` where available.
- After migration: remove the `no-console` ESLint disables for the migrated files; run the codemod that inserted the original snapshot disables to strip stale ones.
- Flip `no-console` from `{ allow: ['error'] }` to `error` for everything — `Logger.error` is the only allowed path.

**Acceptance:**

- `rg '^\s*console\.' app/ workers/` returns zero hits (outside of `__tests__/` where tests intentionally assert console output).
- ESLint blocks any new `console.*` call at commit time.
- Stop hook (`.claude/hooks/`) already runs lint; no hook change needed.

---

## Phase 3 — Admin route consolidation

**Status:** Completed (TT-9, 2026-04-24). CSRF rollout was already in place via TT-24 before this phase landed, so the helpers only consolidate the existing gates. Plan named a single `ensureAdminWithCSRF`; shipped as a pair — `ensureAdminLoader` (admin check + issue CSRF token) and `ensureAdminAction` (admin check + CSRF validation + rate limit) — so both the loader and action prologues shrink. Each of the five routes dropped ~30 LOC and every `Record<string, any[]>` cast in the queue prologue is gone. Helpers live at `app/lib/admin/{queue,middleware}.server.ts` with unit tests alongside.

**Goal:** Five admin queue routes (`admin.equipment-submissions.tsx`, `admin.player-submissions.tsx`, `admin.video-submissions.tsx`, `admin.player-edits.tsx`, `admin.equipment-reviews.tsx` — ~3.2 kLOC total) repeat the same loader and action shape. Extract helpers; this also becomes the vehicle for rolling `validateCSRF` onto the four admin routes that skip it today (tracked separately in SECURITY.md Phase 2).

**Steps:**

- **Loader helpers** in a new `app/lib/admin/queue.ts`:
  - `loadPendingQueue(supabase, tableName, { limit = 50 })` — fetch pending submissions by `created_at desc`.
  - `loadApprovalsForSubmissions(supabase, submissionType, submissionIds)` — fetch `moderator_approvals` and return a typed `Record<string, ModeratorApproval[]>`. Replaces the `{} as Record<string, any[]>` cast in all five loaders.
- **Action helper** in `app/lib/admin/middleware.ts`:
  - `ensureAdminWithCSRF(request, context)` returns `{ sbServerClient, user }` on success or a `Response` on failure (admin check, CSRF check, audit log).
- Convert the five admin routes to use the helpers. Expect to delete ~150 total LOC.
- Add a unit test per helper (vitest, node env — no happy-dom needed).
- While in each file: remove the per-file `console.error` calls in favour of `Logger.error` (overlaps with Phase 2 — do them together).
- Fix the `Record<string, any[]>` ESLint-disable in all five files in the same commit.

**Acceptance:**

- Admin loader files drop by ~30 LOC each.
- Adding a sixth admin queue requires only a new route file calling the two helpers — no copy-pasted loader boilerplate.
- Unit tests cover both helpers.

---

## Phase 4 — Type union audit

**Status:** Completed (TT-10 + TT-27, 2026-04-24). `SUBMISSION_TYPE_VALUES` in `app/lib/submissions/types.ts` is the single source of truth; the duplicate `SubmissionType` in `app/lib/database/submissions.ts` now derives from it via `Extract<...>` and is renamed `CoreSubmissionType` to avoid name collision. Phase 7's matching grep guard shipped alongside.

**Goal:** `SubmissionType` in `app/lib/types.ts:L22-28` disagrees with the string literals used in admin queries (`admin.equipment-reviews.tsx:L58` uses `"equipment_review"`, not in the union). CLAUDE.md already flags this class of drift as a common failure mode. Pin submission types in one constant, then grep-lock them.

**Steps:**

- Inventory the actual `submission_type` enum values stored in the database — read the Postgres enum or the distinct values currently in use.
- Define `SUBMISSION_TYPE_VALUES` as a `const` tuple in `app/lib/submissions/registry.ts` (it already owns the field registry). Derive `SubmissionType` as `(typeof SUBMISSION_TYPE_VALUES)[number]`.
- Update `app/lib/types.ts` to re-export from registry (or delete the duplicate definition there).
- Replace every hard-coded `"equipment_review"` / `"player_edit"` / etc. across `admin.*.tsx` and `app/lib/discord/moderation.ts` with the constant.
- Add a CI grep check: any new string matching the submission-type shape outside the constant fails the build.
- Add a test asserting that every DB enum value has a registry entry (protects against schema-side additions).

**Acceptance:**

- Single source of truth for submission type values.
- Admin equipment-reviews queue correctly loads approvals (today silent empty).
- CI fails on a new hard-coded submission-type string.

---

## Phase 5 — Dead code cleanup

**Status:** Not Started.

**Goal:** Small pile of obvious cruft — delete it.

**Steps:**

- Delete `app/routes-disabled/equipment.compare.$slugs.tsx.disabled` and the `routes-disabled/` directory. If the code is genuinely valuable, move it to `docs/archive/` as a reference; otherwise let git history keep it.
- Audit unused exports in `app/lib/database/` (recently split into 9 submodules; expect some dead exports). Tools: `ts-prune` or `knip` — run once, delete the obvious misses, commit the tool config if it stays useful.
- Delete commented-out blocks and `// TODO: remove` markers where the referenced work has happened.
- Audit `.react-router/types/app/routes/+types/` for stale generated types pointing at renamed or deleted routes (CLAUDE.md calls this out explicitly).
- Remove redundant imports from files migrated in Phase 2 (e.g. files that imported `Logger` but still had `console.*`).

**Acceptance:**

- `routes-disabled/` is gone.
- `ts-prune` / `knip` reports zero unused exports in `app/lib/`.
- No dangling `// TODO` markers reference already-done work.

---

## Phase 6 — Monster file splits

**Status:** Not Started. Deferred until Phases 1-5 land.

**Goal:** Two files are big enough to slow editing and review. Split them only when the extractions have real seams, not to chase a LOC target.

**Steps:**

- `app/lib/submissions/registry.ts` (791 LOC) — split by concern:
  - Field types / registry definitions (what fields each submission type has) → `registry.types.ts`.
  - Field validators → `registry.validate.ts` (will be the home for SECURITY.md Phase 7's per-field validator).
  - Moderation/notification side effects → already in `app/lib/discord/` — verify the boundary and move any leakage.
- `app/lib/discord/moderation.ts` (742 LOC) — its own header comment acknowledges ~10 near-identical `approve*`/`reject*` pairs. Extract a data-driven dispatch:
  - Define a `SubmissionHandler` record keyed by submission type with `{ tableName, approveSql, rejectSql, notifyChannel, buildEmbed }`.
  - Single `applyModeration(action, submissionType, submissionId)` replaces the 10 pairs.
  - Keep the existing tests in `__tests__/dispatch.test.ts` as the safety net — do not merge if they regress.
- Don't start this phase without checklist: (a) Phase 4's type constant lands, so handler keys are locked; (b) test coverage for each current approve/reject path exists; (c) a single PR, not interleaved with feature work.

**Acceptance:**

- `registry.ts` under ~300 LOC; concerns separated.
- `moderation.ts` under ~300 LOC; the dispatch table replaces the paired functions.
- Existing tests pass unchanged.

---

## Phase 7 — Mechanical enforcement

**Status:** Mostly completed across TT-8, TT-9, TT-13, TT-27. Console check and Record<string, any[]> check live in `scripts/quality-sweep.sh`; file-length warning runs as non-fatal report; submission-type literal guard added in TT-27 using an allow-list of files where the literals are legitimate. `npm run deadcode` (knip) runs non-blocking in CI. Not yet landed: a `docs/CODING-STANDARDS.md` back-pointer to each check — superseded by the table at the top of that doc, which already catalogues them.

**Goal:** Turn the drift patterns from Phases 1-6 into CI checks, so quality doesn't rely on anyone remembering.

**Steps:**

- CI grep: fail on `console.` in `app/` or `workers/` outside `__tests__/` (Phase 2).
- CI grep: fail on any hard-coded submission-type string outside the constant (Phase 4).
- CI grep: fail on `Record<string, any[]>` or similar generic-any casts in new code (scoped to post-snapshot files).
- `ts-prune` or `knip` run in CI as a warning (not blocking) to surface new dead code (Phase 5).
- Line-length / file-length warning in ESLint for any `.ts` / `.tsx` over 400 LOC under `app/lib/` or `app/routes/` — a prompt to split before a file becomes the next monster (Phase 6).
- Update `docs/CODING-STANDARDS.md` (Phase 1) with a pointer to these checks so the rules and their enforcers live together.

**Acceptance:**

- Each check catches a planted regression in a test PR.
- No phase from 1-6 has to be re-done because of drift.

---

## Phase dependencies

- Phase 1 (standards doc) is a prerequisite for Phase 7's pointer, but independent otherwise.
- Phase 2 (logger) is independent; do early.
- Phase 3 (admin routes) overlaps Phase 2 — migrate console calls in the same files in one pass.
- Phase 3 is a soft prerequisite for SECURITY.md Phase 2 (admin CSRF rollout) — the `ensureAdminWithCSRF` helper is the vehicle for the rollout.
- Phase 4 (type unions) is independent; do before Phase 6.
- Phase 5 (dead code) is independent; cheap wins.
- Phase 6 (monster splits) depends on Phase 4's type constants existing.
- Phase 7 (enforcement) lands checks incrementally as each earlier phase closes.

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 7**, with Phase 7 checks landing alongside the phase they enforce.
