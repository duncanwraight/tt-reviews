# Opportunistic refactors

Code health work that isn't gated and isn't urgent. Pick one up when a task already has you in the file — doing them proactively risks merge conflicts against in-flight work and delivers most of its value only when the smaller surface is actually needed.

## Split `app/lib/discord.server.ts` (2135 lines)

One `DiscordService` class mixing outbound notifications, slash/prefix command handlers, and button/moderation dispatch. At this size, `grep` becomes the primary navigation tool and tests have to construct the whole service even to assert on a 40-line dispatch block (see `app/lib/__tests__/discord-custom-id-routing.test.ts` for the workaround).

Target shape:

- `app/lib/discord/notifications.ts` — outbound messages (review submitted, setup awaiting approval, etc.)
- `app/lib/discord/commands.ts` — `!equipment` / `!player` slash and prefix handlers
- `app/lib/discord/moderation.ts` — approve/reject button dispatch + permission checks

## Split `app/lib/database.server.ts` (1330 lines)

Mixes equipment, players, and reviews data access in a single module.

Target shape:

- `app/lib/database/equipment.ts`
- `app/lib/database/players.ts`
- `app/lib/database/reviews.ts`

## Why bother

- **Testing** — smaller modules are directly testable without heavy mocking. The Phase 6 custom_id routing test is a concrete example of the current pain.
- **Navigation** — 2k+ line files dwarf the editor.
- **Mock surface** — `vi.mock("~/lib/discord/notifications")` is far narrower than mocking the whole service.

## How to approach

- Only split the slice you're already editing. A partial split is fine — the remaining surface can wait until its next touch.
- Re-export from the original file (`export * from "./discord/notifications"`) so callers don't all need updating in the same commit.
- Land the split and the feature change in the same commit unless the split alone is substantial.
