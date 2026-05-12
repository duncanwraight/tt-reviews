# MCP — Model Context Protocol servers in this repo

MCP servers give Claude Code sessions running in this repo direct, tool-call-style access to external systems without leaving the editor. This doc covers the SEO-data servers wired up under TT-192. Plugin-managed servers (Supabase, Vercel, etc.) are configured separately and aren't covered here.

## search-console — GSC + Bing Webmaster (TT-192)

[`saurabhsharma2u/search-console-mcp`](https://github.com/saurabhsharma2u/search-console-mcp) ([npm](https://www.npmjs.com/package/search-console-mcp)). Single stdio server exposing Google Search Console, Bing Webmaster Tools, and Google Analytics 4 (GA4 is bundled but currently unconfigured — see below).

### Why this server over separate GSC + Bing servers

The TT-192 ticket offered two paths: separate GSC and Bing servers (`ahonn/mcp-server-gsc` + `isiahw1/mcp-server-bing-webmaster`, ~45 Bing tools) or a combined server (this one, ~13 Bing tools). We picked combined because:

- The 32 extra Bing tools in the separate server are mostly admin surface (geo settings, deep-link blocks, blocked-URL management) — not the analytics/crawl/sitemap tools that actually answer "is this page indexed?" / "any crawl errors this week?".
- This server ships opinion tools (`seo_low_hanging_fruit`, `seo_striking_distance`, `seo_cannibalization`, `seo_lost_queries`, `bing_opportunity_finder`) that map directly to the use cases in the ticket — less prompt-engineering on Claude's side.
- One config entry vs two; one server to debug.
- OAuth via the package-bundled client avoids the Google Cloud Console service-account setup that `ahonn/mcp-server-gsc` requires.

If a specialised Bing admin tool is needed later, `isiahw1/mcp-server-bing-webmaster` can be added alongside — they don't conflict.

### Install (already done; here for re-bootstrap)

```bash
# 1. Run the package's interactive setup. Opens a browser for Google OAuth
#    (against the GSC property), prompts for the Bing Webmaster API key,
#    stores both in the Linux Secret Service (libsecret / gnome-keyring).
#    Falls back to ~/.search-console-mcp-config.enc (AES-256-GCM) if no
#    keyring is available.
npx search-console-mcp setup

# 2. Register the stdio server with Claude Code (local scope — visible only
#    in this project's working tree). No env vars on the entry: the server
#    reads creds from the keyring at runtime.
claude mcp add search-console -- npx -y search-console-mcp
```

The server is registered under `local` scope, meaning the entry lives in `~/.claude.json` under the `tt-reviews` project key. Not committed. Use `claude mcp list` to confirm health (`✓ Connected` means stdio handshake succeeded).

### Where credentials live

| Credential             | Storage                                                                            | Renewal                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GSC OAuth token        | Linux Secret Service (gnome-keyring). Fallback: `~/.search-console-mcp-config.enc` | OAuth refresh is automatic. To re-auth from scratch (revoked grant, new property): `npx search-console-mcp setup` again.                                                            |
| Bing Webmaster API key | Same keyring/fallback file                                                         | Rotate via [Bing Webmaster Tools](https://www.bing.com/webmasters) → Settings → API Access → regenerate key, then re-run `npx search-console-mcp setup` to update the stored value. |

Neither credential is in `~/.claude.json`; only the MCP entry's command is.

### Tool families

Tool names use the prefix shown. Exact arg shapes are discoverable at call time.

**Google Search Console** (account auto-resolved from the OAuth identity)

- Site management: `sites_list`, `sites_add`, `sites_delete`
- Sitemap status: `sitemaps_list`, `sitemaps_submit`
- URL inspection / page health: `inspection_inspect`, `pagespeed_analyze`, `schema_validate`, `sites_health_check`
- SEO opportunity tools: `seo_low_hanging_fruit`, `seo_striking_distance`, `seo_cannibalization`, `seo_lost_queries`
- Raw search analytics: `analytics_query` (clicks/impressions/CTR/position by query, page, country, device, search-appearance, date) — supports regex filters via `includingRegex` / `excludingRegex`
- Site-relative shortcuts: `analytics_top_pages`, `analytics_top_queries`, `analytics_by_country`, `analytics_time_series`, `analytics_compare_periods`, `analytics_organic_landing_pages`

**Bing Webmaster Tools**

- Sites: `bing_sites_list`, `bing_sitemaps_list`, `bing_sitemaps_submit`
- Performance: `bing_analytics_query`, `bing_analytics_time_series`, `bing_analytics_detect_anomalies`
- Crawl health: `bing_crawl_issues`, `bing_url_info`
- Indexing: `bing_index_now` (submit URL for re-crawl)
- SEO insights: `bing_opportunity_finder`, `bing_seo_recommendations`, `bing_seo_lost_queries`, `bing_brand_analysis`

**Google Analytics 4** — not configured. The server ships GA4 tools (`analytics_query`, `analytics_trends`, etc.) but they're inert without GA4 credentials. TT-192 deferred GA4 wiring because `docs/SEO.md` doesn't currently lean on GA4 metrics. To enable later: `npx search-console-mcp setup --engine=ga4`.

### Site identifiers

The site is verified under two slightly different identifiers — pass these as `siteUrl` to the GSC and Bing tools respectively:

- **GSC**: `sc-domain:tabletennis.reviews` (domain property — covers all subdomains and protocols).
- **Bing**: `https://tabletennis.reviews/` (URL-prefix style; trailing slash matters).

GSC's `analytics_query` returns page URLs as fully qualified `https://tabletennis.reviews/<path>` even though the property is `sc-domain:`. Filter on `page` with `contains` (or `includingRegex`) when scoping to a specific route.

### Verification probes

The TT-192 acceptance criteria. Both run cleanly against the registered server:

- "How is `/equipment/dhs-hurricane-3` doing in Google last 28 days?" — via `analytics_query` with a page-contains filter.
- "Any Bing crawl errors on tabletennis.reviews this week?" — via `bing_crawl_issues`.

After registering a new server, Claude Code must be restarted before the tools are discovered — they are enumerated at session start, not on demand. `claude --continue` from the same project directory does pick the new tools up.

### Troubleshooting

- `claude mcp list` shows `! Needs authentication` for `search-console`: the OAuth token in the keyring is missing or revoked. Re-run `npx search-console-mcp setup`.
- Tools fire but return empty/permission errors: the Google account used for OAuth isn't a verified user/owner on the GSC property. Add it in [Search Console](https://search.google.com/search-console) → Settings → Users and permissions, or re-run setup with the right account.
- Bing tools fail with auth errors: the API key may have been rotated in BWT. Re-run setup to capture the new key.
- `npx search-console-mcp` package update: stdio servers re-fetch on every Claude Code spawn (the `-y` flag in the command), so `npm install -g` isn't required. Pin a version by replacing `search-console-mcp` with `search-console-mcp@1.13.5` in the `claude mcp add` command if upstream churn is a problem.

### Cost

Free. Google Search Console API and Bing Webmaster Tools API both have generous free quotas that this single-developer use case won't approach.

## Out of scope

- **Automating index-submission on every deploy.** `bing_index_now` and the GSC URL-inspection tools exist, but wiring them into the deploy workflow is a separate ticket once the manual tooling has proved itself useful.
- **GA4.** Deferred — see above.
- **Cross-linking MCP tool output into PR reviews.** Manual for now; if it becomes a recurring pattern, capture as a new ticket.
