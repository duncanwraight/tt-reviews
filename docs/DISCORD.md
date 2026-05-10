# Discord Integration

## Integration approach — bot token + channel ID, never webhook URLs

All Discord output from this app goes through bot-token REST calls — `POST https://discord.com/api/v10/channels/{channelId}/messages` with `Authorization: Bot ${DISCORD_BOT_TOKEN}`. Discord webhook URLs (`https://discord.com/api/webhooks/{id}/{token}`) are **not** used and must not be introduced.

Why: one bot identity keeps the author/avatar consistent, lets us post message components (the moderation buttons depend on this — webhooks can't deliver interaction-routed components for an app the way a bot can), and we already manage `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` as required env vars. Adding webhook URLs would mean a second credential type with its own rotation/revocation story.

When adding a new Discord notification surface (alerts, moderation messages, anything else), reuse `app/lib/discord/unified-notifier.server.ts` or `app/lib/alerts/discord-alerter.server.ts`, or follow the same bot+channel-ID pattern. Do not propose `*_WEBHOOK_URL` env vars or `discord.com/api/webhooks/...` POST paths.

**One exception, narrowly scoped:** the slash-command followup PATCH at `https://discord.com/api/v10/webhooks/{appId}/{interactionToken}/messages/@original` uses the same `/webhooks/...` URL family but is **authenticated by the interaction token in the URL, not by a Bot header** (sending one causes Discord to silently 401). See "Slash commands → Deferred ack" below for the full story. This is interaction infrastructure, distinct from the channel-message webhook surface the rule above is about.

## Two interaction surfaces

The bot listens at `app/routes/api.discord.interactions.tsx` (POST `/api/discord/interactions`) and routes by interaction type:

- **Type 2 — slash commands** (`/equipment`, `/player`): search-and-render. See "Slash commands" below.
- **Type 3 — message components** (Approve / Reject buttons attached to submission embeds): the moderator surface. See "Moderation buttons" below.

Both surfaces are signed by Discord with Ed25519 and verified before any work runs (`messages.verifySignature` against `DISCORD_PUBLIC_KEY`).

## Slash commands

The slash-command list is intentionally narrow — two commands, both read-only search, no moderation:

- `/equipment <query>` — search the equipment catalogue, returns one strong match as a rich embed (or an ambiguity hint / fallback link).
- `/player <query>` — same shape for player profiles.

Pre-TT-159 there were also `/approve <id>`, `/reject <id>`, and prefix-message commands `!equipment` / `!player`. All four are gone. Moderation is **button-only** — the buttons attached to each moderation embed are the real moderator surface.

### Where the code lives

| Concern                                               | File                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Source of truth for which commands exist              | `app/lib/discord/slash-commands.ts` (`SLASH_COMMANDS` array)               |
| Registration script (one-shot, run from your machine) | `scripts/register-discord-commands.ts`                                     |
| Type-2 entry point                                    | `app/lib/discord/dispatch.ts:handleSlashCommand`                           |
| Search + ambiguity + outcome tagging                  | `app/lib/discord/search.ts`                                                |
| Pure embed renderers                                  | `app/lib/discord/embeds/{equipment,player}.ts` + `embeds/rating-stars.ts`  |
| Search RPCs                                           | `supabase/migrations/20260510091448_add_discord_search_rpcs.sql` (TT-157)  |
| pgTAP coverage of the RPCs                            | `supabase/tests/discord_search_rpcs.sql`                                   |
| TS integration coverage of the RPCs                   | `app/lib/database/__tests__/search.integration.test.ts`                    |
| Renderer unit tests                                   | `app/lib/discord/embeds/__tests__/{equipment,player,rating-stars}.test.ts` |
| End-to-end interaction coverage                       | `e2e/discord-search.spec.ts`                                               |

### Search behaviour

`/equipment` and `/player` call Postgres RPCs `search_equipment` / `search_players` (TT-157). The RPCs run `to_tsvector('simple', public.f_unaccent(...))` against GIN indexes on the same expression — `simple` (no stemming) so proper nouns are matched as written, `f_unaccent` so "Sámsonov" matches "samsonov". Each RPC returns up to 10 ranked candidates; the dispatch decides outcome from the rank distribution.

**Three response paths:**

1. **Single match** (or dominant winner with `top.rank ≥ 1.5 × runnerUp.rank`) → rich Discord embed.
2. **Ambiguity** (multiple equally-ranked rows) → ephemeral-style hint with a concrete example: _"Multiple equipment match 'butterfly' (10+ results). Try including a model name, e.g. `butterfly viscaria`."_
3. **No match** → ephemeral-style content with a fallback link to `/search?q=...` (the only site route that takes free-text). The link is wrapped in `<...>` to suppress Discord's auto-unfurl, which would otherwise overlay a generic OG card.

The 1.5× threshold is locked for v1 (parent TT-156 § Q5, data captured by the TT-157 integration test). Tunable post-launch from the structured log; see "Observability" below.

**Partial-token search is out of scope.** `/player ma lo` won't match "Ma Long" — `lo` isn't a prefix of `long` for FTS. Fuzzy matching (`pg_trgm`) is deferred indefinitely; users type full names.

### Embed contents

**Equipment embed:**

- Title (linked to `/equipment/<slug>`)
- Author line: manufacturer
- Thumbnail (omitted when `image_key` is null)
- Description: equipment description, truncated to ~200 chars
- Field "Manufacturer specs": all 12 typed fields per `archive/EQUIPMENT-SPECS.md` rendered with units (g, mm) and hardness ranges (`42–47`)
- Field "Reviews": `★★★★☆ 4.2 (37 reviews)` — `/10` DB scale converted to `/5` for site consistency. Field omitted when count is 0.
- Footer: domain-only (`tabletennis.reviews/equipment/<slug>`)

**Player embed:**

- Title (linked to `/players/<slug>`)
- Author line: flag emoji + alpha-3 country code (e.g. `🇨🇳 CHN`); falls back to country code only when no flag emoji is mapped, omitted when no `represents` set
- Thumbnail (omitted when `image_key` is null)
- Description: `**Style:** … **Active:** … **Highest rating:** …` (no field heading — sits directly under the title)
- Field "Current setup": four lines, blade + FH + BH + italic _Since YYYY_, each piece prefixed with an emoji that conveys role/colour:
  - `🏓 (blade) Butterfly Viscaria`
  - `⚫ (FH) DHS Hurricane 3 NEO` (or `🔴` for red rubber)
  - `🔴 (BH) Butterfly Tenergy 05`
  - `*Since 2024*`
    Field omitted entirely when blade + both rubbers are absent.
- Field "Videos": single video as bare link, multiple videos as bullet-prefixed list, capped at 3, titles truncated to ~80 chars

Both embeds skip Discord's coloured `color` strip in v1 (no per-category palette decided).

### Deferred ack — why we always defer, and the followup-auth gotcha

Discord enforces a **3-second deadline** for the initial ack. Miss it and the user sees a permanent _"the application did not respond"_. Cold isolate + cold Supabase pool + first image-CDN warm-up routinely lands close to the deadline, and the cost of getting it wrong is silent + irreversible. So `/equipment` and `/player` always **defer**:

1. Dispatch returns `{ type: 5 }` (DEFERRED*CHANNEL_MESSAGE_WITH_SOURCE) within milliseconds. Discord shows *"Bot is thinking…"\_.
2. The actual search + render is kicked off via `ctx.context.cloudflare.ctx.waitUntil(...)`, which keeps the Worker isolate alive past the response return.
3. The followup PATCHes the deferred message at `https://discord.com/api/v10/webhooks/{appId}/{interactionToken}/messages/@original` with the embed body.

**Critical gotcha:** the followup webhook endpoint family is authenticated **solely by the `interactionToken` baked into the URL**. It does NOT accept (and silently 401s on) the `Authorization: Bot ${DISCORD_BOT_TOKEN}` header that everything else in this codebase uses. We learned this the painful way — see the TT-159 fix commit (`fb58d42`). The dispatch's followup PATCH explicitly omits `Authorization` and checks `response.ok`, logging via `Logger.error` (which fires the alerter) on non-2xx so a future regression surfaces in alerts rather than as silent _"didn't respond in time"_ timeouts.

The followup body cannot toggle ephemeral state — `flags` are set at ack time. We ack public so single-match results are visible to the channel; ambiguity / no-match hints are public too (informational, fine to share).

### Permission gating

`/equipment` and `/player` are gated by `DISCORD_SEARCH_ALLOWED_ROLES` — comma-separated role IDs. Empty/unset → everyone in the guild. This is **separate from `DISCORD_ALLOWED_ROLES`** (which gates moderation buttons), so search can be opened to all verified members without granting moderation rights. Both checks live in `app/lib/discord/moderation.ts` (`checkSearchPermissions`, `checkModeratorPermissions`).

In `ENVIRONMENT=development`, the well-known role string `role_e2e_moderator` is auto-allowed for both gates so Playwright e2e specs (`e2e/discord-search.spec.ts`, `e2e/discord-moderation.spec.ts`) pass without each developer adding it to env vars.

### Observability

Every search invocation emits a structured log line via `Logger.info`:

```
discord.search.invocation
  command:        "equipment" | "player"
  query:          truncated/sanitised query string (≤100 chars)
  outcome:        "single" | "dominant" | "ambiguous" | "no-match" | "error"
  topRank:        ts_rank of winner (or null)
  runnerUpRank:   ts_rank of #2 (or null)
  matchCount:     number of rows from the RPC
  latencyMs:      end-to-end search + render time
```

This is what the 1.5× threshold tuning will be driven from. `Logger.error` fires on followup-PATCH failures and search-RPC failures — both reach the alerts channel via the unified alerter.

## Moderation buttons (the primary moderator surface)

When users submit content via the site, the bot posts an embed in `DISCORD_CHANNEL_ID` (or the per-submission-type channel via `unified-notifier.server.ts`) with Approve / Reject buttons. Each submission type has its own button pair:

- **Equipment submissions** — `approve_equipment_<id>` / `reject_equipment_<id>`
- **Player submissions** — `approve_player_<id>` / `reject_player_<id>`
- **Player edits** — `approve_player_edit_<id>` / `reject_player_edit_<id>`
- **Equipment edits** — `approve_equipment_edit_<id>` / `reject_equipment_edit_<id>`
- **Player equipment setups** — `approve_player_equipment_setup_<id>` / `reject_player_equipment_setup_<id>`
- **Video submissions** — `approve_video_<id>` / `reject_video_<id>`
- **Reviews** — `approve_review_<id>` / `reject_review_<id>`

The `custom_id` prefix-match routing in `dispatch.ts:handleMessageComponent` is order-sensitive — longer prefixes (`approve_player_equipment_setup_`) must be matched before shorter ones (`approve_player_`) to avoid the shorter prefix swallowing them. This is regression-pinned in `app/lib/discord/__tests__/dispatch.test.ts`.

### Two-approval workflow

The DB trigger `update_submission_status` enforces:

1. **First approval click** → status flips to `awaiting_second_approval`. Discord message refreshes to show this state.
2. **Second approval click** (different moderator) → status flips to `approved`, the per-type apply hook runs (publishes the change), Discord message updates again.
3. Reject at any stage → status flips to `rejected`, message updates.

The two-approval rule applies to Discord clicks only. A single click in the **admin UI** (`/admin/...`) flips straight to `approved` — see `archive/DISCORD-HARDENING.md` for the rationale.

### Permission gating

`DISCORD_ALLOWED_ROLES` — comma-separated role IDs. Empty/unset → everyone. In dev, `role_e2e_moderator` is auto-allowed.

## Permission gates at a glance

| Env var                        | Surface                    | Default when empty/unset |
| ------------------------------ | -------------------------- | ------------------------ |
| `DISCORD_ALLOWED_ROLES`        | Approve / Reject buttons   | Everyone in the guild    |
| `DISCORD_SEARCH_ALLOWED_ROLES` | `/equipment` and `/player` | Everyone in the guild    |

Both auto-allow `role_e2e_moderator` when `ENVIRONMENT=development`.

## Environment Variables

- `DISCORD_PUBLIC_KEY` — Ed25519 public key(s) for signature verification on `/api/discord/interactions`. Comma-separated; verifies against any. Prod has one entry (the prod Discord app's key). Local dev typically has two (real dev app key + the e2e test public key from `e2e/utils/discord.ts`) so real Discord clicks and Playwright click specs both verify against one running dev server. The test key is rejected at runtime if `ENVIRONMENT=production`.
- `DISCORD_BOT_TOKEN` — bot token used for REST calls (posting embeds, editing moderation messages). NOT used on the slash-command followup PATCH — that endpoint family is interaction-token-authenticated.
- `DISCORD_CHANNEL_ID` — channel where moderation embeds are posted.
- `DISCORD_GUILD_ID` — guild for slash-command registration and member-role lookups.
- `DISCORD_APP_ID` — application (not bot user) ID. Used **only** by `scripts/register-discord-commands.ts` — the runtime Worker doesn't read it.
- `DISCORD_ALLOWED_ROLES` — comma-separated role IDs that can moderate (button interactions). Empty/unset → everyone.
- `DISCORD_SEARCH_ALLOWED_ROLES` — comma-separated role IDs that can use `/equipment` and `/player`. Empty/unset → everyone. Separate from `DISCORD_ALLOWED_ROLES` so search can be opened wider than moderation.
- `DISCORD_ALERTS_CHANNEL_ID` — channel where `Logger.error` alerts land. Set as a wrangler secret in prod (intentionally not in `wrangler.toml [vars]` so dev doesn't inherit prod's channel ID).

**Script-only, prefixed:** when running `register-discord-commands.ts --env prod` from your local machine, the script reads `PROD_DISCORD_BOT_TOKEN`, `PROD_DISCORD_APP_ID`, `PROD_DISCORD_GUILD_ID`. The runtime Worker never reads these prefixed names — they're a script-only namespace so the prod credentials can sit in `.dev.vars` (gitignored) without leaking into a `wrangler dev` session.

## Local development — isolated dev application

**Why this matters.** Discord allows exactly one Interactions Endpoint URL per application. If local dev uses the prod app's credentials, the dev bot posts into the prod channel, and clicking a button there routes the interaction to the prod URL — which then tries to act on a submission ID that only exists in local Supabase. This pollutes the prod audit log (the `moderator_approvals` trigger from migration `20260423110000` now blocks the insert, but the click still hits prod). Use a separate dev application.

**One-time setup.**

1. **Create a dev Discord application** at <https://discord.com/developers/applications>. Generate a bot, copy the bot token, and note the application's public key.
2. **Create a dev guild + channel** for moderation testing — either a private channel in your existing test guild or a new invite-only server. Note the guild ID and channel ID (Discord settings → Advanced → Developer Mode → right-click → Copy ID).
3. **Add the bot to the dev guild** via the OAuth2 URL generator: `bot` + `applications.commands` scopes; permissions: Send Messages, Embed Links, Use Application Commands.
4. **Populate `.dev.vars`** with the dev-app values (see `.dev.vars.example`). Use the dev `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_GUILD_ID`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`. Roles can stay as-is or use dev-guild role IDs.

**Per-session tunnel.** Discord must reach `/api/discord/interactions` from the public internet, so the dev server needs a tunnel.

```sh
# Terminal 1 — dev server (binds tt-reviews.local:5173)
npm run dev

# Terminal 2 — quick tunnel (no Cloudflare account required)
cloudflared tunnel --url http://tt-reviews.local:5173
# → prints https://<random-subdomain>.trycloudflare.com
```

Take that hostname and set it as the dev application's **Interactions Endpoint URL** in the Discord Developer Portal: `https://<random-subdomain>.trycloudflare.com/api/discord/interactions`. Discord will hit it once with a PING; if signature verification passes, the URL saves.

**When the tunnel hostname changes** (every cloudflared restart with `--url`, since quick tunnels are ephemeral), re-paste the new URL in the Discord Developer Portal. For a stable hostname, register a named tunnel under your Cloudflare account and route a subdomain to it — overkill for casual dev.

**Verify isolation.** Submit a review in local dev → embed appears in the _dev_ channel only. Click Approve in the dev channel → the _local_ review's status flips. Prod Discord and prod DB see no traffic.

## Updating slash commands

The registered slash-command list (what shows up in Discord's `/` picker) is decoupled from the runtime code. Run `scripts/register-discord-commands.ts` whenever the array in `app/lib/discord/slash-commands.ts` changes — adding, removing, renaming, changing a description, or touching option types.

Why a script: there's no auto-registration in the Worker startup. Discord requires an explicit PUT to `https://discord.com/api/v10/applications/{appId}/guilds/{guildId}/commands`, and that PUT is the **only** way to delete a stale command. If the registered list drifts from the in-code array (e.g. a command you removed in code is still being shown to users in the picker), it's because nobody re-ran the script — there's nothing in deploy that does it for you.

The script auto-loads `.dev.vars` for both modes and picks credentials based on `--env`:

| `--env` | Vars read                                                                       |
| ------- | ------------------------------------------------------------------------------- |
| `dev`   | `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID` (the runtime/dev set) |
| `prod`  | `PROD_DISCORD_BOT_TOKEN`, `PROD_DISCORD_APP_ID`, `PROD_DISCORD_GUILD_ID`        |

The dev set is the same one the Worker reads under `wrangler dev`, so dev mode stays DRY. The `PROD_*` prefix is deliberate: the runtime Worker never reads those names, so holding the prod credentials in `.dev.vars` (gitignored) can't leak into a `wrangler dev` session.

### Dev guild

```sh
node --experimental-strip-types scripts/register-discord-commands.ts --env dev
```

Prints the target app + guild IDs, waits 2s for Ctrl-C, then PUTs and lists what's now registered.

**Dev names carry a `test-` prefix.** The dev script registers `/test-equipment` and `/test-player` (instead of the bare `/equipment` and `/player` that prod uses). This is deliberate:

- **Visual signal in the picker** so testers see immediately which commands run against the dev application + dev guild rather than prod.
- **Tighter role gate.** Set `DISCORD_SEARCH_ALLOWED_ROLES` in `.dev.vars` to your testing-mod role ID(s) to limit who can invoke them — useful for shared dev guilds.

The dispatch in `app/lib/discord/dispatch.ts:handleSlashCommand` strips the `test-` prefix when `ENVIRONMENT=development`, so the rest of the codepath (including the e2e tests at `e2e/discord-search.spec.ts`) stays environment-agnostic. In prod, an unexpected `test-equipment` invocation falls through to the "Unknown command" path.

### Prod guild

Add `PROD_DISCORD_BOT_TOKEN`, `PROD_DISCORD_APP_ID`, `PROD_DISCORD_GUILD_ID` to your local `.dev.vars` (or export them inline) and run:

```sh
node --experimental-strip-types scripts/register-discord-commands.ts --env prod --confirm prod
```

The `--confirm prod` flag is required for `--env prod` — refuses to run without it. The `PROD_*` prefix is the additional safety: `DISCORD_BOT_TOKEN` (unprefixed) can never accidentally hit the prod Discord application from the script.

### Idempotency

PUT is full-replace. If the in-code array has `[/equipment, /player]` and Discord currently has `[/equipment, /player, /approve, /reject]`, re-running the script removes `/approve` and `/reject` cleanly. There's no need to manually `DELETE` stale commands.

The same applies in reverse: removing a command from `slash-commands.ts` and re-running deletes it from Discord. Don't expect Discord to delete a command on its own.

### Cleaning up stray global registrations

Discord exposes **two parallel command lists per application**:

- **Guild-scoped** at `/applications/{appId}/guilds/{guildId}/commands` — what the script normally manages. Local to one guild, propagates instantly.
- **Global** at `/applications/{appId}/commands` — visible in every guild the bot is in, takes ~1 hour to propagate.

Both lists render in the slash-command picker simultaneously **without dedup** — so a legacy global `/equipment` shows up alongside our new guild-scoped `/equipment` as two separate entries. This was the state pre-TT-160 (the original commands were registered manually as global) and is the most likely source of "duplicate slash commands in the picker" complaints.

To clear an app's global command list:

```sh
# Dev bot:
node --experimental-strip-types scripts/register-discord-commands.ts --env dev --clear-globals

# Prod bot:
node --experimental-strip-types scripts/register-discord-commands.ts --env prod --confirm prod --clear-globals
```

`--clear-globals` PUTs `[]` to the global endpoint, which Discord treats as "delete all". Guild-scoped commands are not touched. The flag is idempotent and safe to re-run.

If duplicates persist in the picker after running the cleanup, force a Discord client refresh (Ctrl-R / Cmd-R) — the picker contents are client-cached.

## Caveats

### Discord caches embed images server-side

Any URL passed as `thumbnail.url` or `image.url` is fetched server-side by Discord's CDN and proxied. Discord then serves a cached copy from its own infrastructure for as long as it sees fit.

Practical consequence: if a moderator replaces the photo for a piece of equipment, embeds posted to the channel **before** the change keep showing the old image. New `/equipment` invocations show the new image; historical messages don't update. This is a Discord limitation, not ours, and not fixable from our side.

### Discord auto-unfurls bare URLs in message content

When the bot posts content text containing a URL, Discord automatically fetches and renders the OG card under the message. For the no-match fallback link in `/equipment` / `/player`, that auto-unfurl shows the generic site OG card and adds noise. We suppress it by wrapping the URL in `<...>` — Discord's canonical "link, no preview" form. The URL stays clickable, just unpreviewed. We can't use the message-level `flags: 4` (SUPPRESS_EMBEDS) instead because it would also strip our own equipment/player embed when the search succeeds.

### Embed rendering differs across Discord clients

Two-column field layouts collapse on narrow widths; thumbnail position can shift; the `color` accent renders as a left bar on desktop and a smaller indicator on mobile. The shapes we ship (author + title + description + fields + footer) render acceptably on desktop, web, iOS, and Android — but visual QA on at least one mobile client should be part of any embed-shape change before declaring it done.
