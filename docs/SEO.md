# SEO — single source of truth

This doc is the contract every user-facing route on this site has to satisfy. If a rule lives here, the route follows it; if a rule belongs here and isn't yet, fix it here first and then in code. CLAUDE.md gates user-facing route work on reading this doc, mirroring the `docs/CODING-STANDARDS.md` gate.

This is the technical SEO standard. Audience research, content strategy, and keyword targeting are out of scope — they're product calls, not engineering rules.

The audit underlying TT-134 found the structured-data foundation strong (`app/lib/schema.ts` + `app/components/seo/StructuredData.tsx` ship Product/AggregateRating/Review/BreadcrumbList/Organization/Person correctly) but several systemic gaps. Those gaps had one card each (TT-135 → TT-143); all are now shipped. Where a TT-card is named below, it's a historical reference to the change that introduced the rule, not a marker for pending work.

---

## URL structure

These are the actual route patterns shipped today (`app/routes/`). The old SEO doc claimed `/equipment/[category]/[model-slug]`; that has never been our URL shape and never will be.

| Surface                                             | Pattern                                                                   | Notes                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Home                                                | `/`                                                                       | Single page; not parameterised.                                                                          |
| Equipment listing                                   | `/equipment`                                                              | Filters live in querystring: `?category=`, `?subcategory=`, `?manufacturer=`. No nested category routes. |
| Equipment detail                                    | `/equipment/:slug`                                                        | Slug is globally unique within the `equipment` table. Category is **not** in the path.                   |
| Equipment compare landing                           | `/equipment/compare`                                                      | Already `noindex` — keep it that way; it's a picker, not content.                                        |
| Equipment compare                                   | `/equipment/compare/:slugs`                                               | `:slugs` shape is `slug1-vs-slug2`. Both slugs must resolve to equipment rows.                           |
| Players listing                                     | `/players`                                                                | Active players only.                                                                                     |
| Player detail                                       | `/players/:slug`                                                          | Slug is globally unique within the `players` table.                                                      |
| Search                                              | `/search?q=...`                                                           | Thin SERPs are problematic — see indexability rules below.                                               |
| Submissions                                         | `/submissions/:type/submit`                                               | Authed-only entry; never indexable.                                                                      |
| Auth                                                | `/login`, `/logout`, `/reset-password`, `/auth/callback`, `/auth/confirm` | Never indexable.                                                                                         |
| Admin                                               | `/admin/*`                                                                | Admin-only. Never indexable.                                                                             |
| Profile                                             | `/profile`                                                                | Authed-only. Never indexable.                                                                            |
| Internal                                            | `/e2e-health`, `/e2e-trigger-error`, `/api/*`                             | Never indexable; kept out of sitemap.                                                                    |
| Static                                              | `/credits`                                                                | Indexable.                                                                                               |
| `/sitemap.xml`, `/sitemap-index.xml`, `/robots.txt` | Generated routes — not regular content.                                   |

### Slug rules

- Slugs are stable identifiers. Treat a rename as a redirect-source: every old slug we've ever published keeps 301-forwarding to the current canonical URL via the `slug_redirects` table (see "Slug-rename redirect history" below).
- Slug shape: lowercase, ASCII, dash-separated, no diacritics, no trailing dashes. The submission flow already enforces this; do not relax it.
- Two equipment items cannot share a slug. The DB enforces uniqueness; do not bypass it for "synonym" SKUs — file them as separate equipment rows or as variants on the same row.

### Filters, sort, pagination

The canonical rule for listing pages is **the same on every listing**, no per-route exceptions:

- Canonical is `${siteUrl}${pathname}` plus an allow-listed, deterministically-ordered subset of the querystring. Anything not on the allow-list (utm tags, fbclid, gclid, ad-network junk, mistyped params) is dropped from the canonical URL. Two equivalent listings — same filters in different orders, with or without tracking params — produce a byte-identical canonical.
- Use `buildCanonicalUrl(siteUrl, pathname, search, ALLOWLIST)` from `app/lib/seo.ts`. The allow-list is declared as a `const` array at the top of the route file so it's discoverable. Keys appear in canonical URLs in allow-list order, not user-input order.
- Per-listing allow-lists currently in effect:
  - `/equipment`: `["category", "subcategory", "manufacturer", "sort", "page"]`
  - `/players`: `["country", "style", "gender", "active", "sort", "order", "page"]`
  - `/search`: `["q"]`
- Detail pages pass an empty allow-list — they self-canonical to `${siteUrl}${pathname}`, no querystring.
- Pagination uses `?page=N`. Page 1 omits the param (which then naturally drops out of the canonical). `rel="prev"`/`rel="next"` are no longer used by Google — don't add them; rely on the canonical strategy above.
- Adding a new filter to a listing means adding it to the allow-list. Adding a tracking-style param to a listing means **not** adding it — the param works for analytics but never reaches a canonical URL.

