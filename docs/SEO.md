# SEO — single source of truth

This doc is the contract every user-facing route on this site has to satisfy. If a rule lives here, the route follows it; if a rule belongs here and isn't yet, fix it here first and then in code. CLAUDE.md gates user-facing route work on reading this doc, mirroring the `docs/CODING-STANDARDS.md` gate.

This is the technical SEO standard. Audience research, content strategy, and keyword targeting are out of scope — they're product calls, not engineering rules.

The audit underlying TT-134 found the structured-data foundation strong (`app/lib/schema.ts` + `app/components/seo/StructuredData.tsx` ship Product/AggregateRating/Review/BreadcrumbList/Organization/Person correctly) but several systemic gaps. Those gaps have one card each (TT-135 → TT-143). Where a section below references behaviour we don't yet ship, the relevant TT-card is named inline so contributors know which child item is closing the gap.

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

- Slugs are stable identifiers. Treat a rename as a redirect-source: every old slug we've ever published must keep redirecting to the current canonical URL **(TT-141)**. New slugs get a row in the slug-history table; old paths return `301`.
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

```ts
export function meta({ data, location, matches }: Route.MetaArgs) {
  // siteUrl comes from root loader data (TT-137).
  const siteUrl = matches.find(m => m.id === "root")?.data.siteUrl;
  const canonical = `${siteUrl}${location.pathname}`;

  return [
    { title: /* ≤ 60 chars, unique per page */ },
    { name: "description", content: /* ≤ 155 chars, unique per page */ },
    { tagName: "link", rel: "canonical", href: canonical },

    { property: "og:title", content: /* may differ from <title> for social */ },
    { property: "og:description", content: /* same as description, or shorter */ },
    { property: "og:type", content: /* "website" | "article" | "product" | "profile" */ },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: "TT Reviews" },
    { property: "og:image", content: `${siteUrl}/og/<route-key>.png` }, // TT-138

    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: /* same as og:title */ },
    { name: "twitter:description", content: /* same as og:description */ },
    { name: "twitter:image", content: `${siteUrl}/og/<route-key>.png` }, // TT-138
  ];
}
```

Rules:

- **`title`** ≤ 60 chars. Format: `<page-specific>… | TT Reviews`. Brand on the right; never repeat the brand mid-title.
- **`description`** ≤ 155 chars. No keyword stuffing. One sentence describing what's on the page.
- **`canonical`** is **absolute** and **env-driven** (`SITE_URL`). Hardcoding hosts is a regression — `validateEnv` already requires `SITE_URL` (`app/lib/env.server.ts`). The hardcoded fallback at `app/root.tsx:43` is what TT-137 closes.
- **`og:url`** matches `canonical`.
- **`og:image`** must be 1200×630 absolute URL. Every route below "minimal" must declare one; a static fallback at `/og/default.png` covers routes without bespoke art (TT-138).
- **`keywords`** is dead — Google ignores it. Existing `meta()` exports keep populating it; they're harmless but new routes don't need it.
- Meta values must be derived from loader data, never from `document.location` or `window` — `meta()` runs on the server.

### Indexability — the `noindex` matrix

`noindex` is a `<meta name="robots">` tag, **not** a robots.txt rule. robots.txt stops a crawler fetching the page; it does not stop Google indexing the URL when it's discovered via inbound links. Anything in this table needs the meta tag whether or not robots.txt also blocks it. (TT-136 closes the gaps.)

| Route                                                                                                        | `robots` meta                | Why                                                         |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------- |
| `/`, `/equipment`, `/equipment/:slug`, `/equipment/compare/:slugs`, `/players`, `/players/:slug`, `/credits` | `index, follow`              | Primary content — the reason the site exists.               |
| `/equipment/compare` (landing without slugs)                                                                 | `noindex, follow`            | Picker UI, no content.                                      |
| `/search`                                                                                                    | `noindex, follow` (TT-143)   | Thin SERPs duplicate the listing.                           |
| `/admin/*`                                                                                                   | `noindex, nofollow` (TT-136) | Admin tooling — never indexable.                            |
| `/login`, `/logout`, `/reset-password`, `/auth/*`, `/profile`, `/submissions/*`                              | `noindex, nofollow` (TT-136) | Authed-only or bounce pages.                                |
| `/e2e-health`, `/e2e-trigger-error`                                                                          | `noindex, nofollow`          | Test fixtures — would be `404` in prod ideally.             |
| `/api/*`                                                                                                     | n/a                          | Returns JSON — not HTML. Remains `Disallow:` in robots.txt. |
| `/$.tsx` (404 catch-all)                                                                                     | `noindex, follow`            | Don't fingerprint 404s.                                     |

