# Database server split — plan

Promoted from `todo/REFACTORS.md`. Same shape as the shipped Discord split at `docs/archive/REFACTOR-DISCORD.md`.

`app/lib/database.server.ts` is ~1360 lines. One `DatabaseService` class mixes equipment, players, reviews, submissions, Discord-message tracking, search, and admin-dashboard aggregation. At this size `grep` is the primary navigation tool, and every test has to construct the whole service even to assert on a single query.

Unlike the Discord file going in, this one has **near-zero unit-test coverage** today — only two integration tests (`app/lib/__tests__/discord.test.ts`, `archived-tests/discord.test.ts`) touch `DatabaseService` at all, and both are gated by `hasSupabaseEnv()`. Step 7 is therefore net-new writing rather than re-anchoring existing tests.

## Target shape

```
app/lib/database/
  types.ts          — DatabaseContext + shared entity/submission interfaces (moved from database.server.ts)
  client.ts         — createSupabaseClient, createSupabaseAdminClient
  logging.ts        — withLogging helper (shared by every data-access slice)
  equipment.ts      — 13 equipment methods (incl. *WithStats, getSimilarEquipment, getPlayersUsingEquipment)
  players.ts        — 8 player methods
  reviews.ts        — 4 review methods
  submissions.ts    — 4 live submission methods + 5 Discord-message-ID methods + getSubmissionTableName helper
  search.ts         — cross-cutting `search(query)` (equipment + players)
  admin.ts          — cross-cutting `getAdminDashboardCounts()`

app/lib/database.server.ts  — thin DatabaseService facade (keeps public API + constructor polymorphism + .content)
```

Nine submodules plus a slim facade. Equipment is the biggest slice (~530 lines including the three `*WithStats` methods); submissions absorbs the Discord-message tracking because it reads/writes submission tables; search and admin get their own files because they span slices and have well-defined single callers.

## Functional style inside submodules, class only at the facade

Submodules export pure functions taking `ctx: DatabaseContext` (`{ supabase: SupabaseClient; context?: LogContext }`) as the first arg. No classes in the submodules. Tests build a minimal context (fake supabase, fake logger) and call functions directly.

`DatabaseService` stays in `app/lib/database.server.ts` but shrinks to a ~150-line facade. The three-way constructor (`(context)` / `(context, logContext)` / `(context, supabaseClient, logContext?)`) is preserved unchanged — `discord.server.ts` is the only caller using the three-arg form and must keep working. The `content: ContentService` property stays on the facade (5 callers: `root.tsx`, `admin.content.tsx`, `_index.tsx`, etc.). Every method becomes a one-line delegate.

**Public API preserved end-to-end:** 32 caller files across routes, lib, components, and tests keep importing `DatabaseService`, `createSupabaseClient`, `createSupabaseAdminClient`, and the re-exported types (`Player`, `Equipment`, `PlayerEquipmentSetup`, `EquipmentReview`, `ReviewerContext`, `PlayerEdit`, `EquipmentSubmission`, `PlayerSubmission`) from `~/lib/database.server` unchanged.

## Dependency graph (no cycles)

```
types ← client
types ← logging ← equipment ← search ← facade
                ← players   ←        ← facade
                ← reviews              ← facade
                ← submissions          ← facade
                ← admin                ← facade
```

`search` imports `searchEquipment` from equipment and `searchPlayers` from players — the only cross-slice import. Equipment, players, reviews, submissions, and admin are siblings that share only types + logging. Logging is a leaf below all data slices. Facade imports everything. No module imports "up."

## Execution order — one commit per step, tests green before moving on

**Pre-flight:**

1. Full re-read of `database.server.ts` to confirm slice boundaries.
2. Confirm `ContentService` construction is truly owned by the facade (no submodule needs it).
3. Baseline green: `npm run test && npm run test:e2e && npx tsc --noEmit && npm run lint`.

**Step 1 — `types.ts` + `client.ts` + `logging.ts`.** Leaf modules. Establishes `DatabaseContext` shape, relocates the factory functions and the `withLogging` helper. `executeQuery` (defined but never called) is deleted here. Smallest blast radius; facade re-exports `createSupabaseClient`/`createSupabaseAdminClient` and the types so callers see no change.

