// SEO helpers for meta() exports.
//
// Three responsibilities:
// - resolve the site's canonical origin from root loader data so it
//   tracks env.SITE_URL on previews/prod (closes the TODO that lived
//   at root.tsx:42 hardcoding "https://tabletennis.reviews");
// - build a canonical URL with a deterministic, allow-listed query
//   string so listing pages don't fragment indexing across utm params,
//   reorderings, or sort/filter combinations Google would treat as
//   distinct pages;
// - build the og:image / twitter:image meta descriptors so every
//   indexable route emits the same shape (TT-138). The image URL is
//   absolute (the spec is unambiguous: og:image and twitter:image
//   require absolute URLs) and route-specific (dynamic per-slug for
//   detail pages, static fallbacks for listings).
//
// See docs/SEO.md for the per-route canonical and OG-image rules.

const PROD_SITE_URL_FALLBACK = "https://tabletennis.reviews";

// Shape we read from the root loader. Kept loose because meta()'s
// `matches` array is generated as a tuple per route — including
// possibly-undefined entries for parents — so pinning to a stricter
// type would force a per-route generic on every caller.
type RootMatchData = { siteUrl?: string } | undefined;

interface MatchLike {
  id: string;
  data?: unknown;
}

/**
 * Pull the absolute origin (no trailing slash) from the root loader's
 * data. Falls back to the production host if root data is missing —
 * which only happens when the root loader itself errored, in which
 * case validateEnv would already have 503'd the request.
 */
export function getSiteUrl(
  matches: readonly (MatchLike | undefined)[]
): string {
  const root = matches.find(m => m?.id === "root");
  const data = root?.data as RootMatchData;
  return data?.siteUrl ?? PROD_SITE_URL_FALLBACK;
}

/**
 * Build a canonical URL.
 *
 * Detail pages pass an empty `allowList` and get `${siteUrl}${pathname}`
 * — no query string. Listing pages pass the params they want preserved
 * (e.g. ["category", "subcategory", "manufacturer", "page"]); anything
 * not in the list is stripped. Order in the returned URL follows
 * `allowList`, so two equivalent listings produce byte-identical
 * canonicals regardless of the order the user typed them.
 */
export function buildCanonicalUrl(
  siteUrl: string,
  pathname: string,
  search: string,
  allowList: readonly string[] = []
): string {
  if (allowList.length === 0) {
    return `${siteUrl}${pathname}`;
  }
  const params = new URLSearchParams(search);
  const filtered = new URLSearchParams();
  for (const key of allowList) {
    const value = params.get(key);
    if (value !== null && value !== "") {
      filtered.set(key, value);
    }
  }
  const query = filtered.toString();
  return query ? `${siteUrl}${pathname}?${query}` : `${siteUrl}${pathname}`;
}

// OG image dimensions — match app/lib/og/render.server.ts. Both have to
// agree because og:image:width / og:image:height appear in meta tags
// independently of the actual rendered image.
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Resolve the absolute OG image URL for a route.
 *
 * Detail routes pass the dynamic generator path (e.g. `/og/equipment/<slug>.png`);
 * listings/static pages pass `/og/<kind>.png` for the cached fallback.
 * Unknown values fall through to `/og/default.png` so a routing typo
 * still yields a valid card.
 */
export function buildOgImageUrl(siteUrl: string, path: string): string {
  if (!path.startsWith("/")) {
    return `${siteUrl}/og/default.png`;
  }
  return `${siteUrl}${path}`;
}

interface OgMetaInput {
  siteUrl: string;
  // og:title / twitter:title — usually shorter and punchier than the
  // SEO <title>. The card image carries the primary brand mark, so the
  // og:title is what shows under it in the social preview.
  title: string;
  // og:description / twitter:description.
  description: string;
  // Absolute URL of the OG image. Use buildOgImageUrl() to construct.
  imageUrl: string;
}

// Exported so route-level `meta()` exports can declare their return
// type without TS4058 (referencing a non-exported alias from this
// module). Matches React Router v7's MetaDescriptor for property/name
// pairs — we only emit content-bearing meta, not link descriptors.
export interface OgMetaDescriptor {
  property?: string;
  name?: string;
  content: string;
}

/**
 * Build the og:image + twitter:* meta descriptors for an indexable route.
 *
 * Routes still own their own og:title / og:description / og:url tags —
 * those depend on per-route data (canonical URL, etc.). This helper
 * covers only the image-related fields that are otherwise identical
 * everywhere.
 *
 * Returns 7 descriptors that callers spread into their meta() return
 * value:
 *   og:image, og:image:width, og:image:height,
 *   twitter:card, twitter:image, twitter:title, twitter:description.
 */
export function ogImageMeta(input: OgMetaInput): OgMetaDescriptor[] {
  return [
    { property: "og:image", content: input.imageUrl },
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: input.imageUrl },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
  ];
}
