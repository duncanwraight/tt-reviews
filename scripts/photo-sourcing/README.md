# Photo sourcing pipeline (TT-36)

Discovers player headshots from World Table Tennis (preferred for
consistency) and Wikimedia Commons (fallback), normalises them, and
writes a reviewable manifest plus SQL UPDATE statements that the local
and production stacks can replay.

## Scripts

| Script             | Command                                                   | Purpose                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scan.ts`          | `npm run sourcing:scan`                                   | Walks players in the local DB, queries Wikidata + Commons, writes `manifest.json`. Idempotent.                                                                                                                                                                                      |
| `apply.ts`         | `npm run sourcing:apply`                                  | Downloads each `chosen` image, normalises (webp ≤1024px, EXIF stripped) into `supabase/seed-images/<kind>/<slug>.webp`, emits `supabase/seed-images/credits.sql`.                                                                                                                   |
| `load-fixtures.sh` | `bash scripts/photo-sourcing/load-fixtures.sh [--remote]` | Bulk-uploads `seed-images/**/*.webp` into the `IMAGE_BUCKET` binding (local Miniflare by default; `--remote` for prod R2).                                                                                                                                                          |
| `seed-local.sh`    | `npm run sourcing:seed-local`                             | Convenience wrapper: psql-applies `credits.sql` to local DB and runs `load-fixtures.sh`. Useful when `.wrangler/state` was wiped — `db reset` alone restores DB rows automatically (see below).                                                                                     |
| `seed-prod.sh`     | `SUPABASE_DB_URL=… npm run sourcing:seed-prod`            | Production rollout: uploads webps to prod R2 (via `wrangler --remote`) and applies `credits.sql` to the prod Postgres. Confirms before running; idempotent. See "Production deployment" below.                                                                                      |
| `export-seed.ts`   | `npm run images:export-seed`                              | Roundtrip current `players.image_*` + `equipment.image_*` from local DB into the `PHOTO-SOURCING-CREDITS` block of `supabase/seed.sql`. Lets equipment images sourced via the admin portal (TT-48) survive `supabase db reset`. Idempotent — no diff if DB state matches the block. |

## Sources and auto-pick order

For each player the scanner records every candidate it finds:

1. WTT headshot (`source: "wtt-headshot"`) when the seed name resolves
   in the WTT roster (~800 ranked players).
2. Wikidata `P18` image on Commons (`source: "wikidata-p18"`) when the
   player has a Wikidata Q-item with an image.
3. Wikipedia lead image on Commons (`source: "enwiki-pageimage"`) when
   the player has an enwiki article with a `pageimage` and we don't
   already have it via P18.

Auto-pick prefers **WTT** so the site presents a consistent set of
official headshots. Falls back to a free-licensed Commons candidate
only when WTT has no match (e.g. retired or non-ranked players).

## Manifest

`manifest.json` is committed and is the **single review artifact**.
After `scan.ts`, every entry is one of:

- `unresolved: true` — no source produced a candidate. Reviewer either
  accepts the gap, sources a candidate manually, or files a follow-up.
- `chosen: <filename>` (auto-picked) — the scanner's pick. Reviewer
  can override by editing `chosen` and/or `notes`; re-running `scan`
  preserves both fields. WTT candidates use the synthetic filename
  `wtt:<ittfid>` so the override format stays the same.
- `chosen: null` after review — explicit reviewer skip. Use `notes`
  to record why (signature scan, group photo, low quality, etc.).

## Workflow

```bash
# 1. Discover candidates (rate-limited; ~1 req/s; takes ~3 min for ~50 players).
npm run sourcing:scan

# 2. Review scripts/photo-sourcing/manifest.json. Override `chosen` /
#    `notes` for any entry that needs human judgment.

# 3. Download + normalise + write SQL.
npm run sourcing:apply

# 4. Apply locally. (One-off — see "db reset persistence" below.)
npm run sourcing:seed-local