---

## Per-route `meta()` checklist

React Router v7 `meta()` exports are the only source of route-level meta. Do **not** introduce `react-helmet` or any other head-management library.

### Required on every indexable route

Use the helpers in `app/lib/seo.ts` rather than rolling these by hand. `getSiteUrl(matches)` reads the root loader data; `buildCanonicalUrl(siteUrl, pathname, search, allowList)` produces the canonical URL with deterministic param ordering and tracking-junk stripping.

```ts
import { buildCanonicalUrl, getSiteUrl } from "~/lib/seo";

// Listings declare their allow-list as a const at module scope so
// it's discoverable. Detail pages omit the const and pass [] (or
// empty search) — they self-canonical to the bare path.
const EQUIPMENT_LISTING_PARAMS = [
  "category",
  "subcategory",
  "manufacturer",
  "sort",
  "page",
] as const;

export function meta({ data, location, matches }: Route.MetaArgs) {
  const canonical = buildCanonicalUrl(
    getSiteUrl(matches),
    location.pathname,
    location.search,
    EQUIPMENT_LISTING_PARAMS // detail pages: pass [] (or omit the arg)
  );

  return [
    { title: /* ≤ 60 chars, unique per page */ },
    { name: "description", content: /* ≤ 155 chars, unique per page */ },
    { tagName: "link", rel: "canonical", href: canonical },

    { property: "og:title", content: /* may differ from <title> for social */ },
    { property: "og:description", content: /* same as description, or shorter */ },
    { property: "og:type", content: /* "website" | "article" | "product" | "profile" */ },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: "TT Reviews" },

    // og:image + twitter:image come from `ogImageMeta(...)` — spread
    // its return value rather than rolling these by hand. The helper
    // emits og:image/og:image:width/og:image:height/twitter:card/
    // twitter:image/twitter:title/twitter:description in one shot.
    ...ogImageMeta({ siteUrl, title: ogTitle, description, imageUrl }),
  ];
}
```

Rules:

- **`title`** ≤ 60 chars. Format: `<page-specific>… | TT Reviews`. Brand on the right; never repeat the brand mid-title.
- **`description`** ≤ 155 chars. No keyword stuffing. One sentence describing what's on the page.
- **`canonical`** is **absolute** and **env-driven** (`SITE_URL`). Hardcoding hosts is a regression — `validateEnv` already requires `SITE_URL` (`app/lib/env.server.ts`). `getSiteUrl(matches)` returns the prod fallback only when the root loader itself errored, and validateEnv would have 503'd that case before the loader ran.
- **`og:url`** matches `canonical`.
- **`og:image`** + **`twitter:image`** — 1200×630 absolute URLs; every indexable route declares one via `ogImageMeta(...)` from `app/lib/seo.ts`. Detail pages point at the dynamic generator (`/og/equipment/<slug>.png`, `/og/players/<slug>.png`, `/og/compare/<slugs>.png`); listings and static pages point at the cached fallback (`/og/default.png`, `/og/equipment.png`, `/og/players.png`). See "OG image" below for the rendering pipeline.
- **`keywords`** is dead — Google ignores it. Existing `meta()` exports keep populating it; they're harmless but new routes don't need it.
- Meta values must be derived from loader data, never from `document.location` or `window` — `meta()` runs on the server.

### Indexability — the `noindex` matrix

`noindex` is a `<meta name="robots">` tag, **not** a robots.txt rule. robots.txt stops a crawler fetching the page; it does not stop Google indexing the URL when it's discovered via inbound links. Anything in this table needs the meta tag whether or not robots.txt also blocks it.

| Route                                                                                                        | `robots` meta           | Why                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| `/`, `/equipment`, `/equipment/:slug`, `/equipment/compare/:slugs`, `/players`, `/players/:slug`, `/credits` | `index, follow`         | Primary content — the reason the site exists.                                  |
| `/equipment/compare` (landing without slugs)                                                                 | `noindex, follow`       | Picker UI, no content.                                                         |
| `/search`                                                                                                    | conditional — see below | Productive multi-term SERPs are indexable; thin ones aren't.                   |
| `/admin/*`                                                                                                   | `noindex, nofollow`     | Admin tooling — never indexable. Also gets `X-Robots-Tag` at the Worker entry. |
| `/login`, `/logout`, `/reset-password`, `/auth/*`, `/profile`, `/submissions/*`                              | `noindex, nofollow`     | Authed-only or bounce pages.                                                   |
| `/e2e-health`, `/e2e-trigger-error`                                                                          | `noindex, nofollow`     | Test fixtures — would be `404` in prod ideally.                                |
| `/api/*`                                                                                                     | n/a                     | Returns JSON — not HTML. Remains `Disallow:` in robots.txt.                    |
| `/$.tsx` (404 catch-all)                                                                                     | `noindex, follow`       | Don't fingerprint 404s.                                                        |

