# Discord server split — shipped 2026-04-22

Archived from `todo/REFACTORS.md`. The plan below was executed across 10 commits (`036cb96`..`3134827`) and shipped to `main`. Outcome:

- `app/lib/discord.server.ts`: 2237 → 160 lines (-93%), now a thin facade over the submodules listed below.
- Public API preserved — no caller changes across `api.discord.interactions`, `api.discord.messages`, `api.discord.notify`, `submissions.$type.submit`.
- Unit tests: 55 → 179 (+124 Discord-focused tests under `app/lib/discord/__tests__/`).
- E2e + typecheck + lint + prettier all green on the final commit.

Keeping the full plan here so future refactors of similar shape (e.g. `database.server.ts`) have a concrete reference.

---

`app/lib/discord.server.ts` was ~2237 lines. One `DiscordService` class mixed signature verification, slash/prefix/button dispatch, approve/reject handlers, and outbound notifications. At that size `grep` was the primary navigation tool, and tests had to construct the whole service even to assert on a 40-line dispatch block.

## Target shape (shipped)

```
app/lib/discord/
  types.ts          — DiscordContext + shared types
  messages.ts       — signature verify, updateDiscordMessage, embed/button builders, status helpers
  notifications.ts  — notifyNew*, notifySubmission, notifyReviewApproved/Rejected
  search.ts         — equipment + player search (slash-command lookups)
  moderation.ts     — 12 approve/reject handlers + checkUserPermissions
  dispatch.ts       — handleSlashCommand, handlePrefixCommand, handleMessageComponent
  unified-notifier.server.ts  (already existed — not touched)

app/lib/discord.server.ts    — thin DiscordService facade (keeps public API)
```

Five submodules plus a slim facade. Moderation (~935 lines at the time) gets its own file because it's the single biggest slice; dispatch is small and distinct; search is small but a clean standalone concern.

## Functional style inside submodules, class only at the facade

Submodules export pure functions taking `ctx: DiscordContext` as the first arg. No classes in the submodules. Tests can build a minimal context (fake supabase, fake logger, mocked `fetch`) and call functions directly.

`DiscordService` stayed in `app/lib/discord.server.ts` but shrank to ~160 lines: the constructor builds a `DiscordContext`, and every method is a one-line delegate. This preserved the public API so every caller kept importing `DiscordService` unchanged.

## Dependency graph (no cycles)

```
types ← messages ← notifications ← moderation ← dispatch ← facade
                 ← search        ←              ← dispatch
```

Dispatch imports moderation + search. Facade imports everything. Messages is the leaf. No module imports "up".

## Execution order — one commit per step, tests green before moving on

**Pre-flight:**

1. Full re-read of `discord.server.ts` to confirm slice boundaries.
2. Read `app/lib/discord/unified-notifier.server.ts` to confirm no duplication with `notifications.ts`.
3. Baseline green: `npm run test && npm run test:e2e && npx tsc --noEmit && npm run lint`.

**Step 1 — `types.ts` + `messages.ts`.** Leaf modules. Establishes `DiscordContext` shape before any dependent code uses it. Smallest blast radius.

**Step 2 — `notifications.ts`.** High-value (submission form handler hits this path in production), but self-contained.

**Step 3 — `search.ts`.** Small, isolated, quick confidence-builder before the big one.

**Step 4 — `moderation.ts`.** The 935-line slice. Highest risk — land as its own commit, eyeball the diff carefully before push. `e2e/discord-approve-review.spec.ts` is the production-behaviour tripwire (CI-only).

**Step 5 — `dispatch.ts`.** By this point these are thin routers. The old `discord-custom-id-routing.test.ts` was the regression net.

**Step 6 — facade audit.** `discord.server.ts` trimmed to ~160 lines; dead private delegates + dead helpers removed.

**Step 7 — comprehensive test coverage.** One test file per extracted module under `app/lib/discord/__tests__/`:

- `messages.test.ts` (41) — Ed25519 verify guards, button builders, embed helpers, updateDiscordMessage, updateDiscordMessageAfterModeration.
- `dispatch.test.ts` (25) — custom_id routing + slash/prefix commands. Absorbed the old `discord-custom-id-routing.test.ts`.
- `notifications.test.ts` (10) — each `notifyNew*` delegates to `unifiedNotifier.notifySubmission` with the correct type.
- `search.test.ts` (12) — empty/populated/truncated results, error paths.
- `moderation.test.ts` (36) — full error-path matrix for approveReview/rejectReview, plus smoke tests for every other approve/reject handler.

All unit tests with mocked dependencies — no live Supabase required. Existing `discord.test.ts` (integration, gated by `hasSupabaseEnv()`) kept as-is to complement the new unit coverage.

## Risks & mitigations (retrospective — all caught)

- **`this` binding breaks when methods become functions** — caught by typecheck during each extraction step.
- **Circular imports** — graph above is acyclic by construction; no issues.
- **`DiscordContext` shape drift** — single definition in `types.ts`; never drifted.
- **RLS/permissions regression** — `checkUserPermissions` moved into `moderation.ts` intact; no logic changes.
- **Dispatch test coupling to class internals** — the old `discord-custom-id-routing.test.ts` spied on `service.handleApproveXxx` class methods, which broke once `dispatch.ts` started calling the moderation module directly. Caught at Step 5 and the test was updated to spy on the moderation module.
- **Prettier vs eslint --fix** — `eslint --fix` removed unused `eslint-disable-next-line` comments, leaving stray blank comment lines that Prettier flagged. Caught in CI on the initial push; fixed with one `prettier --write` pass.

## Non-goals (held)

- No caller import changes (`~/lib/discord` path unchanged).
- No `discord.test.ts` integration-test rewrites.
- No touching `unified-notifier.server.ts`.
- No feature work or "while I'm here" cleanups.
- `DiscordService` not deleted — future work if ever.
