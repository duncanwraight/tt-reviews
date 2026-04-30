# Image storage

All site images live in **Cloudflare R2** under the `IMAGE_BUCKET`
binding. Two key shapes share the bucket:

| Prefix          | Source                                          | Pipeline                                 |
| --------------- | ----------------------------------------------- | ---------------------------------------- |
| `player/...`    | Wikimedia Commons / World Table Tennis (TT-36)  | `scripts/photo-sourcing/{scan,apply}.ts` |
| `equipment/...` | Manufacturer / retailer pages via Brave (TT-48) | `/admin/equipment-photos` queue          |

## Reads

`/api/images/<key>` proxies the R2 object verbatim. For variant
rendering (resize + format conversion), point at
`/cdn-cgi/image/<options>/api/images/<key>` instead — Cloudflare's
edge intercepts the prefix, fetches the source through the same
Worker route, and applies the transformation before caching the
result. No origin code runs for the resize.

Equipment components use `buildEquipmentImageUrl` from
`app/lib/imageUrl.ts`, which expands to that pattern with one of
three variant widths:

| Variant     | Width | Use                                          |
| ----------- | ----- | -------------------------------------------- |
| `thumbnail` | 256   | review queue grid + admin previews + credits |
| `card`      | 512   | `EquipmentCard` listings                     |
| `full`      | 1024  | `/equipment/:slug` detail page header        |

Player components use `buildImageUrl` (no variant — player photos are
already normalised to a single size by the TT-36 pipeline).

## Writes

### Player photos (TT-36)

Driven by manifest review locally, then `npm run sourcing:apply`
normalises with sharp on the developer's machine and writes the
seed-images directory + a SQL-update block. See
`scripts/photo-sourcing/README.md` for the full flow.

### Equipment photos (TT-48)

Live admin flow only — no committed binaries.

1. `POST /admin/equipment-photos-bulk-source` (or per-item
   `POST /admin/equipment/:slug/source-photos`) calls Brave Image
   Search via the resolver in `app/lib/photo-sourcing/brave.server.ts`.
   Both routes are action-only — GETs redirect back to the queue
   rather than 404, so a failed POST that doesn't redirect leaves
   the user on a sensible page.
2. Each surviving candidate's bytes are downloaded and written to R2
   under `equipment/<slug>/cand/<uuid>.<ext>` via the `IMAGE_BUCKET`
   binding.
3. Candidates show up in `/admin/equipment-photos` for human pick.
4. On Pick: `equipment.image_key` is set to the chosen R2 key, the
   losers are deleted from R2 + DB.
5. `npm run images:export-seed` writes `equipment.image_*` columns
   into `supabase/seed.sql`'s PHOTO-SOURCING-CREDITS block so a
   `supabase db reset` survives the change.

## Pricing

R2 is essentially free at this scale: $0.015/GB-month storage, no
egress charges. The full equipment set (~290 images at ~50 KB each)
is ~15 MB → fractions of a cent.

Cloudflare Image Resizing transformations: each unique resize is
free under the platform's first-tier limit (5,000/month on Pro+
plans) and $0.50 per 1,000 thereafter. For a one-time backfill of
~290 equipment × 3 variants = 870 transforms — well within free
tier on first run, and cached at the edge for 30 days after.

## Setup

R2 + the `IMAGE_BUCKET` binding are already configured from TT-36 and
shared with the player flow. Two pieces of zone- or account-level
configuration are required for equipment photos:

1. **`BRAVE_SEARCH_API_KEY`** — set in `.dev.vars` for local dev and
   via `wrangler secret put BRAVE_SEARCH_API_KEY` for prod. The
   bulk-source action returns 500 without it.
2. **Cloudflare Image Transformations** — must be **explicitly
   enabled** on the zone (CF dashboard → Speed → Optimization →
   Image Transformations → "This zone only"). It's a paid feature
   (see Pricing above); without it, `/cdn-cgi/image/...` URLs 404 and
   the queue tiles show "image unavailable" via the
   `CandidateImage` fallback. The site still functions for picks
   and rejects but no thumbnails render. With it enabled, all
   variant URLs work site-wide.
3. **Photo-sourcing queue consumer attach (TT-91)** — `wrangler.toml`'s
   `[[queues.consumers]]` block declares the consumer config, but
   `wrangler versions upload` (the gradual-deployment path the CI uses)
   does **not** apply it. The producer-side binding registers as part
   of the version upload; the consumer side requires
   `wrangler queues consumer worker add`. CI now handles this in
   `.github/workflows/main.yml` ("Ensure queue consumer is attached"),
   guarded by an idempotency check on `wrangler queues info`. The
   manual command below is only needed if you ever reset the queue
   or want to bootstrap a `-dev` queue under `[env.dev]`:

   ```sh
   npx wrangler queues consumer worker add equipment-photo-source app \
     --batch-size 1 --message-retries 5 --batch-timeout 5 \
     --max-concurrency 1 --dead-letter-queue equipment-photo-source-dlq
   ```

   If batch-size / retries / concurrency / DLQ in `wrangler.toml`
   change, the CI step won't re-apply (the consumer is already
   attached, so it's skipped). Run
   `wrangler queues consumer worker remove equipment-photo-source app`
   once before the next deploy and CI will re-add with the new config.

   Symptom if the consumer ever detaches:
   `npx wrangler queues info equipment-photo-source` shows
   `Number of Consumers: 0`, the admin "Enqueue all unsourced" action
   fills the backlog, and nothing drains.

If you migrate the zone or the rendering plan changes, the fallback
in `CandidateImage` (try transformed URL → swap to raw on error →
show "image unavailable" if both fail) means we degrade gracefully
rather than breaking the queue.
