// SEO helpers for meta() exports.
//
// Two responsibilities:
// - resolve the site's canonical origin from root loader data so it
//   tracks env.SITE_URL on previews/prod (closes the TODO that lived
//   at root.tsx:42 hardcoding "https://tabletennis.reviews");
// - build a canonical URL with a deterministic, allow-listed query
//   string so listing pages don't fragment indexing across utm params,
//   reorderings, or sort/filter combinations Google would treat as
//   distinct pages.
//
// See docs/SEO.md for the per-route canonical rules.

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
