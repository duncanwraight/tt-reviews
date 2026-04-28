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

### 2. Slash Commands (Alternative Method)

- `/approve <id>` - Approve a submission by ID
- `/reject <id>` - Reject a submission by ID

### 3. Search Commands

- `/equipment <query>` - Search equipment database
- `/player <query>` - Search player database

## Permission System

Only users with configured Discord roles can moderate:

- Set via `DISCORD_ALLOWED_ROLES` environment variable (comma-separated role IDs)
- If no roles configured, all users are allowed

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
- `DISCORD_BOT_TOKEN` — bot token used for REST calls (posting embeds, editing messages)
- `DISCORD_CHANNEL_ID` — channel where moderation embeds are posted
- `DISCORD_GUILD_ID` — guild for slash-command registration and member-role lookups
- `DISCORD_ALLOWED_ROLES` — comma-separated role IDs that can moderate

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