**Step 2 — `equipment.ts`.** Biggest slice (~530 lines, 13 methods). Covers the three `*WithStats` methods too — they join `equipment_reviews` but are equipment-centric from the caller's perspective, and internally call `getAllEquipment` / `getRecentEquipment`. Keep them here to preserve locality. Intra-slice calls (`getSimilarEquipment` → `getEquipmentById`, `getAllEquipmentWithStats` → `getAllEquipment`, stats fallbacks → `getRecentEquipment`) become ordinary function calls within the module.

**Step 3 — `players.ts`.** 8 methods, self-contained. No cross-slice calls.

**Step 4 — `reviews.ts`.** 4 methods, smallest data slice.

**Step 5 — `submissions.ts`.** 4 live methods (`submitEquipment`, `submitPlayer`, `getUserEquipmentSubmissions`, `getUserPlayerSubmissions`) + 5 Discord-message-ID methods + `getSubmissionTableName` helper. `getDiscordMessageId` is live (called from `app/lib/discord/messages.ts:233`, mocked in `app/lib/discord/__tests__/messages.test.ts`). The four `update*DiscordMessageId` methods appear to be dead code — extract as-is and flag in the commit message for a follow-up audit; **do not delete in this refactor** (hold the no-while-I'm-here rule).

**Step 6 — `search.ts` + `admin.ts`.** Two small cross-cutting modules. `search` imports from equipment + players; `admin` queries 6 tables directly (no internal delegation). Can land as one commit or two — judgment call based on size at extract time.

**Step 7 — facade audit.** `database.server.ts` trimmed to ~150 lines: constructor + `.content` property + one-line delegates for every public method. Dead helpers removed. Type re-exports kept.

**Step 8 — comprehensive test coverage.** One test file per extracted module under `app/lib/database/__tests__/`:

- `equipment.test.ts` — happy-path + error-path for each equipment method; RPC-fallback paths for `getEquipmentCategories` / `getEquipmentSubcategories` / `getEquipmentWithStats` / `getPopularEquipment`; stats-computation branches in `getAllEquipmentWithStats`.
- `players.test.ts` — filter combinations, country deduplication, setup/footage queries.
- `reviews.test.ts` — status filters, user-scoped queries.
- `submissions.test.ts` — insert + list paths, `getDiscordMessageId` dispatch across the four table types, `updatePlayerEditDiscordMessageId`'s `withDatabaseCorrelation` wrapping.
- `search.test.ts` — parallelism of equipment+player search, empty-result handling.
- `admin.test.ts` — `Promise.all` aggregation, status-count bucketing, fallback on partial failure.
- `logging.test.ts` — `withLogging` success/failure/debug paths.

All unit tests with a mock Supabase client (builder-chain stub); no live Supabase. The existing Discord integration tests stay as-is and continue to cover the end-to-end DB path when Supabase env is present.

## Risks & mitigations

- **`this` binding breaks when methods become functions** — caught by typecheck during each extraction step (same as Discord refactor).
- **Circular imports** — graph above is acyclic by construction; `search` is the only cross-slice importer.
- **`DatabaseContext` shape drift** — single definition in `types.ts`; every submodule imports from there.
- **Constructor polymorphism regression** — the 3-way branching in the facade is preserved verbatim. `discord.server.ts` (the only three-arg caller) gets a dedicated assertion in the facade test.
- **`ContentService` nesting** — stays on the facade as `.content`; submodules never see it. Construction happens exactly once per `DatabaseService` instance, as today.
- **RLS/permissions regression** — methods are moved, not rewritten. Queries byte-identical across the move. No auth/RLS surface change.
- **Dead Discord-tracking methods** — extracted as-is to keep the refactor mechanical. Separate follow-up decides delete vs. wire-up. (Migration `20250618141000_add_discord_message_tracking.sql` + the fact that `getDiscordMessageId` is live suggests writes happen through some path we haven't identified yet — investigate before deleting.)
- **Inconsistent error handling (Logger vs console.error vs raw throw)** — preserved as-is during the refactor. Standardization is a separate future pass.
- **Prettier vs eslint --fix** — same trap as Discord refactor; final `prettier --write` pass before push.

## Non-goals (hold the line)

- No caller import changes — `~/lib/database.server` path unchanged for all 32 callers.
- No constructor signature changes — 3-way polymorphism preserved.
- No rename of public methods.
- No standardization of error handling (Logger vs `console.error`) during this refactor.
- No deletion of the apparently-dead `update*DiscordMessageId` methods — flag only.
- No touching `ContentService`, `moderation.server.ts`, or `auth.server.ts`.
- `DatabaseService` not deleted — future work if ever.
