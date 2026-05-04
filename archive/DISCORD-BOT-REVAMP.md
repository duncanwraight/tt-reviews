# Discord bot revamp — `/equipment` and `/player` rebuild

Status: drafting (not yet broken into Plane tickets).

The Discord bot's slash-command surface is being reshaped around a single intent: "let people in our Discord pull genuinely useful site content into their conversations." Today's `/equipment` and `/player` commands return a bare-text list of up to 5 weak matches; the underlying search is column-blind to manufacturer; and slash-command admin (registration, dev/prod split, role gating) is undocumented and partly manual. This plan replaces the search+render path end to end, drops two slash commands we don't use, formalises registration, and tightens the test bar to "performant, reliable, secure, very thoroughly tested."

This doc supersedes the historical record in `REFACTOR-DISCORD.md` (which captures the 2026-04-22 file split) — that work stays as the file-organisation baseline; this work changes behaviour inside the existing modules.

## Background — what's there now

Investigation summary (full trace lives in conversation that produced this doc; key file references inline below).

**Today's slash commands** (`app/lib/discord/dispatch.ts:20-69`):

- `/equipment <query>` and `/player <query>` — search.
- `/approve <id>` and `/reject <id>` — moderation, redundant with the button interactions on each moderation embed.

**Today's permission model** (`dispatch.ts:44-51`): every slash command is gated behind `moderation.checkUserPermissions(...)`, which checks against `DISCORD_ALLOWED_ROLES`. So `/equipment` and `/player` are mod-only today, which doesn't match the intent.

**Today's search**:

- `app/lib/database/equipment.ts:31-46` calls `.textSearch("name", query, { type: "websearch" })` — full-text on the `name` column only.
- The schema ships a GIN index on `to_tsvector('english', name || ' ' || manufacturer)` (`supabase/migrations/20250608181927_create_initial_schema.sql:91`) — but the query expression doesn't match the index expression, so (a) `manufacturer` is invisible to the search and (b) the index isn't even used (sequential scan). This is why "Victas VKM" misses entirely.
- `app/lib/database/players.ts:166-181` is the same shape on `players.name`.

**Today's render** (`app/lib/discord/search.ts`): plain markdown content (`{ content: "..." }`), up to 5 results, `**Name** by Manufacturer\nType: blade\n<url>`. Discord's link-unfurl supplies the OG-image card (the hero we fixed in `75a9511`); the bot itself sends no embed, no thumbnail, no rating.

**Already-stub paths**: `notifyReviewApproved` / `notifyReviewRejected` in `notifications.ts:115-135` are stubs; nothing posts approved reviews to a community channel. _Not_ in scope for this revamp — this is pull, not push.

**No registration script**: nothing under `scripts/` or `app/` calls `/applications/{appId}/commands`. The four existing commands were registered manually. Adding/removing/changing commands is currently a manual-curl exercise.

## Goals and non-goals

**In scope**

- Rebuild `/equipment` and `/player` so they return one strong, useful result.
- Switch return shape from plain text to a rich Discord embed (image, ratings, specs, links).
- Move equipment search into a Postgres RPC that uses the existing GIN index and supports manufacturer matching.
- Move player search to the same shape (RPC + ranking) for consistency and testability.
- Drop `/approve` and `/reject` slash commands; drop the legacy `!equipment` / `!player` prefix-message paths.
- Replace the "all slash commands gate on `DISCORD_ALLOWED_ROLES`" pattern with a per-command role allowlist that's distinct from the moderator list.
- Add a committed registration script (`scripts/register-discord-commands.ts`) that's idempotent, dev/prod aware, and is the single source of truth for what commands exist.
- Test coverage: unit tests for the embed renderer (pure), integration tests against the seeded DB for the SQL RPCs, one e2e through the existing Discord click harness asserting the embed shape.

**Explicitly out of scope** (push back if any of these are wrong)

- Site→Discord push of any kind (manual share buttons, auto-announce on review approval). User confirmed this is abuse-prone and unwanted.
- Pagination / multi-result UIs. One result or an ambiguity error.
- Fuzzy matching (pg_trgm "did you mean"). Defer until we see real-world misses.
- Per-user rate limiting beyond the existing `RATE_LIMITS.DISCORD_WEBHOOK` on `/api/discord/interactions`.
- Touching the moderation button-interaction path, the unified notifier, or any `notifyNew*` flow.
- Anything that changes the `equipment_reviews` or `equipment` schema beyond adding RPC functions.

