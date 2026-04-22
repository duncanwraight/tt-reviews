# Observability

How to see what's happening in production — written for Claude Code and humans. Referenced from `CLAUDE.md`.

## TL;DR

- Live-tail everything: `npm run logs`
- Live-tail errors only: `npm run logs:errors`
- Uncaught errors have a stable tag (`source:"worker-entry"`) so they can be filtered, see [Stable error tags](#stable-error-tags) below.

No paid service (Sentry, Datadog, etc.) is wired in. We rely on Cloudflare Workers Observability (already enabled in `wrangler.toml`), `wrangler tail`, and the Cloudflare Logs API. All free, all Claude-Code-compatible.

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
