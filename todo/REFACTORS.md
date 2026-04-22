# Opportunistic refactors

Code health work that isn't gated and isn't urgent. For most items here the rule is "only split the slice you're already editing" — proactive splits risk merge conflicts against in-flight work. The **Discord server split** below is the deliberate exception: planned proactively because the 2200-line file blocks narrow testing and is already the single largest maintainability cost in the codebase.

---

# Discord server split

`app/lib/discord.server.ts` is ~2237 lines. One `DiscordService` class mixes signature verification, slash/prefix/button dispatch, approve/reject handlers, and outbound notifications. At this size `grep` is the primary navigation tool, and tests have to construct the whole service even to assert on a 40-line dispatch block (see `app/lib/__tests__/discord-custom-id-routing.test.ts` for the workaround).

## Target shape

```
app/lib/discord/
  types.ts          — DiscordContext + shared types
  messages.ts       — signature verify, updateDiscordMessage, embed/button builders, status helpers
  notifications.ts  — notifyNew*, notifySubmission, notifyReviewApproved/Rejected
  search.ts         — equipment + player search (slash-command lookups)
  moderation.ts     — 7 approve/reject handler pairs + checkUserPermissions
  dispatch.ts       — handleSlashCommand, handlePrefixCommand, handleMessageComponent
  unified-notifier.server.ts  (already exists — not touched)

app/lib/discord.server.ts    — thin DiscordService facade (keeps public API)
```

Five submodules plus a slim facade. Moderation (~935 lines) gets its own file because it's the single biggest slice; dispatch is small and distinct; search is small but a clean standalone concern. A 3-way split bundling dispatch + search + moderation into one `commands.ts` would re-create the navigation problem we're solving.

## Functional style inside submodules, class only at the facade

Submodules export pure functions taking `ctx: DiscordContext` as the first arg. No classes in the submodules. Tests can build a minimal context (fake supabase, fake logger, mocked `fetch`) and call functions directly — that's the "directly testable without heavy mocking" payoff.

```ts
// app/lib/discord/types.ts
export interface DiscordContext {
  botToken: string; publicKey: string; webhookUrl: string;
  guildId: string; channelId: string; allowedRoles: string[];
  supabase: SupabaseClient; logger: typeof Logger;
}
```

`DiscordService` stays in `app/lib/discord.server.ts` but shrinks to ~100 lines: the constructor builds a `DiscordContext` from env, and every method is a one-line delegate (`notifyNewReview(r) { return notifications.notifyNewReview(this.ctx, r); }`). This preserves the public API so every caller (`api.discord.interactions.tsx`, `api.discord.notify.tsx`, `submissions.$type.submit.tsx`, etc.) keeps importing `DiscordService` unchanged, and the 700+ lines of existing unit tests in `discord.test.ts` keep passing without rewrites. The class can be deprecated in a later pass if desired.

## Dependency graph (no cycles)

```
types ← messages ← notifications ← moderation ← dispatch ← facade
                 ← search        ←              ← dispatch
```

Moderation imports notifications (approve → notify-approved). Dispatch imports moderation + search. Facade imports everything. Messages is the leaf. No module imports "up".

## Execution order — one commit per step, tests green before moving on

**Pre-flight:**

1. Full re-read of `discord.server.ts` to confirm the slice boundaries.
2. Read `app/lib/discord/unified-notifier.server.ts` to confirm no duplication with `notifications.ts`.
3. Baseline green: `npm run test && npm run test:e2e && npx tsc --noEmit && npm run lint`.

**Step 1 — `types.ts` + `messages.ts`.** Leaf modules. Establishes `DiscordContext` shape before any dependent code uses it. Smallest blast radius.

**Step 2 — `notifications.ts`.** High-value (submission form handler hits this path in production), but self-contained — only calls `messages.ts` helpers.

**Step 3 — `search.ts`.** Small, isolated, quick confidence-builder before the big one.