## Decided design

The following points are agreed and locked in.

### Search behaviour — equipment

- **Match domain.** Full equipment name OR partial name OR full "manufacturer name" combined string. Manufacturer alone (e.g. `butterfly`) is _not_ a valid query.
- **Result count.** Single best match, or an ambiguity error. Never multi-result.
- **Ambiguity rule.** When more than one row matches and no row strongly outranks the others, return an ephemeral hint:
  > _"Multiple equipment match 'butterfly' (47 results). Try including a model name, e.g. `butterfly viscaria`."_
  > Concrete threshold for "strongly outranks" is a TBD in the implementation — likely "top result's `ts_rank` is at least 1.5× the runner-up". That ratio is tunable; we'll pick by trying it against seed data.
- **Implementation.** New SQL function:

  ```sql
  CREATE FUNCTION search_equipment(query text)
  RETURNS TABLE (id uuid, name text, manufacturer text, slug text, category text, rank real)
  LANGUAGE sql STABLE
  AS $$
    SELECT id, name, manufacturer, slug, category::text,
           ts_rank(
             to_tsvector('english', name || ' ' || manufacturer),
             websearch_to_tsquery('english', query)
           ) AS rank
    FROM equipment
    WHERE to_tsvector('english', name || ' ' || manufacturer)
          @@ websearch_to_tsquery('english', query)
    ORDER BY rank DESC
    LIMIT 10;
  $$;
  ```

  - The `WHERE` expression matches the existing `idx_equipment_name_gin` index, so the planner uses it.
  - Returns up to 10 to let the caller decide ambiguity; only 1 ever renders.
  - `STABLE` (read-only); grant `EXECUTE` to `anon, authenticated, service_role` since this is read-only public data.

### Search behaviour — player

- **Match domain.** Partial name match only. No nicknames in v1; no country/era filters.
- **Result count + ambiguity.** Same rule as equipment.
- **Implementation.** Mirror RPC `search_players(query text)` returning ranked rows. Same shape, different table, no manufacturer column.

### Embed contents — equipment

Title / link / thumbnail / fields, in this order:

| Slot                       | Source                                                                   | Notes                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                    | `name`                                                                   | Linked via embed `url` to `/equipment/<slug>`                                                                                                                                                |
| `author.name`              | `manufacturer`                                                           | Renders above title in small text                                                                                                                                                            |
| `thumbnail.url`            | derived from `image_key` (R2 → public CDN URL)                           | Falls back to placeholder if absent — confirm placeholder behaviour                                                                                                                          |
| `description`              | `description` (truncated to ~200 chars)                                  | Skip if absent                                                                                                                                                                               |
| field "Manufacturer specs" | rendered from `specifications` JSONB                                     | Format per spec type — weight in g, hardness numeric, speed/spin/control as bare numbers. Field title alone is sufficient context per user; no "scales aren't comparable" disclaimer needed. |
| field "Reviews"            | `★★★★☆ 4.1 (37 reviews)` style                                           | Uses 5-star scale — see "Rating display" below                                                                                                                                               |
| `footer.text`              | `tabletennis.reviews/equipment/<slug>`                                   | Optional — title is already linked                                                                                                                                                           |
| `color`                    | per category (blade/rubber/ball) — pick three site-consistent hex values | Subtle differentiation in the channel                                                                                                                                                        |

### Embed contents — player

| Slot                  | Source                                                                                        | Notes                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `title`               | `name`                                                                                        | Linked via embed `url` to `/players/<slug>`                                        |
| `author.name`         | flag emoji + country code from `represents`                                                   | e.g. "🇨🇳 CHN"                                                                      |
| `thumbnail.url`       | derived from `players.image_key`                                                              |                                                                                    |
| field "Profile"       | `playing_style`, `active`/`retired`, `highest_rating`, `active_years`                         | Two-column compact layout                                                          |
| field "Current setup" | latest _verified_ row from `player_equipment_setups` formatted "Blade / FH / BH (since YYYY)" | "since YYYY" = the `year` column on the latest setup                               |
| field "Recent videos" | up to 3 from `player_footage` where `active=true`, ordered by `created_at desc`               | Format `[Title](url)` per line; titles are user-submitted so cap each at ~80 chars |