# 5. (Production) Apply to prod after the deploy lands. See
#    "Production deployment" below for full details.
SUPABASE_DB_URL=postgresql://... npm run sourcing:seed-prod
```

## Licensing

- **Wikimedia Commons**: only candidates whose license matches
  `isFreeLicense` (CC0, CC BY, CC BY-SA, public domain) are accepted.
  Creator name, creator profile link, license short name, and license
  URL are all captured for display.
- **WTT headshots**: no explicit license. We store creator as "World
  Table Tennis" and source-link to the player's WTT profile page;
  license fields are NULL. The `/credits` page documents the takedown
  contact; objections are honoured promptly.

The `/credits` route renders all of this on a public page; player
detail pages show a small inline `Photo: …` caption. Both surfaces
are linked from the global footer.

If a source file is later edited or deleted upstream, re-running
`scan` flags any stale `chosen` and clears it (`mergeEntry` behaviour).
Re-run `apply` afterwards.

## db reset persistence

`apply.ts` splices the same UPDATE statements it writes to
`credits.sql` into `supabase/seed.sql` between
`-- BEGIN PHOTO-SOURCING-CREDITS` / `-- END PHOTO-SOURCING-CREDITS`
markers. The supabase CLI seed runner doesn't support psql `\ir`, so
the credits have to be inlined to survive `supabase db reset`.

After `db reset`: schema is re-created, players are re-inserted, then
the spliced block runs and restores image_key / image_etag /
attribution on every row. Local R2 contents live under `.wrangler/state/`
and aren't touched by `db reset`, so the previously loaded webp blobs
continue to serve. Net effect: images persist across `db reset` with
no manual seed step.

If `.wrangler/state/` is wiped (e.g. you blow away the dev environment
to start clean), run `bash scripts/photo-sourcing/load-fixtures.sh` —
or `npm run sourcing:seed-local`, which does that plus a redundant
psql apply — to repopulate the local R2 bucket.

When a re-run of `apply.ts` produces new `image_etag` values for
existing slugs, the rendered image URL gains a new `?v=…` query
suffix and the browser/CDN refetch fresh bytes automatically.

## Production deployment

Two pieces ship to prod:

1. **Schema migration** (`add_image_attribution_columns.sql`) —
   auto-applied by the `Deploy migrations` step in
   `.github/workflows/main.yml` on push to `main`. Adds the new
   columns to the prod DB without intervention.
2. **R2 webps + credits.sql data backfill** — run manually with
   `seed-prod.sh` after the deploy lands.

`seed-prod.sh` reads `SUPABASE_DB_URL` from the environment (the same
secret the deploy workflow uses for `supabase db push`), confirms with
the operator before doing anything, then:

- uploads every `supabase/seed-images/**/*.webp` to the prod
  `tt-reviews-prod` R2 bucket via `wrangler r2 object put --remote`;
- pipes `supabase/seed-images/credits.sql` into psql against the prod
  Postgres with `ON_ERROR_STOP=1`.

Both steps are idempotent — re-running after a photo rotation just
overwrites the existing R2 objects and re-issues the same UPDATEs
(no-op when content hasn't changed). Pass `--yes` to skip the
confirmation prompt for unattended runs.

```bash
# After `git push origin main` and the deploy workflow goes green:
SUPABASE_DB_URL='postgresql://...' npm run sourcing:seed-prod
```

If you find yourself rotating photos often enough that this manual
step becomes friction, swap the DB-apply half for a timestamped data
migration emitted by `apply.ts` (a small addition that lets the
deploy workflow handle backfills automatically). The R2 upload would
remain manual unless you want to grant the Actions runner Cloudflare
write tokens.

## User-Agent and rate limits

All API and image requests identify as
`tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)`.

- Wikimedia: paced at ≥1s/request per the User-Agent policy, with
  exponential back-off on 429/5xx and `Retry-After` honoured.
- WTT: a single roster fetch per scan run, cached in memory. Image
  downloads use the same back-off strategy.
