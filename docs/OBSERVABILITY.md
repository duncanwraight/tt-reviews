# Observability

How to see what's happening in production — written for Claude Code and humans. Referenced from `CLAUDE.md`.

## TL;DR

- Live-tail everything: `npm run logs`
- Live-tail errors only: `npm run logs:errors`
- Uncaught errors have a stable tag (`source:"worker-entry"`) so they can be filtered, see [Stable error tags](#stable-error-tags) below.
- Every `Logger.error` in prod also fires a Discord embed into `#alerts` — see [Discord error alerts](#discord-error-alerts) below.
- Cron triggers are **currently disabled** — see [Scheduled jobs (cron triggers)](#scheduled-jobs-cron-triggers) below.

No paid service (Sentry, Datadog, etc.) is wired in. We rely on Cloudflare Workers Observability (already enabled in `wrangler.toml`), `wrangler tail`, the Cloudflare Logs API, and a Discord webhook for active paging. All free, all Claude-Code-compatible.

## Authentication

`wrangler tail` and the Cloudflare Logs API need a Cloudflare API token with Workers Scripts:Read access. The same token the CI workflow uses is fine. Set one of:

- `CLOUDFLARE_API_TOKEN` in the environment, or
- `npx wrangler login` once (stores auth locally).

Without auth, `wrangler tail` will prompt.

## Live tailing with wrangler

### Pretty stream (humans)

```sh
npm run logs
# equivalent to: npx wrangler tail --format=pretty
```

### JSON stream (programmatic)

```sh
npm run logs:errors
# equivalent to: npx wrangler tail --format=json --status error
```

### Useful flags

- `--status error` — only events with non-2xx / uncaught exceptions.
- `--method POST` — only POST requests.
- `--search "<string>"` — substring match against event body.
- `--ip <addr>` — requests from a specific client.
- `--sampling-rate 0.1` — sample 10% of events (for noisy periods).

### One-shot capture (for Claude)

Live tail is a stream. To collect for a bounded window and inspect, background it and time-bound:

```sh
# Background the tail for 60s, writing JSON to /tmp/logs.json
timeout 60 npx wrangler tail --format=json --status error > /tmp/logs.json || true

# Inspect
jq -r '.exceptions[]?.message' /tmp/logs.json | sort -u
jq 'select(.event.request.url | contains("/api/"))' /tmp/logs.json
```

## Stable error tags

`workers/app.ts` wraps the top-level request handler in a try/catch. Any uncaught error is logged as structured JSON:

```json
{
  "level": "error",
  "source": "worker-entry",
  "message": "...",
  "stack": "...",
  "url": "https://tabletennis.reviews/some/path",
  "method": "GET",
  "timestamp": "2026-04-22T..."
}
```

Filter for just these errors:

```sh
npx wrangler tail --format=json --search "source:worker-entry"
```

The rest of the app's logging goes through `app/lib/logger.server.ts`, which emits structured JSON with an `operation` field. Both are visible to `wrangler tail`.

## Historical errors (Cloudflare dashboard / API)

Workers Observability is enabled in `wrangler.toml`:

```toml
[observability]
enabled = true
head_sampling_rate = 1
```

This retains logs for ~3 days in the Cloudflare dashboard (Workers → `<worker>` → Logs). The retention is also queryable via the GraphQL API:

```sh
curl -s -X POST https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "query": "..." }'
```

For most debugging, `wrangler tail` on a freshly reproducible issue beats the API. Reach for the API when the issue happened hours ago and the dashboard is too slow.

## Reading recent deploys

```sh
npx wrangler deployments list
```

Shows the version IDs, authors, and messages. Useful when a rollback is in play and you want to know which version is live.

## When to use what

| Question                                 | Tool                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| "What is the error RIGHT NOW?"           | `npm run logs:errors`                                                        |
| "Is the new deploy healthy?"             | `npm run logs` and watch for 2-3 min                                         |
| "What errors happened overnight?"        | Cloudflare dashboard → Workers → Logs                                        |
| "Which version is live?"                 | `npx wrangler deployments list`                                              |
| "What's the stack trace for a known 5xx" | `wrangler tail --format=json --search "source:worker-entry"` during a repro. |

## Discord error alerts

Every `Logger.error` call fans out to a Discord embed posted into `#alerts` in the project Discord. This is the primary "something is broken" page — without it, you'd only know about a prod bug if you happened to be tailing logs or a user complained.

### How it works

`workers/app.ts` calls `installAlerter(env, ctx)` at the top of `fetch()` and `scheduled()`. The alerter is a module singleton (`app/lib/alerts/discord-alerter.server.ts`) with per-isolate dedup state. `Logger.error` then drains `alerter.notify(...)` through `ctx.waitUntil` so the POST survives the request lifecycle without blocking the response.

The alert is short by design — title (the error message), env, source, route, request ID, error name+message. No stack traces. If you need stacks, `wrangler tail` is one click away from the alert.

### Gating

The alerter is silent unless **both** are true:

- `DISCORD_ALERTS_CHANNEL_ID` is set and not a placeholder
- `DISCORD_BOT_TOKEN` is set, real-looking (≥50 chars), and not a placeholder

CI e2e injects real dev-app credentials from `CI_DISCORD_*` GitHub secrets into the workflow's `.dev.vars`, so the alerts spec polls the test channel directly via the bot REST API. The bot needs **View Channel** + **Read Message History** in that channel for the GET — not just Send/Embed.

In normal local dev the channel ID is unset → no-op. Set `DISCORD_ALERTS_CHANNEL_ID` and `DISCORD_BOT_TOKEN` in your `.dev.vars` if you want to exercise the e2e spec or eyeball the embed in your dev guild.

### Dedup

In-memory `Map<message, lastFiredAt>` per isolate, 5-minute window. Cross-isolate dupes during an active incident are acceptable (and useful — multiple isolates firing the same error tells you something is widespread). Dedup is keyed by error message, so distinct errors during a cascade still all fire.

### Setup

Prod requires three things wired up:

1. `wrangler secret put DISCORD_ALERTS_CHANNEL_ID` — the prod channel ID. Set as a secret rather than a `[vars]` entry because top-level `[vars]` wins over `.dev.vars` under `react-router dev`, so listing it there would poison local dev.
2. `wrangler secret put DISCORD_BOT_TOKEN` — already required for the moderation bot. Reused by the alerter.
3. The bot must be a member of the alerts channel with **Send Messages** + **Embed Links** permissions in that channel.

`validateEnv` in `app/lib/env.server.ts` will 503 prod requests if `DISCORD_ALERTS_CHANNEL_ID` is missing, so a forgotten secret surfaces on first request after deploy rather than silently failing.

## Scheduled jobs (cron triggers)

> **Currently disabled (2026-09-09).** Both jobs were erroring repeatedly in
> prod, so `[triggers].crons` in `wrangler.toml` is set to `[]` and no
> scheduled invocations are running. The `scheduled()` handler in
> `workers/app.ts` is untouched — re-enable by restoring the commented-out
> `crons` line above `[triggers]` and deploying. Cron Trigger changes take up
> to ~15 minutes to propagate.

The Worker declares its cron triggers in `wrangler.toml` under `[triggers]`;
each cron string maps to one `case` in the `scheduled()` switch in
`workers/app.ts`. An empty `crons` array removes all triggers on the next
deploy — omitting the key entirely would instead leave the currently deployed
triggers in place, which is why the disabled state is an explicit `[]`.

| Cron          | Job                                                      |
| ------------- | -------------------------------------------------------- |
| `0 3 * * *`   | Daily recompute of `equipment_similar` (TT-70).          |
| `0 */6 * * *` | Spec-sourcing enqueue onto `SPEC_SOURCE_QUEUE` (TT-149). |

Cron failures log through the same alerter as the request path
(`installAlerter` is called at the top of `scheduled()`), so they reach the
Discord alerts channel. Log tags to filter on:

```sh
npx wrangler tail --format=json --search "source:scheduled"
```

- `scheduled.env-validation-failed` — `validateEnv` rejected the isolate's env;
  the job returns without running.
- `scheduled.<cron>.failed` — the job threw. The cron string is in the tag.
- `scheduled.unknown-cron` — a cron fired with no matching `case`, i.e.
  `wrangler.toml` and `workers/app.ts` have drifted.

Trigger a job locally (requires `wrangler dev`, not `react-router dev`):

```sh
curl 'http://tt-reviews.local:8787/__scheduled?cron=0+3+*+*+*'
```

Note that the queue consumers (`equipment-photo-source`, `spec-source-queue`,
`player-import-queue`) are event-driven, not cron-driven, and are unaffected by
the triggers being disabled — but with the spec-sourcing enqueue off, nothing
new lands on `SPEC_SOURCE_QUEUE` automatically.

## Operational scripts

### `scripts/prod-wipe-and-reseed.sh` — full prod data refresh

One-shot orchestrator that detaches the three queue consumers, purges all six queues + DLQs, runs `supabase db reset --linked --yes` against the linked prod project, re-attaches consumers with CI's exact params, and (opt-in) walks R2 for orphan objects. Designed for the TT-191 prod-seed refresh but reusable any time a clean prod re-bootstrap is needed.

```sh
scripts/prod-wipe-and-reseed.sh --dry-run             # print what would run, no side effects
scripts/prod-wipe-and-reseed.sh                       # interactive; gates on typing "WIPE PROD"
scripts/prod-wipe-and-reseed.sh --cleanup-r2          # also delete R2 objects unreferenced post-reseed
scripts/prod-wipe-and-reseed.sh --skip-db-reset       # queue ops only
scripts/prod-wipe-and-reseed.sh -h                    # full help (extracted from the script header)
```

Read the script's header before first use — it lists required env vars (Supabase service-role key, R2 S3 credentials when `--cleanup-r2` is set), the post-wipe manual checklist (re-grant Discord moderators, spot-check pages, kick crons), and the systems it deliberately does NOT touch (`PROVIDER_QUOTA` KV, Cloudflare Image Resizing cache, `auth.users`).
