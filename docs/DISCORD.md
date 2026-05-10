# Discord Integration

## Integration approach — bot token + channel ID, never webhook URLs

All Discord output from this app goes through bot-token REST calls — `POST https://discord.com/api/v10/channels/{channelId}/messages` with `Authorization: Bot ${DISCORD_BOT_TOKEN}`. Discord webhook URLs (`https://discord.com/api/webhooks/{id}/{token}`) are **not** used and must not be introduced.

Why: one bot identity keeps the author/avatar consistent, lets us post message components (the moderation buttons depend on this — webhooks can't deliver interaction-routed components for an app the way a bot can), and we already manage `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` as required env vars. Adding webhook URLs would mean a second credential type with its own rotation/revocation story.

When adding a new Discord notification surface (alerts, moderation messages, anything else), reuse `app/lib/discord/unified-notifier.server.ts` or `app/lib/alerts/discord-alerter.server.ts`, or follow the same bot+channel-ID pattern. Do not propose `*_WEBHOOK_URL` env vars or `discord.com/api/webhooks/...` POST paths.

## Moderation Workflow

### 1. Button Interactions (Primary Method)

When submissions are made, Discord automatically sends embed messages with interactive buttons:

- **Equipment submissions**: Green "Approve Equipment" / Red "Reject Equipment" buttons
- **Player submissions**: Green "Approve Player" / Red "Reject Player" buttons
- **Player edits**: Green "Approve Edit" / Red "Reject Edit" buttons

Moderators simply click the buttons to approve/reject submissions.

### 2. Search Commands

- `/equipment <query>` — search the equipment catalogue, returns one strong match as a rich embed (or an ambiguity hint / fallback link)
- `/player <query>` — same shape for player profiles

The slash-command surface is intentionally narrow. Moderation is button-only — `/approve` and `/reject` were dropped in TT-159 because the buttons attached to each moderation embed are the real moderator surface. See "Updating slash commands" below for how the registered command list is kept in sync.

## Permission System

Two distinct role allowlists, both reading comma-separated Discord role IDs from env:

- **`DISCORD_ALLOWED_ROLES`** gates the **moderation button interactions** (Approve/Reject buttons on submission embeds). Empty/unset → everyone. Used by `checkModeratorPermissions`.
- **`DISCORD_SEARCH_ALLOWED_ROLES`** gates **`/equipment` and `/player` slash commands**. Empty/unset → everyone (TT-159). Distinct from the moderator list so search can be opened to all verified members without granting moderation rights. Used by `checkSearchPermissions`.

In dev (`ENVIRONMENT=development`), the well-known `role_e2e_moderator` ID is auto-allowed for both gates so Playwright Discord click specs pass without each developer adding it to their env vars.

## Two-Approval Workflow

1. **First approval**: Status becomes "awaiting_second_approval"
2. **Second approval**: Status becomes "approved" and changes are applied
3. Discord provides feedback about approval status after each action

## Workflow Summary

1. User submits content → bot posts embed with buttons in the moderation channel
2. Moderator clicks "Approve" button → First approval recorded
3. Another moderator clicks "Approve" → Second approval recorded, content published

## Environment Variables

- `DISCORD_PUBLIC_KEY` — Ed25519 public key(s) for signature verification on `/api/discord/interactions`. Comma-separated; verifies against any. Prod has one entry (the prod Discord app's key). Local dev typically has two (real dev app key + the e2e test public key from `e2e/utils/discord.ts`) so real Discord clicks and Playwright click specs both verify against one running dev server. The test key is rejected at runtime if `ENVIRONMENT=production`.
- `DISCORD_BOT_TOKEN` — bot token used for REST calls (posting embeds, editing messages, slash-command followup PATCHes)
- `DISCORD_CHANNEL_ID` — channel where moderation embeds are posted
- `DISCORD_GUILD_ID` — guild for slash-command registration and member-role lookups
- `DISCORD_APP_ID` — application (not bot user) ID. Used **only** by `scripts/register-discord-commands.ts` (TT-160) — the runtime Worker doesn't read it. Set in `.dev.vars` for dev; pass via shell env when running the script against prod.
- `DISCORD_ALLOWED_ROLES` — comma-separated role IDs that can moderate (button interactions). Empty/unset → everyone.
- `DISCORD_SEARCH_ALLOWED_ROLES` — comma-separated role IDs that can use `/equipment` and `/player`. Empty/unset → everyone. Separate gate so search can be opened wider than moderation (TT-159).

## Local development — isolated dev application

**Why this matters.** Discord allows exactly one Interactions Endpoint URL per application. If local dev uses the prod app's credentials, the dev bot posts into the prod channel, and clicking a button there routes the interaction to the prod URL — which then tries to act on a submission ID that only exists in local Supabase. This pollutes the prod audit log (the `moderator_approvals` trigger from migration `20260423110000` now blocks the insert, but the click still hits prod). Use a separate dev application.

**One-time setup.**

1. **Create a dev Discord application** at <https://discord.com/developers/applications>. Generate a bot, copy the bot token, and note the application's public key.
2. **Create a dev guild + channel** for moderation testing — either a private channel in your existing test guild or a new invite-only server. Note the guild ID and channel ID (Discord settings → Advanced → Developer Mode → right-click → Copy ID).
3. **Add the bot to the dev guild** via the OAuth2 URL generator: `bot` + `applications.commands` scopes; permissions: Send Messages, Embed Links, Use Application Commands.
4. **Populate `.dev.vars`** with the dev-app values (see `.dev.vars.example`). Use the dev `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_GUILD_ID`, `DISCORD_PUBLIC_KEY`. Roles can stay as-is or use dev-guild role IDs.

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

### Dev guild

```sh
set -a; source .dev.vars; set +a
node --experimental-strip-types scripts/register-discord-commands.ts --env dev
```

The script reads `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID` from the shell. It prints what it's about to write, waits 2s for Ctrl-C, then PUTs and lists the result.

### Prod guild

```sh
DISCORD_BOT_TOKEN=... DISCORD_APP_ID=... DISCORD_GUILD_ID=... \
  node --experimental-strip-types scripts/register-discord-commands.ts --env prod --confirm prod
```

The `--confirm prod` flag is required for `--env prod` — guards against accidentally writing prod credentials sourced from a misconfigured shell. Refuses to run without it.

### Idempotency

PUT is full-replace. If the in-code array has `[/equipment, /player]` and Discord currently has `[/equipment, /player, /approve, /reject]`, re-running the script removes `/approve` and `/reject` cleanly. There's no need to manually `DELETE` stale commands.

The same applies in reverse: removing a command from `slash-commands.ts` and re-running deletes it from Discord. Don't expect Discord to delete a command on its own.

### Naming dev vs prod

Same names in both (`/equipment`, `/player`). The dev/prod separation comes from running two distinct Discord applications in two distinct guilds — the same names can't collide because users only see commands registered in their guild's bot. Don't add a `/test-` prefix to dev commands; it just creates drift between dev and prod test scripts.

## Caveats

### Discord caches embed images

Any URL passed as `thumbnail.url` or `image.url` is fetched server-side by Discord's CDN and proxied. Discord then serves a cached copy from its own infrastructure for as long as it sees fit.

Practical consequence: if a moderator replaces the photo for a piece of equipment, embeds posted to the channel **before** the change keep showing the old image. New `/equipment` invocations show the new image; historical messages don't update. This is a Discord limitation, not ours, and not fixable from our side.