**Step 4 — `moderation.ts`.** The 935-line slice. Highest risk — land as its own commit, eyeball the diff carefully before push. `e2e/discord-approve-review.spec.ts` is the production-behaviour tripwire.

**Step 5 — `dispatch.ts`.** By this point these are thin routers. `discord-custom-id-routing.test.ts` is the regression net.

**Step 6 — facade audit.** Confirm `discord.server.ts` is now ~100 lines of one-line delegates with no stray logic.

**Step 7 — comprehensive test coverage.** The whole point of the refactor. One test file per extracted module under `app/lib/discord/__tests__/`:

- `messages.test.ts` — Ed25519 verify (valid/invalid/malformed sig), button builders (initial/progress/disabled), embed helpers (`getEmbedTitle`, `getStatusColor`, `getStatusText`, `createUpdatedEmbed`), `hexToUint8Array`.
- `dispatch.test.ts` — custom_id routing (all 9 prefixes + `player_equipment_setup`/`player_` collision), ping challenge (type 1 → type 1), unknown commands, missing-user guards, permission gate. Absorbs the existing `discord-custom-id-routing.test.ts`.
- `notifications.test.ts` — each `notifyNew*` delegates to `unifiedNotifier.notifySubmission` with the correct type.
- `search.test.ts` — empty/populated/truncated results, error paths, with mocked `DatabaseService`.
- `moderation.test.ts` — each approve/reject handler × (happy / first-approval / fully-approved / moderator-creation-fail / `recordApproval`-fail / `updateDiscordMessage`-fail).

All unit tests with mocked dependencies — no live Supabase required. Existing `discord.test.ts` (integration) stays, complements the new unit coverage with full-stack assertions when Supabase is up. Target: ~40–60 new test cases. Discord is vital to this app and hard to test manually, so the coverage bar is high.

## Risks & mitigations

- **`this` binding breaks when methods become functions** — typecheck catches most, e2e is the real net. Run `npm run test:e2e` after every step, not just at the end.
- **Circular imports** — graph above is acyclic by construction; TS will flag a regression.
- **`DiscordContext` shape drift** — single definition in `types.ts`; rename is one-file.
- **RLS/permissions regression** — `checkUserPermissions` is the teeth of moderation. Moves into `moderation.ts` intact; no logic changes in this refactor.

## Explicit non-goals

- No caller import changes (`~/lib/discord` import path unchanged).
- No test rewrites (existing 700+ lines keep passing through the facade).
- No touching `unified-notifier.server.ts`.
- No feature work, bug fixes, or "while I'm here" cleanups.
- No deletion of `DiscordService` — future work.

## Scope estimate

~7 commits, ~6–9 hours focused work. Step 4 (moderation) and Step 7 (comprehensive tests) are the two longest. Each step ends with `typecheck + unit + e2e` green before moving on.

---

# Database server split (pending detailed plan)

`app/lib/database.server.ts` (~1330 lines) mixes equipment, players, and reviews data access in a single module. Known split target:

- `app/lib/database/equipment.ts`
- `app/lib/database/players.ts`
- `app/lib/database/reviews.ts`

Still pending the same treatment as the Discord plan — for now, apply the "only split the slice you're already editing" rule (see below). Promote to a full plan when we tackle it properly.

---

# General guidance for the other splits

- **Only split the slice you're already editing.** A partial split is fine — the remaining surface can wait until its next touch.
- **Re-export from the original file** (`export * from "./discord/notifications"`) so callers don't all need updating in the same commit.
- **Land the split and the feature change in the same commit** unless the split alone is substantial.

## Why bother

- **Testing** — smaller modules are directly testable without heavy mocking. The Phase 6 custom_id routing test is a concrete example of the current pain.
- **Navigation** — 2k+ line files dwarf the editor.
- **Mock surface** — `vi.mock("~/lib/discord/notifications")` is far narrower than mocking the whole service.