The pattern in code:

```ts
return [
  // ...title, description, etc...
  { name: "robots", content: "noindex, nofollow" },
];
```

When in doubt: if a logged-out user shouldn't see this page, it's `noindex`.

---

## Structured data (JSON-LD)

JSON-LD is the only structured-data format we ship. RDFa and microdata are explicitly out of scope.

### Where it lives

- **Schema generation:** `app/lib/schema.ts` (`SchemaService` class + `schemaService` singleton). Extend this file — never inline ad-hoc JSON-LD in a route.
- **Rendering:** `app/components/seo/StructuredData.tsx`. The component takes a single schema or an array and renders one `<script type="application/ld+json">`.
- **Global schemas:** `Organization` and `WebSite` are emitted from `app/root.tsx`'s `Layout`. They appear on every page. Don't re-emit them per route. The hardcoded `siteUrl` in that block is what TT-137 will replace with loader data threaded through `useRouteLoaderData("root")`.

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
| `/equipment` (listing)                        | `BreadcrumbList` (TT-143)                                                                | No `ItemList` — the listing is too dynamic to keep stable.                |
| `/players/:slug`                              | `Person` + `BreadcrumbList`                                                              | `Person` only — biographical. **Do not** attach `Review` to player pages. |
| `/players` (listing)                          | `BreadcrumbList` (TT-143)                                                                |                                                                           |
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
- `/sitemap-static.xml` — `/`, `/players`, `/equipment`, `/search`, `/credits`. (TT-143 will drop `/search` when the route flips to `noindex`.)
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
- `/login`, `/logout`, `/reset-password`, `/auth/*`, `/admin/*`, `/profile`, `/submissions/*`, `/api/*`, `/e2e-*`. (TT-139 dropped `/login` from `generateStaticPages()`.)
- Draft / unpublished content. There is no draft state for equipment or players today; if one is added later, gate sitemap inclusion on the published flag.
- Slug-redirect _source_ URLs (TT-141) — only the canonical (current) slug appears.

### `lastmod`

- Per-row sitemap entries set `lastmod` from `updated_at`. Don't fall back to `now`.
- Static pages use `now` for `lastmod`. Acceptable — they don't really change.
- The sitemap index uses `SitemapService.computeMaxLastmod(urls)` per slice so each entry's `lastmod` reflects its content's actual freshness, not the response time.

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
Allow: /search

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

### LCP image rules (TT-140)

For the hero image on detail pages:

- `loading="eager"` (not `lazy` — defeats LCP).
- `fetchpriority="high"`.
- Explicit `width` and `height` attributes — fixes CLS, lets the browser reserve space.
- `srcset` covering the breakpoints we actually use; `sizes` reflects the layout.
- `alt` text is non-empty and descriptive (equipment name + manufacturer, or player name).
- Format: WebP with AVIF where supported. We serve via `/api/images/$` — see that route for the resize/format pipeline.
- No client-side data-fetch should be in the LCP critical path. Loader data → SSR'd `<img>` tag is the only acceptable pattern.

Lazy-load anything below the fold (`loading="lazy"`).

### Fonts

Inter is loaded from Google Fonts in `app/root.tsx` `links`. Keep `preconnect` to `fonts.googleapis.com` and `fonts.gstatic.com` (already in place). The `&display=swap` query param ensures `font-display: swap`, which keeps text visible during font load.

### No client-side data fetches on detail pages

`/equipment/:slug`, `/players/:slug`, comparison pages — every primary content element must come from the route loader. A `useEffect`-driven fetch on the detail page is a CWV / SEO regression: bots see an empty shell and the LCP element shifts in late.

---

## E-E-A-T surface signals (TT-142)

Google rewards visible expertise/authority signals on detail pages. JSON-LD alone isn't enough — the signals must be rendered HTML.

### Required on `/equipment/:slug` per review

- Reviewer's playing-level / skill-rating (data is in `equipment_reviews` already; surface it next to the rating).
- Reviewer's display name as a link to their profile (or "Anonymous" without a link).
- `datePublished`, formatted in the page locale.

### Required on `/players/:slug`

- "Last updated" timestamp on the equipment-history block (we have `updated_at` in `players`; render it).
- Source links on every equipment-change row — already a column in `player_equipment_setups`; just make sure it renders as an anchor when present.