The pattern in code:

```ts
return [
  // ...title, description, etc...
  { name: "robots", content: "noindex, nofollow" },
];
```

When in doubt: if a logged-out user shouldn't see this page, it's `noindex`.

### `/search` — thin-SERP rule

`/search` is the only route with conditional indexability. The decision lives in `isThinSerp(query, resultCount)` inside `app/routes/search.tsx`:

- **Empty query** (`/search` or `/search?q=`) — `noindex, follow`. No content to index; the bare path is the canonical landing for a logged-in feature, not for SEO.
- **Single-token query** (`/search?q=tenergy`) — `noindex, follow`. Single tokens are typically a brand or category that already has its own canonical landing; an indexed SERP for them creates duplication.
- **Zero-result query** — `noindex, follow`. Soft-404 territory.
- **Multi-term, non-zero results** (`/search?q=butterfly+tenergy+05`) — indexable. These are the long-tail queries that have actual SEO value.

The bare `/search` URL is **not** in the sitemap (only individual long-tail SERPs would be eligible, and we don't pre-enumerate them).

---

## Structured data (JSON-LD)

JSON-LD is the only structured-data format we ship. RDFa and microdata are explicitly out of scope.

### Where it lives

- **Schema generation:** `app/lib/schema.ts` (`SchemaService` class + `schemaService` singleton). Extend this file — never inline ad-hoc JSON-LD in a route.
- **Rendering:** `app/components/seo/StructuredData.tsx`. The component takes a single schema or an array and renders one `<script type="application/ld+json">`.
- **Global schemas:** `Organization` and `WebSite` are emitted from `app/root.tsx`'s `Layout`. They appear on every page. Don't re-emit them per route. The Layout reads `siteUrl` via `useRouteLoaderData("root")`; the hardcoded prod-host fallback only fires when the root loader itself errored (validateEnv would have already 503'd that case).

### JSON-LD escape rule (mandatory)

User-supplied content (review bodies, player bios, equipment descriptions) can contain `</script>` and break out of the JSON-LD block, leading to XSS. `SchemaService.toJsonLd` and `generateMultipleSchemas` both escape `<` → `<`. **Never** render JSON-LD via React Router's `script:ld+json` meta descriptor — at the time of writing it does not perform that escape. The two acceptable paths:

1. `<StructuredData schema={...} />` (which uses `schemaService` under the hood). Preferred — keeps the escape automatic.
2. Direct `JSON.stringify(...).replace(/</g, "\\u003c")` inside a `dangerouslySetInnerHTML` script tag, only when the schema must be assembled at the layout level (see `root.tsx`).

Anything else is a regression.

### Schema-per-page-type matrix

| Page type                                     | Schemas                                                                                  | Notes                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| All pages                                     | `Organization`, `WebSite`                                                                | Emitted from `root.tsx` Layout. Do not duplicate per-route.               |
| `/equipment/:slug`                            | `Product` (with nested `AggregateRating` + up to five `Review` items) + `BreadcrumbList` | Reviews are first-party-eligible per the third-party-review rule below.   |
| `/equipment/compare/:slugs`                   | `WebPage` + `ItemList` of two `Product`s                                                 | Use `generateComparisonSchema`.                                           |
| `/equipment` (listing)                        | `BreadcrumbList`                                                                         | No `ItemList` — the listing is too dynamic to keep stable.                |
| `/players/:slug`                              | `Person` + `BreadcrumbList`                                                              | `Person` only — biographical. **Do not** attach `Review` to player pages. |
| `/players` (listing)                          | `BreadcrumbList`                                                                         |                                                                           |
| `/`                                           | None beyond global.                                                                      | The home page isn't a single content entity.                              |
| `/search`, `/admin/*`, auth, `/submissions/*` | None.                                                                                    | Non-indexable.                                                            |

### Third-party-review eligibility

We host community reviews of independent manufacturers' equipment. Per Google's [first-party vs third-party review rule](https://developers.google.com/search/blog/2025/12/review-snippets-update), aggregator sites are eligible for review snippets when reviews are about independent products. We meet that bar — keep `Review` + `AggregateRating` on `/equipment/:slug`.

### Post-March-2026 Google rule

`Review` schema only fires on pages where reviews are the **primary visible content**. That means: `/equipment/:slug` (reviews are listed below the fold) is OK; an equipment listing page that only shows star averages is not — don't bolt a per-card `Review` onto listings even if the data exists.

### Adding a new schema

1. Add the TypeScript interface to `schema.ts`.
2. Add a `generate…Schema(input)` method on `SchemaService`.
3. Render via `<StructuredData schema={schemaService.generateXSchema(...)} />` in the route component (in the head section, typically inside the page wrapper).
4. Validate with the [Schema.org validator](https://validator.schema.org/) and Google's [Rich Results Test](https://search.google.com/test/rich-results) before merging.

---

## Sitemap

All sitemaps are generated dynamically. `SitemapService` (`app/lib/sitemap.server.ts`) provides the slice generators; per-route loaders compose them.

### Routes

- `/sitemap-index.xml` — the index. Lists the three per-type sitemaps with `lastmod = max(updated_at)` of each one's underlying content. **This is the URL to register in Search Console.** robots.txt advertises only this URL.
- `/sitemap-equipment.xml` — equipment detail pages plus the category / subcategory / manufacturer listing variants and the curated comparison pages.
- `/sitemap-players.xml` — one URL per active player. Inactive players are filtered out.
- `/sitemap-static.xml` — `/`, `/players`, `/equipment`, `/credits`. (`/search` is excluded — the bare path is always a thin SERP and flips to `noindex` per the rule above.)
- `/sitemap.xml` — legacy combined sitemap. **Kept for back-compat** in case any crawler has cached the URL. Not referenced from robots.txt. Don't add new content here that isn't also in a per-type sitemap.

Each per-type sitemap caps at 50K URLs (the spec hard cap). When any one approaches that, split it further (e.g. `sitemap-equipment-1.xml`, `sitemap-equipment-2.xml`) and update the index — no robots.txt change needed.

### What belongs in each sitemap

- All active players → `sitemap-players.xml`.
- All equipment → `sitemap-equipment.xml`.
- Category and subcategory listings → `sitemap-equipment.xml` (`/equipment?category=…[&subcategory=…]`).
- Manufacturer listings → `sitemap-equipment.xml` (`/equipment?manufacturer=…`, curated allow-list: Butterfly, DHS, TIBHAR, Yasaka, STIGA, Xiom, Donic).
- High-value comparison pages → `sitemap-equipment.xml`, capped at 50.
- Static pages → `sitemap-static.xml`.

### What must never appear in any sitemap

- Any URL that returns `noindex`.
- `/login`, `/logout`, `/reset-password`, `/auth/*`, `/admin/*`, `/profile`, `/submissions/*`, `/api/*`, `/e2e-*`.
- Draft / unpublished content. There is no draft state for equipment or players today; if one is added later, gate sitemap inclusion on the published flag.
- Slug-redirect _source_ URLs — only the canonical (current) slug appears. See "Slug-rename redirect history" below for the table.

### `lastmod`

`lastmod` is the only sitemap signal Google still uses (`<priority>` and `<changefreq>` are explicitly ignored — TT-155 dropped both from the XML output). Google's `lastmod` trust system is **binary**: once Google sees consistent inaccuracy on a site (every URL claims "today"), it ignores `lastmod` from this site entirely going forward, across every URL. There is no partial credit. So the rules below are not "polish" — getting them wrong actively burns SEO trust.

Bing's guidance is the same shape: the date "must be set to the date the linked page was last modified, not when the sitemap is generated." Bing also recommends regenerating sitemaps "at least daily"; our 1h cache more than satisfies this without lying about freshness.

#### What counts as "the page changed"

For aggregator pages (almost every indexable route here), the page's content includes child rows that don't bump the parent's `updated_at`. A new approved review on `/equipment/:slug` _is_ a substantive page change even though the equipment row is unchanged. Per Google staff guidance ("if comments are a critical part of your page, then using that date is fine"), reviews / videos / equipment-setups absolutely qualify — they are the reason these pages exist.

#### Per-page `lastmod` rules

| Surface                      | `lastmod` source                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/equipment/:slug`           | `max(equipment.updated_at, latest approved equipment_review.updated_at for this equipment)`                                 |
| `/players/:slug`             | `max(player.updated_at, latest player_equipment_setup.updated_at, latest active player_footage.updated_at for this player)` |
| `/equipment/compare/:slugs`  | `max(updated_at + latest review timestamp)` of both compared equipment items                                                |
| `/equipment` (listing root)  | sitewide max — see below                                                                                                    |
| `/players` (listing root)    | sitewide max                                                                                                                |
| `/`                          | sitewide max                                                                                                                |
| `/equipment?category=…`      | `max(equipment.updated_at)` across that category's slice                                                                    |
| `/equipment?…&subcategory=…` | `max(equipment.updated_at)` across that (category, subcategory) pair                                                        |
| `/equipment?manufacturer=…`  | `max(equipment.updated_at)` across that manufacturer's slice (curated allow-list — see "What belongs in each sitemap")      |
| `/credits`                   | hardcoded `CREDITS_LASTMOD` constant in `app/lib/sitemap.server.ts`; bump manually when the page copy actually changes      |

"Sitewide max" means the most recent timestamp across `equipment.updated_at`, `players.updated_at`, the equipment-review lastmod map, and the player-activity lastmod map. Computed by `SitemapService.computeSiteWideLastmod`. The home and listing-root pages legitimately reflect site-wide freshness — a new approved equipment row or player row _does_ change what's rendered on `/`, `/equipment`, `/players`.

The sitemap index (`/sitemap-index.xml`) uses `SitemapService.computeMaxLastmod(urls)` per slice so each `<sitemap>` entry's `lastmod` is the max of the URLs that slice contains. With per-row rules above already honest, this aggregation is automatically honest.

#### How the per-row maps are populated

Building the per-row "latest child content" timestamp the naive way (one PostgREST query per equipment row) blows the Cloudflare Workers Free 50-subrequest cap on prod (no enforcement locally — TT-145). Two `SECURITY DEFINER` RPCs collapse the fan-out to a single round-trip each:

- `get_equipment_review_lastmods()` → `{equipment_id: ISO timestamp}` of `MAX(updated_at)` over `equipment_reviews WHERE status = 'approved'`.
- `get_player_activity_lastmods()` → `{player_id: ISO timestamp}` of `MAX` across `player_equipment_setups.updated_at` and `player_footage.updated_at WHERE active = true`.

Both granted EXECUTE only to `service_role`; loaders call them via `fetchSitemapLastmodMaps(context)` (admin client). See `supabase/migrations/20260503171419_add_sitemap_lastmod_rpcs.sql`. Equipment / players with no child rows are absent from the map; callers fall back to the parent `updated_at` for those.

#### What not to do

- **Never** stamp `new Date().toISOString()` (or any "regenerated at" timestamp) into `<lastmod>`. Even on a single page type, this trains Google to treat all our `lastmod` as untrustworthy.
- **Never** include `<priority>` or `<changefreq>` in new sitemap output. Google ignores both; they only add bytes.
- **Don't** add a "updated when reviewed" extra column to dodge the per-row-map pattern. The RPC fan-out is the correct shape; it costs one subrequest per route, well under the 50-cap.

---

## robots.txt

Generated at `/robots.txt` (`app/routes/robots[.]txt.tsx`). `SITE_URL`-driven (already env-aware).

### Current rules

```
User-agent: *
Allow: /

Sitemap: <SITE_URL>/sitemap-index.xml

Disallow: /admin/
Disallow: /api/
Disallow: /login
Disallow: /logout
Disallow: /reset-password
Disallow: /auth/
Disallow: /profile
Disallow: /submissions/
Disallow: /e2e-

Allow: /players/
Allow: /equipment/

Crawl-delay: 1
```

The `Disallow:` block mirrors the `noindex` matrix above — robots.txt cuts crawl-budget waste; the per-route `noindex` meta + `X-Robots-Tag` header stop URLs from being indexed even when discovered. Belt-and-braces.

`Crawl-delay` is harmless and ignored by Google; leave it. Don't add per-bot rules unless we have a specific bot causing problems — the `User-agent: *` block applies to all.

---

## Performance — CWV requirements that affect SEO

Core Web Vitals influence rankings. The numbers below are merge-blocking, not aspirational.

| Metric                          | Target      | Notes                                                                                            |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| LCP (Largest Contentful Paint)  | ≤ 2.5s p75  | The LCP element on `/equipment/:slug` and `/players/:slug` is a hero image. See LCP rules below. |
| INP (Interaction to Next Paint) | ≤ 200ms p75 | Avoid heavy JS on first interaction.                                                             |
| CLS (Cumulative Layout Shift)   | ≤ 0.1 p75   | Always set explicit `width`/`height` (or aspect-ratio CSS) on images so they don't reflow.       |

### LCP image rules

For the hero image on detail pages, pass `priority` to `<LazyImage>`. That switches behaviour:

- `loading="eager"` (not `lazy` — defeats LCP).
- `fetchPriority="high"`.
- The IntersectionObserver is bypassed, so the fetch starts on first paint.

In addition, every hero needs:

- Explicit `width` and `height` attributes — fixes CLS, lets the browser reserve space. The values describe the **intrinsic** source image's aspect ratio; visual rendered size is still controlled by Tailwind classes on the wrapper. Pass them as the `width` / `height` props to `LazyImage`.
- `srcSet` and `sizes` so the browser picks the smallest variant that fills the rendered box.
- `alt` text — non-empty, descriptive (equipment name + manufacturer, or player name).
- No client-side data-fetch in the LCP critical path. Loader data → SSR'd `<img>` is the only acceptable pattern.

### Image transformation pipeline

Both equipment and player images are served by routing the canonical R2-backed URL through Cloudflare Image Resizing — the `/cdn-cgi/image/<options>/<source-path>` URL pattern is intercepted at the edge and resized + format-converted (WebP / AVIF as supported) before the Worker ever sees it.

- **Equipment** images use `buildEquipmentImageUrl(key, variant, trimKind)` (single URL) and `buildEquipmentImageSrcSet(key, trimKind)` (full srcset). Variants are `thumbnail` (256w), `card` (512w), `full` (1024w). `trimKind` adds `,trim=border` so Cloudflare auto-trims the dominant border colour. Always emit the trim flag when the equipment row's `image_trim_kind` is non-null.
- **Player** images use `buildPlayerImageUrl(key, etag, width)` and `buildPlayerImageSrcSet(key, etag)`. Player widths are `144 / 288 / 576`, sized for the headshot box. The `etag` query param survives the transform pipeline as a cache-buster — keep passing it.

If the source image is missing (`image_key` is null), fall back to `<ImagePlaceholder>` rather than rendering a broken `<img>`.

Below-the-fold images (review thumbnails, related-equipment grids, credits page tiles) stay on `loading="lazy"` and don't need `srcSet` — they're not on the LCP path. They still need explicit `width`/`height` so they don't reflow when they finally load.

If we ever switch off Cloudflare Image Resizing onto Cloudflare Images proper (with stored variants instead of on-demand transforms), the helpers above are the single place to update; callers don't change.

### Fonts

Inter is loaded from Google Fonts in `app/root.tsx` `links`. Keep `preconnect` to `fonts.googleapis.com` and `fonts.gstatic.com` (already in place). The `&display=swap` query param ensures `font-display: swap`, which keeps text visible during font load.

### No client-side data fetches on detail pages

`/equipment/:slug`, `/players/:slug`, comparison pages — every primary content element must come from the route loader. A `useEffect`-driven fetch on the detail page is a CWV / SEO regression: bots see an empty shell and the LCP element shifts in late.

---

## E-E-A-T surface signals

Google rewards visible expertise/authority signals on detail pages. JSON-LD alone isn't enough — the signals must be rendered HTML.

### `/equipment/:slug` per review (`ReviewCard`)

- Reviewer-context badges above the review text — `playing_level`, `style_of_play`, `testing_duration` rendered as small pills (data-testid: `review-eeat-badges`). Pulled from the `reviewer_context` JSONB; the same fields stay in the detailed "Reviewer Context" footer.
- Review's `datePublished` wrapped in `<time datetime="ISO">{human}</time>` so the structured-data published date and the visible date come from the same source.
- **Reviewer display name** — currently **not rendered**. `public.profiles` was dropped in TT-128; surfacing reviewer names requires rebuilding a public profile route, which is outside the scope of TT-142. Don't render an unauthenticated user's email as a fallback. Rebuild a public profile surface (separate ticket) and add the reviewer-name + link at that point.

### `/players/:slug`

- "Last updated" with `<time datetime>` under the player name, driven by `players.updated_at`.
- Source links on every equipment-change row — `EquipmentTimeline.tsx` renders `setup.source_url` as an anchor when present. Keep it that way; don't strip into plain text.

### `/equipment/:slug` page chrome

- "Last updated" with `<time datetime>` under the title, driven by `equipment.updated_at`.
- Number of reviews + average rating, both rendered as text via `RatingStars`.

All of these must be visible text. Don't make them collapse-default or screen-reader-only.

---

## OG image (TT-138)

Dynamic OG cards (1200×630 PNG) for detail and comparison pages, plus three static fallbacks for everything else. All routes go through the same workers-og pipeline so the visual treatment stays consistent — the only difference is whether the data comes from a slug-keyed loader or a fixed string.

### Tool: workers-og

We use [`workers-og`](https://github.com/kvnang/workers-og) (Satori + resvg-wasm via Cloudflare-compatible bundling). `@vercel/og` was rejected: it bundles WASM via Vercel's edge runtime and **doesn't run on standalone Cloudflare Workers** — only on Cloudflare Pages via the official Pages plugin. We're on Workers (`workers/app.ts` + custom domain), so the Pages path doesn't apply.

The pipeline lives in `app/lib/og/render.server.ts`:

- **Renderer:** `renderOgImage(html, options, ctx)` — accepts a Satori-compatible HTML string, returns a `Response` with `Content-Type: image/png` and our standard cache headers.
- **Hero images:** Satori's internal fetch fails silently on Workers (one of the [documented pitfalls](https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle)). The route loader pre-fetches the source image (forcing PNG via `/cdn-cgi/image/format=png`) and embeds it as a base64 data URL via `fetchImageAsDataUrl(...)`.
- **Fonts:** Inter (400 + 700) fetched from Google Fonts on cold start, cached in the Cloudflare Cache API under a versioned key. Every isolate after the first hits the cache.
- **Bundle cost:** workers-og + WASM modules add ~700KB compressed, putting the prod bundle around 1.1MB / 3MB Free-plan ceiling. Comfortable.

### Route → OG image map

| Route                              | Image URL                            | Source                                           |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------ |
| `/`                                | `/og/default.png`                    | static fallback (route file).                    |
| `/equipment`                       | `/og/equipment.png`                  | static fallback (route file).                    |
| `/equipment/:slug`                 | `/og/equipment/<slug>.png`           | dynamic — name + manufacturer + rating + hero.   |
| `/equipment/compare/:slugs`        | `/og/compare/<slug1>-vs-<slug2>.png` | dynamic — names + ratings side-by-side.          |
| `/players`                         | `/og/players.png`                    | static fallback (route file).                    |
| `/players/:slug`                   | `/og/players/<slug>.png`             | dynamic — name + nationality + style + headshot. |
| `/credits`, productive `/search`   | `/og/default.png`                    | static fallback.                                 |
| Thin `/search`, all noindex routes | none                                 | no `og:image` emitted.                           |

The "static fallbacks" are still served by `workers-og` at request time — they live at `app/routes/og.<kind>[.]png.tsx`, but cache `public, max-age=31536000, immutable` so the CDN serves them as if they were build-time assets. The trade-off is +1 visual-pipeline-to-maintain vs −1 build-step. Net: one rendering pipeline, deploy invalidates everything.

### Caching rules

- **Dynamic routes:** `Cache-Control: public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000`. ETag from the underlying entity's `updated_at` (compare uses the max of both rows). Slug rename → fresh URL automatically.
- **Static fallbacks:** `Cache-Control: public, max-age=31536000, immutable`. Redeploys invalidate the CDN cache.
- **Font cache:** Cloudflare Cache API, `public, max-age=31536000, immutable`. Versioned key (`og-fonts:inter:v1:<weight>`) lets a font swap force a refetch without cache surgery.

### Constraints

- 1200×630 PNG. Real renders land at ~30–40KB; well under any platform's per-image cap.
- Image URL **must** be absolute (use `getSiteUrl(matches)` + `buildOgImageUrl(siteUrl, path)`). Relative URLs do not work for `og:image`.
- HTML passed to `renderOgImage` must be Satori-compatible: every container needs explicit `display: flex`, dimensions are absolute, no CSS shorthand quirks. Font family is `Inter` (only weights we ship).
- `twitter:image` shares the URL with `og:image`. `ogImageMeta` emits both in one shot.

---

## Slug-rename redirect history

When an equipment or player slug changes — rename, typo fix, manufacturer rebrand — the old URL keeps 301-forwarding to the new one. Without this, link equity / Google indexing signal accumulated against the old URL is lost.

How it's wired:

1. `slug_redirects` table holds `(entity_type, old_slug, new_slug, created_by, created_at)` rows. `(entity_type, old_slug)` is unique; `old_slug <> new_slug` is enforced. RLS: read public, write admin/service-role.
2. `/equipment/:slug` and `/players/:slug` loaders call `findSlugRedirect(client, type, slug)` from `app/lib/slug-redirects.server.ts` whenever the entity row doesn't resolve. A hit → `throw redirect("/equipment/<new>", { status: 301 })`. A miss falls through to the existing 404 redirect.
3. The equipment-edit applier (`app/lib/admin/equipment-edit-applier.server.ts`) calls `recordSlugRedirect(client, "equipment", oldSlug, newSlug, moderatorId)` after a successful rename. The applier is invoked from both the admin route and the Discord 2nd-approval moderation path, so both flows record the redirect automatically. A failure to record the redirect is logged via `Logger.error` inside the applier and does **not** short-circuit the post-update R2 cleanup — the rename UPDATE has landed and is correct; only the back-link is missing. Player slug renames aren't currently exposed through any flow but the lookup is wired up — drop a row into `slug_redirects` directly and the 301 kicks in.
4. `recordSlugRedirect` handles three subtle cases sequentially (not transactional — see code comment for the failure semantics):
   - Drops any existing redirect whose `old_slug` equals the new slug (the "renamed back to A" case where the entity now resolves at A directly and a stale row would shadow it).
   - Updates every redirect that pointed AT the old slug to point at the new slug, collapsing chains so every old URL forwards in one hop.
   - Upserts the `(oldSlug → newSlug)` row.
5. Sitemap and JSON-LD only emit the **current canonical** slug. Old slugs never appear in the sitemap.
6. Always 301, never 302. 301 is permanent; Google passes link equity through it. 302 doesn't.

Don't repurpose old slugs for different content — once a slug has been used, the redirect entry is effectively forever. If a manufacturer reuses a model name, give it a `-2` suffix or a year; don't reuse the original slug.

---

## Checklist — before merging a user-facing route change

Run through this on every PR that touches `app/routes/` (or that adds/modifies a route's loader/component output that would change what's in the head):

- [ ] `meta()` exports `title` (≤ 60 chars), `description` (≤ 155 chars), and a `canonical` link descriptor produced by `buildCanonicalUrl(getSiteUrl(matches), pathname, search, allowList)` from `app/lib/seo.ts`.
- [ ] OG tags present: `og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`, `og:image`, `og:image:width=1200`, `og:image:height=630`.
- [ ] Twitter tags present: `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- [ ] og:image / twitter:image emitted via `ogImageMeta(...)` from `app/lib/seo.ts` (don't roll the seven descriptors by hand). Image URL is absolute, built via `buildOgImageUrl(siteUrl, path)`. Detail routes point at the dynamic generator (`/og/<kind>/<slug>.png`); listings and static pages use a fallback (`/og/default.png` / `/og/equipment.png` / `/og/players.png`).
- [ ] `robots` meta is correct per the indexability matrix. Admin routes also rely on the Worker-entry `X-Robots-Tag` header (no per-route action needed).
- [ ] If indexable, route is included in the right per-type sitemap (`sitemap-equipment.xml` / `sitemap-players.xml` / `sitemap-static.xml`) — and therefore in `/sitemap-index.xml`. If not indexable, route is **not** in any sitemap.
- [ ] If indexable, structured data via `<StructuredData />`, schema generated by `SchemaService`. If route renders user-supplied text inside JSON-LD, the `<` escape is in place (`schemaService.toJsonLd` / `generateMultipleSchemas` handle this for you).
- [ ] If the route renders an LCP image: pass `priority` to `<LazyImage>` (eager + `fetchPriority="high"` + IntersectionObserver bypass), with explicit `width` / `height` / `srcSet` / `sizes` props and a descriptive `alt`.
- [ ] No client-side fetch on the LCP path.
- [ ] If the route introduces a new slug shape, slug renames flow through `recordSlugRedirect` in the applier and `findSlugRedirect` in the loader; the loader returns `301` for old slugs before `404`.
- [ ] If a new env var is required for any of the above, register it in `validateEnv` (`app/lib/env.server.ts`) per `CLAUDE.md` — see "Environment variables".
- [ ] Validated with the Rich Results Test for at least one representative URL per route pattern.

When in doubt, the answer is "match what `/equipment/:slug` does" — that's the most-thoroughly-instrumented route and the closest to the standard.

---

## Reference files

- `app/lib/seo.ts` — `getSiteUrl(matches)` + `buildCanonicalUrl(siteUrl, pathname, search, allowList)`. Used by every indexable route's `meta()`.
- `app/lib/schema.ts` — `SchemaService` and `schemaService` singleton.
- `app/components/seo/StructuredData.tsx` — JSON-LD render component.
- `app/lib/sitemap.server.ts` — `SitemapService`, `computeMaxLastmod`, baseUrl threaded via `getSitemapService(context)`.
- `app/routes/sitemap-index[.]xml.tsx` — the sitemap-index loader (canonical discovery URL).
- `app/routes/sitemap-equipment[.]xml.tsx`, `sitemap-players[.]xml.tsx`, `sitemap-static[.]xml.tsx` — per-type sitemaps.
- `app/routes/sitemap[.]xml.tsx` — legacy combined sitemap; back-compat only.
- `app/routes/robots[.]txt.tsx` — robots.txt generator.
- `app/lib/slug-redirects.server.ts` — `findSlugRedirect` (loader-side) + `recordSlugRedirect` (applier-side).
- `app/lib/env.server.ts` — `getEnvVar`, `validateEnv`, `SITE_URL` requirement.
- `app/root.tsx` — global schemas (`Organization`, `WebSite`); root loader exposes `siteUrl`; Layout reads it via `useRouteLoaderData("root")`.
- `app/components/ui/LazyImage.tsx` — image component with the `priority` opt-in for above-the-fold heroes.
- `app/lib/imageUrl.ts` — `buildEquipmentImageUrl` / `buildEquipmentImageSrcSet` / `buildPlayerImageUrl` / `buildPlayerImageSrcSet`.
- `workers/app.ts` — `X-Robots-Tag: noindex, nofollow` injection on `/admin/*` responses.