### Rating display

Site convention: 5-star visual + numeric + count. The `RatingStars` React component (`app/components/ui/RatingStars.tsx:1-48`) takes a _0-5_ number and renders `★★★★☆ 4.1 (37 reviews)`.

DB stores `equipment_reviews.overall_rating` on a _0-10_ scale (per CLAUDE.md and confirmed in `app/components/equipment/AverageRatings.tsx:103` showing `X.X/10`).

Discord embeds don't render coloured stars but unicode `★` `☆` work cleanly. The renderer will:

- Take the `/10` average from the DB (likely via the existing `get_equipment_stats` RPC at `supabase/migrations/20250614140000_create_equipment_stats_functions.sql`).
- Convert to 0-5 by dividing by 2, then build the `★`/`☆` string by floor + half-star rule (mirror `RatingStars.tsx:21-22`).
- Output `★★★★☆ 4.1 (37 reviews)` — display the _site-canonical_ 5-star value to keep the embed and equipment page consistent.

### Commands — what stays, what goes

- **Keep** `/equipment <query>` (registered globally; production app).
- **Keep** `/player <query>` (registered globally; production app).
- **Drop** `/approve` and `/reject` slash commands. Removed from the registration script and removed from `dispatch.handleSlashCommand`'s switch. Button-interaction handlers in `handleMessageComponent` stay untouched — those are the real moderation surface.
- **Drop** the `!equipment` and `!player` prefix-message commands (`dispatch.handlePrefixCommand` and the `searchEquipment` / `searchPlayer` exports it consumes from `search.ts`). These are orphaned plumbing — same code path, no docs, no callers in the wild.

### Permission gating — per-command role allowlist

Today's `dispatch.ts:44-51` runs `checkUserPermissions` against `DISCORD_ALLOWED_ROLES` for _every_ slash command. After the changes above, the only commands left are read-only search — but they should still be gated to keep newbie-tier users out (per user requirement).

Decision: introduce a second env var `DISCORD_SEARCH_ALLOWED_ROLES`, checked the same way as `DISCORD_ALLOWED_ROLES` but distinct.

- `DISCORD_ALLOWED_ROLES` — moderator role IDs. Continues to gate the _button interactions_ (approve/reject) in `handleMessageComponent`. Unchanged.
- `DISCORD_SEARCH_ALLOWED_ROLES` — role IDs allowed to use `/equipment` and `/player`. New. Empty/unset means "everyone" (matches the existing convention for `DISCORD_ALLOWED_ROLES`).
- Implementation: split `checkUserPermissions` into `checkModeratorPermissions` (reads `DISCORD_ALLOWED_ROLES`) and `checkSearchPermissions` (reads `DISCORD_SEARCH_ALLOWED_ROLES`). `dispatch.handleSlashCommand` uses the search check; `handleMessageComponent` uses the moderator check.
- Failure mode: ephemeral "❌ You do not have permission to use this command" (same as today). The command stays _visible_ in the picker for non-permitted users — see "Open question: hide-from-picker" below for the alternative.
- Both vars need adding to `validateEnv()` in `app/lib/env.server.ts` per the CLAUDE.md rule. `DISCORD_SEARCH_ALLOWED_ROLES` is optional (empty allowed); `DISCORD_ALLOWED_ROLES` already exists.

### Registration script

New file: `scripts/register-discord-commands.ts` (or `.sh` wrapping a small Node script — TBD by what's idiomatic in this repo's `scripts/` directory).

- Takes `--env dev|prod` (or reads `ENVIRONMENT`).
- Reads `DISCORD_BOT_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID` from env.
- Defines the two commands (`/equipment`, `/player`) as a single typed array — single source of truth for option types, descriptions, and `default_member_permissions`.
- Calls `PUT /applications/{appId}/guilds/{guildId}/commands` (guild-scoped) with the full array. PUT is idempotent — overwrites whatever was there. This is how we _delete_ `/approve` and `/reject` cleanly: by re-PUTting without them.
- Prints what got registered.
- Documented in `docs/DISCORD.md` under a new "Updating commands" section.