### Required on `/equipment/:slug` page chrome

- "Last updated" timestamp on the page (`equipment.updated_at`).
- Number of reviews + average rating, both rendered as text (already in place; keep it).

These all need to appear as visible text. Don't make them collapse-default or screen-reader-only.

---

## OG image (TT-138)

A static `/og/default.png` (1200×630) goes in `public/og/` as the universal fallback. Bespoke images are generated per-route on demand.

### Route → OG image plan

| Route                       | Image                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | `/og/default.png`                                                                                                                                                       |
| `/equipment`                | `/og/equipment.png` (static, brandy)                                                                                                                                    |
| `/equipment/:slug`          | `/og/equipment/<slug>.png` — generated at build or on first request via Cloudflare Workers + the `imageUrl` pipeline. Includes equipment name, manufacturer, hero shot. |
| `/equipment/compare/:slugs` | `/og/compare/<slug1>-vs-<slug2>.png` — both equipment names side-by-side.                                                                                               |
| `/players/:slug`            | `/og/players/<slug>.png` — player name + "Equipment & Setup".                                                                                                           |
| Everything else             | `/og/default.png`.                                                                                                                                                      |

### Constraints

- 1200×630 PNG or JPG. Under 8MB but realistically aim for ~150KB.
- Image URL **must** be absolute (use `SITE_URL`). Relative URLs do not work for `og:image`.
- Cache headers: long max-age, immutable; bust via slug when the underlying entity changes.

`twitter:image` shares the same URL.

---

## Slug-rename redirect history (TT-141)

When an equipment or player slug changes — rename, typo fix, manufacturer rebrand:

1. The old slug goes into a `slug_redirects` table keyed by `(content_type, old_slug)` → `current_slug`.
2. `/equipment/:slug` and `/players/:slug` loaders check `slug_redirects` on miss; if a redirect exists, return a `301` to the canonical URL with the current slug. Only return `404` when neither table resolves.
3. The sitemap only emits the **current** slug. Old slugs disappear from the sitemap immediately.
4. The `301` is permanent and cacheable; don't use `302`.

Don't repurpose old slugs for different content — the redirect entry is forever.

---

## Checklist — before merging a user-facing route change

Run through this on every PR that touches `app/routes/` (or that adds/modifies a route's loader/component output that would change what's in the head):

- [ ] `meta()` exports `title` (≤ 60 chars), `description` (≤ 155 chars), `canonical` (absolute, env-driven).
- [ ] OG tags present: `og:title`, `og:description`, `og:type`, `og:url`, `og:site_name`, `og:image` (absolute).
- [ ] Twitter tags present: `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`.
- [ ] `robots` meta is correct per the indexability matrix.
- [ ] If indexable, route is in `/sitemap.xml`. If not indexable, route is **not** in the sitemap.
- [ ] If indexable, structured data via `<StructuredData />`, schema generated by `SchemaService`. If route renders user-supplied text inside JSON-LD, the `<` escape is in place.
- [ ] If the route renders an LCP image: `loading="eager"`, `fetchpriority="high"`, explicit dimensions, `srcset`, descriptive `alt`.
- [ ] No client-side fetch on the LCP path.
- [ ] If the route introduces a new slug shape, `slug_redirects` is updated for renames; the loader returns `301` for old slugs before `404`.
- [ ] If a new env var is required for any of the above, register it in `validateEnv` (`app/lib/env.server.ts`) per `CLAUDE.md` — see "Environment variables".
- [ ] Validated with the Rich Results Test for at least one representative URL per route pattern.

When in doubt, the answer is "match what `/equipment/:slug` does" — that's the most-thoroughly-instrumented route and the closest to the standard.

---

## Reference files

- `app/lib/schema.ts` — `SchemaService` and `schemaService` singleton.
- `app/components/seo/StructuredData.tsx` — JSON-LD render component.
- `app/lib/sitemap.server.ts` — `SitemapService`, baseUrl threaded via `getSitemapService(context)`.
- `app/routes/sitemap[.]xml.tsx` — the sitemap loader.
- `app/routes/sitemap-index[.]xml.tsx` — the sitemap-index loader.
- `app/routes/robots[.]txt.tsx` — robots.txt generator.
- `app/lib/env.server.ts` — `getEnvVar`, `validateEnv`, `SITE_URL` requirement.
- `app/root.tsx` — global schemas (`Organization`, `WebSite`); root loader exposes `siteUrl`.
