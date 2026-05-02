import type { Route } from "./+types/search";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { SearchHeader } from "~/components/search/SearchHeader";
import { SearchResults } from "~/components/search/SearchResults";
import { NoResults } from "~/components/search/NoResults";
import { SearchLanding } from "~/components/search/SearchLanding";
import {
  buildCanonicalUrl,
  buildOgImageUrl,
  getSiteUrl,
  ogImageMeta,
} from "~/lib/seo";

const SEARCH_LISTING_PARAMS = ["q"] as const;

// TT-143. Thin search SERPs duplicate the underlying listing data
// without adding indexable value. We let multi-term productive
// queries stay in the index (those are real long-tail value), and
// noindex everything else: empty bar, single-token (often a brand
// or category that has its own canonical landing), and zero-result
// pages (Google's textbook soft-404 trigger).
function isThinSerp(query: string, resultCount: number): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return true;
  if (resultCount === 0) return true;
  return false;
}

export function meta({ data, matches, location }: Route.MetaArgs) {
  const query = data?.query ?? "";
  const resultCount = data?.resultCount ?? 0;
  const thin = isThinSerp(query, resultCount);
  const siteUrl = getSiteUrl(matches);
  const canonical = buildCanonicalUrl(
    siteUrl,
    location.pathname,
    location.search,
    SEARCH_LISTING_PARAMS
  );
  // OG image: only attach on indexable SERPs. Thin SERPs are noindex and
  // shouldn't be cluttering social previews either; if a thin SERP gets
  // shared, the share-target meta-resolver still falls back to the site
  // default via the absence of og:image.
  const ogImageUrl = thin ? null : buildOgImageUrl(siteUrl, "/og/default.png");

  // robots only fires on the noindex side — productive SERPs default
  // to "index, follow" without an explicit tag (browsers treat the
  // absence as indexable).
  const robotsMeta = thin
    ? [{ name: "robots", content: "noindex, follow" }]
    : [];

  if (query) {
    const title = `Search Results for "${query}" | TT Reviews`;
    const description = `Find table tennis equipment and players matching "${query}". Browse reviews, specs, and professional setups.`;
    return [
      { title },
      { name: "description", content: description },
      {
        name: "keywords",
        content: `${query}, table tennis equipment, player search, equipment reviews`,
      },
      { tagName: "link", rel: "canonical", href: canonical },
      { property: "og:url", content: canonical },
      ...(ogImageUrl
        ? ogImageMeta({ siteUrl, title, description, imageUrl: ogImageUrl })
        : []),
      ...robotsMeta,
    ];
  }

  const title = "Search Table Tennis Equipment & Players | TT Reviews";
  const description =
    "Search our comprehensive database of table tennis equipment reviews and professional player setups.";
  return [
    { title },
    { name: "description", content: description },
    {
      name: "keywords",
      content:
        "table tennis search, equipment search, player search, ping pong gear",
    },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:url", content: canonical },
    ...(ogImageUrl
      ? ogImageMeta({ siteUrl, title, description, imageUrl: ogImageUrl })
      : []),
    ...robotsMeta,
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  let results = null;

  if (query && query.trim()) {
    const db = new DatabaseService(context);
    const searchResults = await db.search(query.trim());
    results = searchResults;
  }

  // resultCount is read by meta() to decide noindex vs indexable on
  // the SERP — has to come from the loader because meta() doesn't
  // get the request URL or DB access (TT-143).
  const resultCount = results
    ? results.equipment.length + results.players.length
    : 0;

  return data({
    query: query || "",
    results,
    resultCount,
  });
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, results } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Search", href: "/search" },
  ];

  const hasResults =
    results && (results.equipment.length > 0 || results.players.length > 0);
  const totalResults = results
    ? results.equipment.length + results.players.length
    : 0;

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <SearchHeader query={query} totalResults={totalResults} />

      {hasResults ? (
        <SearchResults results={results} />
      ) : query ? (
        <NoResults query={query} />
      ) : (
        <SearchLanding />
      )}
    </PageLayout>
  );
}