Why guild-scoped not global: guild commands propagate instantly (vs ~1 hour for global) and avoid the concern about a stale prod registration lingering after schema changes. This requires `DISCORD_GUILD_ID` to be set for both dev and prod, which it already is.

### Dev/prod isolation

The existing dev-app pattern (`docs/DISCORD.md:60-86`) already gives us a separate dev application with its own bot token, public key, app ID, and guild. The registration script just reads those from `.dev.vars` instead of prod env. Same code, same command names — the "different bot, different guild" isolation handles the picker disambiguation. The user's question about `/test-equipment` prefixed names is captured as an open question below.

## Discord platform constraints

These are externally-imposed constraints from Discord that shape what the bot is allowed to do. Calling them out explicitly so they're not discovered mid-implementation.

### Response deadline — 3 seconds, then we're dead

Discord requires the bot to acknowledge a slash-command interaction within **3 seconds** or the user sees _"Application did not respond"_. The full embed doesn't have to land in that window — the bot can reply with `type: 5` (deferred ack) and follow up with the embed via a webhook PATCH any time within the next 15 minutes.

This is the single most important external constraint, because the cost of getting it wrong is the bot looking broken to the user. Two options:

- **(a) Stay synchronous.** Equipment embed needs ~2 reads; player embed needs player row + setups + footage + (likely) equipment-name resolutions for the "Current setup" field. On a warm path that fits comfortably in 3s. On a cold Cloudflare Worker isolate + cold Supabase pool + first-touch R2 image proxying, it gets tight. One slow path and the user sees the failure message.
- **(b) Defer always.** Reply `type: 5` immediately, do the work, PATCH the deferred message with the embed. Cost: a brief "Bot is thinking…" placeholder shows for ~0.5–2s. Benefit: complete immunity to cold-start variance and to future expansion of what the embed contains.

**Recommendation: (b) defer always**, for both `/equipment` and `/player`. The placeholder is a familiar Discord pattern, the resilience win is real, and it removes a class of "works in dev, occasionally fails in prod" bugs. The 3-second deadline is unforgiving and silent — better to take it off the table than to fight it as the embed grows.

### Discord caches embed images

Any URL passed as `thumbnail.url` or `image.url` is fetched server-side by Discord's CDN and proxied. Discord then serves a cached copy from its own infrastructure for as long as it sees fit. The practical consequence: if a moderator replaces the photo for a piece of equipment, embeds that were posted to the channel _before_ the change keep showing the old image. New `/equipment` invocations show the new image; historical messages don't update.

This is a Discord limitation, not ours, and not fixable. Worth a one-line note in the `docs/DISCORD.md` update so it doesn't surprise anyone later.

### Embed rendering differs across clients

Discord layout shifts noticeably between desktop, web, iOS, and Android. Two-column field layouts collapse on narrow widths; thumbnail position can change; embed `color` accent renders as a left bar on desktop and a smaller indicator on mobile. The proposed shape (author + title + thumbnail + fields) is conservative and renders fine on all clients in principle — but visual QA on at least one desktop client and one mobile client should be a sign-off requirement before closing Child 5.

## Open questions for user to settle

These need a decision before tickets get cut.

### Q1 — Dev command naming

User suggested `/test-equipment` for the dev bot. Two options:

- **(a) Same names** (`/equipment` in both dev and prod). Cleaner. Works because the dev bot lives in the dev guild only and the prod bot in the prod guild only — no picker overlap. This is the default unless we know users are joined to both guilds and find it confusing.
- **(b) Different names** (`/test-equipment` for dev, `/equipment` for prod). Useful only if a user is in both guilds and needs to disambiguate at a glance. Costs us a small wrinkle in the registration script (pass a `--prefix test-` flag) and means dev test specs need to know about both names.

Recommendation: **(a)**. Pick (b) only if you want the visual signal in the dev guild's picker.

### Q2 — Hide commands from non-permitted users in the picker

Two ways to enforce role gating:

- **(a) Code-side check only** (proposed above). `default_member_permissions` is unset on registration; everyone sees the command in their picker; non-permitted users get an ephemeral error on use.
  - Pro: configurable purely via env, no admin clicks in Discord UI.
  - Con: the command is _visible_ to users who can't use it. They'll try it and bounce.
- **(b) Discord-side hide via `default_member_permissions: "0"`** plus admin role-grant in Discord's Server Settings → Integrations → Bot UI.
  - Pro: command is genuinely invisible in the picker for users who can't use it.
  - Con: the allow-list lives in Discord's UI, not env vars. Onboarding a new role means clicking through Server Settings.
  - Hybrid: do both — code check is the authoritative gate (env-driven, version-controlled), and the picker hide is a UX nicety.

Recommendation: **(a)** to start. If the "command appears but errors out" UX bothers you in practice, layer (b) on top later — it's purely additive.

### Q3 — Embed `color` per category

Three category colours for blade / rubber / ball. Suggest pulling from the existing site palette (likely in `tailwind.config` or design tokens). Or pick three Discord-friendly hex values. Either way I'd want them to feel site-consistent.

### Q4 — Image fallback when `image_key` is missing

A meaningful number of equipment / player rows still have no photo. Options:

- Omit the thumbnail entirely (Discord embed shrinks gracefully).
- Use a generic placeholder image hosted under `/public/` (e.g. a TT-Reviews logo).

Recommendation: omit. Placeholder noise looks worse than no image.

### Q5 — Ambiguity ratio threshold

"Top result outranks runner-up by 1.5×" is my current proposal. Could go higher (stricter, more ambiguous-error rejections) or lower (more "best-guess" matches at the cost of occasional wrong picks). I'd settle this empirically against seed data during implementation, not now — flagging it so you know it's tunable.

### Q6 — Anything else you want in the embeds

The "Profile" / "Current setup" / "Recent videos" split for players, and "Manufacturer specs" / "Reviews" for equipment, is my proposal. If there's a piece of site data you'd want surfaced — playing-style notes, equipment lineage, popular reviews quoted, anything else — flag it before tickets get cut.

### Q7 — Empty-result UX

The plan covers two response shapes (single match → embed, multiple matches → ambiguity hint) but not the third case: zero matches. A query like `/equipment ksdjfh` matches nothing today and would return... what?

- **(a) Ephemeral "No equipment found for 'ksdjfh'."** — terse, honest, but a dead end.
- **(b) Same, plus a fallback link**: _"No equipment found for 'ksdjfh'. Try the site search: tabletennis.reviews/equipment?q=ksdjfh"_ — gives the user a way out when our built-in search is too strict.

Recommendation: **(b)**. The bot should keep being useful even when its own match logic misses. Costs nothing and softens the failure mode while we defer fuzzy matching.

### Q8 — Autocomplete as a v2 enhancement

Discord slash commands support live autocomplete: as the user types `/equipment butter`, the bot can return suggestions in a dropdown ("Butterfly Viscaria", "Butterfly Tenergy 05", etc.). The user picks one, then the command runs against that exact selection.

Why this matters: it would replace the ambiguity-error UX entirely. Users wouldn't need to know to add a model name — they'd just see options as they type. The "1.5× threshold" tuning problem in Q5 effectively disappears.

Cost: another interaction type to handle, another RPC path (a "prefix-search top 25" RPC), more test surface, and a registration-shape change for the slash commands.

Recommendation: **defer to v2**, but flag now as an open roadmap item. If we hear post-launch that users keep hitting the ambiguity error, autocomplete becomes the obvious next step rather than a surprise.

## Test strategy

Three layers, deliberately picked to defeat the failure mode that's bitten this codebase before (mocked-Supabase tests passing through query-shape bugs — see `feedback_e2e_for_new_data_paths.md`).

### Unit — embed renderers (pure)

`app/lib/discord/embeds/{equipment,player}.ts` — pure functions taking a typed input shape and returning a Discord embed object. Test in isolation with no DB and no Discord. Cover:

- Equipment with full data → all fields populated correctly.
- Equipment with no image → thumbnail omitted.
- Equipment with no reviews → reviews field reads "No reviews yet" (or omitted, TBD).
- Player with no current setup → "Current setup" field omitted.
- Player with no videos → "Recent videos" field omitted.
- Specs with all 7 typed fields populated.
- Specs with sparse data (only a couple of fields).
- Rating conversion `8.4/10` → `★★★★☆ 4.2 (37 reviews)`.

### Integration — SQL RPCs against seeded DB

`app/lib/database/__tests__/search.integration.test.ts` (or co-located with the existing search file) — runs against the local Supabase container, asserts on real query behaviour. Must NOT mock the Supabase client.

- `search_equipment("Victas VKM")` returns the VKM row with rank > 0.
- `search_equipment("viscaria")` returns Butterfly Viscaria as top result.
- `search_equipment("butterfly")` returns >5 rows (the ambiguity-trigger case).
- `search_equipment("nonsense xyz123")` returns 0 rows.
- `search_equipment("vkm zc")` returns the VKM ZC row (if present in seed; otherwise add to seed).
- `search_players("ma lo")` returns Ma Long.
- `search_players("smith")` returns >1 row if seed has multiple Smiths.
- Both functions: SECURITY semantics — `EXECUTE` works with `anon` role (i.e. doesn't accidentally require service_role).
- Both functions: `EXPLAIN` shows the GIN index in use (regression guard against the original bug — the whole point of this rebuild is that the index is used).

### E2e — Discord click harness

One spec under `e2e/` (or wherever the existing Discord interaction specs live — to be located) that:

- Sends a mocked `/equipment` interaction payload signed with the e2e test key.
- Asserts the response is type-4 with an `embeds[0]` containing the expected title and a `thumbnail.url`.
- Repeats for `/player`.
- Repeats for an ambiguity case (asserts ephemeral error with the hint string).

This catches the "we built it, but Discord's signature verification or response shape rejects it" class of bug that integration tests can't see.

### Removal coverage

When deleting `/approve` and `/reject` and the prefix commands, also delete the corresponding tests in `app/lib/discord/__tests__/dispatch.test.ts`. Add a single assertion in `register-discord-commands.test.ts` that the registered command list contains exactly two entries (`equipment`, `player`) — guards against accidental re-introduction.

## Operations and rollout

Things that don't show up in code but will determine whether the launch goes smoothly. These need owners (probably the user, with the bot mod team) before tickets get cut.

### Search-role grant process

Once `DISCORD_SEARCH_ALLOWED_ROLES` is set, any new server member who hasn't been granted that role gets the "❌ You do not have permission" error on first use. The plan needs answers to:

- **Does a "search-eligible" role exist today, or do we need to create one?** Likely needs creating — the existing `DISCORD_ALLOWED_ROLES` is mod-only.
- **Who grants it, and when?** Three reasonable options:
  - Auto-grant on join (Discord's Server Settings → Roles → assign on member-join).
  - Auto-grant after the user passes onboarding / accepts community rules (cleanest; filters bots and drive-bys).
  - Manual grant by mods (highest friction; slowest to scale).
- **What's the role called?** "Verified Member", "Community", whatever fits the existing role taxonomy.
- **Rollout sequence**: create the role → backfill existing members → set the env var → deploy. If the env var lands before the role is populated, every existing user gets locked out on day one.

### Observability for tuning the ambiguity threshold

Q5's 1.5× threshold is admittedly empirical. To tune it post-launch we need to see how often it fires and on what queries — which means the bot has to log enough to answer "in the last week, how many `/equipment` invocations got an ambiguity error vs a single result vs zero results, and what were the top 20 ambiguous queries?"

Per `docs/OBSERVABILITY.md`, the existing logging stack should capture per-invocation:

- Command name, query string (truncated/sanitised), Discord user ID hash.
- Outcome: single-match / ambiguous / no-match / error.
- Top-result rank and runner-up rank when ambiguous (lets us see what the threshold is doing in practice).
- End-to-end latency (validates whether the deferred-ack decision was the right call, and flags when we drift towards the 3s deadline).

Without this we'll be tuning blind and won't know whether the bot is helping or annoying people.

## Risks and mitigations

| Risk                                                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare 50-subrequest cap (per CLAUDE.md). The new equipment embed needs equipment row + stats RPC + `player_footage` is player-only so equipment is fine. Player embed needs player row + setups + footage = 3 calls. Well under cap. | Budget: equipment ~2 subrequests, player ~3. Fine. Verify with `wrangler tail` post-deploy.                                                                                                                                  |
| RPC `STABLE` vs `IMMUTABLE` choice — getting it wrong affects query planning.                                                                                                                                                             | `STABLE` is correct (reads tables, doesn't mutate).                                                                                                                                                                          |
| `EXECUTE` grant on the new RPCs must include `anon` since the bot uses anon-role-equivalent reads via the public Supabase client.                                                                                                         | Verify via integration test against the live RLS policy. Pattern: `GRANT EXECUTE ON FUNCTION search_equipment(text) TO anon, authenticated, service_role;`                                                                   |
| Renaming the command export shape (`{ content }` → `{ embeds: [...] }`) breaks the existing `search.test.ts` tests.                                                                                                                       | Plan: rewrite those tests. Currently 8 tests in `__tests__/search.test.ts` assert `.content` — all replaceable with embed-shape assertions.                                                                                  |
| `validateEnv()` regression: forgetting to register `DISCORD_SEARCH_ALLOWED_ROLES` would mean the gate is silently absent on the first deploy.                                                                                             | Add to `REQUIRED_ALWAYS` (optional value but registered) or document fallback explicitly per the table in CLAUDE.md.                                                                                                         |
| Registration script run against wrong env wipes prod commands.                                                                                                                                                                            | Script must read `ENVIRONMENT` from env and require explicit `--confirm prod` flag for prod registration. Print the bot user it's about to mutate before any HTTP call.                                                      |
| Player names with diacritics (Vladimír, Liang Jingkun) — does `to_tsvector('english', ...)` handle them?                                                                                                                                  | Postgres `english` config preserves Latin-1 ish; Asian names mostly survive. Add a couple of diacritic-bearing players to the integration test set.                                                                          |
| Image URL composition — we have `image_key` in the DB but the bot needs a full HTTPS URL. Where does that conversion happen on the site today, and is it Worker-callable?                                                                 | Locate the existing site-side derivation (likely in `app/lib/images/...`) and reuse. If it's React-component-coupled we extract the URL builder to `app/lib/images/cdn.ts` (or similar) so the Discord renderer can call it. |

## Plane card breakdown (proposed)

Subject to user adjustment after they read this doc. Rough shape:

- **Parent: TT-156** _Discord bot for sharing reviews and player info from site to discord_ — repurpose this card as the umbrella, update its title to _Discord bot revamp — `/equipment` + `/player` rebuild_ once children are spawned.
- **Child 1**: SQL RPCs (`search_equipment`, `search_players`) + integration tests against seed DB. Includes `EXPLAIN`-based index-use regression test.
- **Child 2**: Embed renderer modules (`embeds/equipment.ts`, `embeds/player.ts`) + unit tests.
- **Child 3**: Dispatch refactor — drop `/approve`, `/reject`, prefix commands; introduce `checkSearchPermissions` + `DISCORD_SEARCH_ALLOWED_ROLES` env var; rewrite `search.ts` to use the new RPCs and renderers; rewrite `search.test.ts`.
- **Child 4**: `scripts/register-discord-commands.ts` + `validateEnv` updates + `docs/DISCORD.md` updates documenting registration, the new env var, and the dev/prod naming decision (Q1).
- **Child 5**: e2e spec asserting embed shape end-to-end via the Discord click harness.

Sequence: Child 1 first (unblocks 2 and 3). Child 2 and 3 can run in parallel after 1 lands. Child 4 in parallel with 2/3 (independent). Child 5 last.

## What this doc doesn't cover yet

- Concrete spec rendering rules per `equipment.specifications` schema variant — needs cross-reference with `archive/EQUIPMENT-SPECS.md` to enumerate the 7 typed fields and their display formats. Will be settled in Child 2.
- Exact category colours (Q3) and exact image-URL fallback policy (Q4) — minor, settled during implementation.
- The "ambiguity ratio" threshold (Q5) — settled empirically against seed data.
- Whether to delete or keep the legacy submission notification embeds' "search to verify" mental model — orthogonal; left untouched.
